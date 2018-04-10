'use strict';
const fs   = require( 'fs' );
const path = require( 'path' );
const gulp = require( 'gulp' );

const CONTENT_DIR  = 'content';
const CONTENT_FILE = 'content.json';

const MD_TITLE_REGEXP     = /^# /;
const MD_SUBTITLE_REGEXP  = /^## /;
const MD_LIST_ITEM_REGEXP = /^\* /;
const MD_LINK_REGEXP      = /\[(.*?)]\((.*?)\)/;

gulp.task( 'default', cb => {
    const version = formRevisionVersion();

    const sections = getContentSections();

    const content = sections.map( sectionID => {
        const sectionContent = readSectionContent( sectionID );

        return parseMarkdownContent( sectionContent, sectionID, version );
    } );

    updateRevisionVersion( version,  () => {
        saveContentToFile( content, cb );
    } );
} );

function formRevisionVersion () {
    const currentVersion = require( './package.json' ).version;

    return currentVersion
        .split( '.' )
        .map( ( n, i ) => i === 2 ? parseInt( n, 10 ) + 1 : n )
        .join( '.' );
}

function getContentSections () {
    const content = fs.readFileSync( path.resolve( __dirname, './README.md' ), 'utf8' );

    return content
        .split( '\n' )
        .filter( l => l.search( /^\* \[/g ) > -1 )
        .map( l => l.replace('\r', '').split( '/wiki/' )[ 1 ].replace( ')', '' ) );
}

function readSectionContent ( section ) {
    const sectionFile = section.split( '-' ).map( upperFirst ).join( '-' ) + '.md';
    const sectionPath = path.resolve( __dirname, `./${CONTENT_DIR}/${sectionFile}` );

    return fs.readFileSync( sectionPath, 'utf8' );
}

function updateRevisionVersion ( nextVersion, cb ) {
    const data = require( './package.json' );

    data.version = nextVersion;

    fs.writeFile( './package.json', JSON.stringify( data, null, 2 ), 'utf8', cb );
}

function saveContentToFile ( content, cb ) {
    const filePath = path.resolve( __dirname, CONTENT_FILE );

    fs.writeFile( filePath, JSON.stringify( content, null, 2 ), 'utf8', cb );
}

function parseMarkdownContent ( content, sectionId, version ) {
    const [ title, ...questions ] = content.split( /\n{1,4}/ );

    return {
        id       : sectionId,
        version  : version,
        section  : sectionId,
        title    : title.replace( MD_TITLE_REGEXP, '' ),
        questions: questions.reduce( questionReducer, [] ).map( parseAnswers )
    };
}

function questionReducer ( result, current, index, array ) {
    if ( current.search( MD_SUBTITLE_REGEXP ) > -1 ) {
        const question = current.replace( MD_SUBTITLE_REGEXP, '' );

        result.push( {
            id      : formQuestionId( question ),
            question: question,
            answers : []
        } );
    } else {
        const last       = result[ result.length - 1 ];
        const openIndex  = last.answers.reverse().findIndex( l => l === '<ul>' );
        const closeIndex = last.answers.reverse().findIndex( l => l === '</ul>' );

        const hasActiveList = openIndex > -1 && (closeIndex === -1 || closeIndex > openIndex);

        if ( current.search( MD_LIST_ITEM_REGEXP ) > -1 ) {
            if ( !hasActiveList ) {
                last.answers.push( '<ul>' );
            }

            last.answers.push( '<li>' + current.replace( MD_LIST_ITEM_REGEXP, '' ) + '</li>' );

            if ( index === array.length - 1 ) {
                last.answers.push( '</ul>' );
            }
        } else {
            if ( hasActiveList ) {
                last.answers.push( '</ul>' );
            }

            last.answers.push( '<p>' + current + '</p>' );
        }
    }

    return result;
}

function parseAnswers ( question ) {
    const { answers } = question;

    delete question.answers;

    question.answer = answers.map( parseLinks ).join( '' );

    return question;
}

function parseLinks ( line ) {
    while ( line.search( MD_LINK_REGEXP ) > -1 ) {
        line = line.replace( MD_LINK_REGEXP, ( mdLink, linkText, urlOrAnchor ) => {
            let linkAnchor;
            let props = '';

            if ( urlOrAnchor.search( /^http/ ) > -1 || urlOrAnchor.search( /^mailto/ ) > -1 ) {
                if ( urlOrAnchor.search( /credo360\.com/ ) > -1 && urlOrAnchor.search( /#/ ) > -1 ) {
                    const parts = urlOrAnchor.split( /\/{1}/ );

                    linkAnchor = '/' + parts[ parts.length - 1 ];
                } else {
                    linkAnchor = urlOrAnchor;

                    if ( urlOrAnchor.search( /^mailto/ ) === -1 ) {
                        props = ' target=\'_blank\'';
                    }
                }
            } else if ( urlOrAnchor.search( /#/ ) === -1 ) {
                linkAnchor = '#' + urlOrAnchor;
            } else if ( urlOrAnchor.split( '#' ).length === 2 ) {
                linkAnchor = '#' + urlOrAnchor.split( '#' )[ 1 ];
            } else {
                linkAnchor = urlOrAnchor;
            }
            return `<a href='${linkAnchor}'${props}>${linkText}</a>`;
        } );
    }

    return line;
}

function upperFirst ( string ) {
    return string.charAt( 0 ).toUpperCase() + string.slice( 1 );
}

function formQuestionId ( string ) {
    return string
        .replace( /\s{1,3}/g, '-' )
        .replace( /[?!.,']/g, '' )
        .replace( /[/]/g, '-' )
        .toLowerCase();
}
