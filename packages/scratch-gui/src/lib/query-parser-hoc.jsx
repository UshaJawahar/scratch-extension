import React from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import {connect} from 'react-redux';

import {detectTutorialId} from './tutorial-from-url';

import {activateDeck} from '../reducers/cards';
import {openTipsLibrary} from '../reducers/modals';

/* Higher Order Component to get parameters from the URL query string and initialize redux state
 * @param {React.Component} WrappedComponent: component to render
 * @returns {React.Component} component with query parsing behavior
 */
const QueryParserHOC = function (WrappedComponent) {
    class QueryParserComponent extends React.Component {
        constructor (props) {
            super(props);
            const queryParams = queryString.parse(location.search);
            const tutorialId = detectTutorialId(queryParams);
            if (tutorialId) {
                if (tutorialId === 'all') {
                    this.openTutorials();
                } else {
                    this.setActiveCards(tutorialId);
                }
            }
            
            // Save sessionId and projectId to localStorage for ML extension
            this.saveMLParamsToLocalStorage(queryParams);
        }
        
        saveMLParamsToLocalStorage(queryParams) {
            const sessionId = queryParams.sessionId;
            const projectId = queryParams.projectId;
            const teachableLink = queryParams.teachableLink;
            
            if (sessionId && projectId) {
                console.log('QueryParser: Saving ML extension params to localStorage:', { sessionId, projectId, teachableLink });
                
                // Save to localStorage with the same keys the ML extension expects
                if (typeof window !== 'undefined' && window.localStorage) {
                    window.localStorage.setItem('ml_extension_session_id', sessionId);
                    window.localStorage.setItem('ml_extension_project_id', projectId);
                    
                    // Save teachableLink if available
                    if (teachableLink) {
                        window.localStorage.setItem('ml_extension_teachable_link', teachableLink);
                        console.log('QueryParser: TeachableLink saved to localStorage:', teachableLink);
                    }
                    
                    // Also save the project name if available
                    if (queryParams.projectName) {
                        window.localStorage.setItem('ml_extension_project_name', queryParams.projectName);
                    }
                    
                    // Save additional metadata
                    window.localStorage.setItem('ml_extension_url_timestamp', Date.now().toString());
                    
                    console.log('QueryParser: ML extension params saved to localStorage successfully');
                    console.log('QueryParser: Available in localStorage:', {
                        sessionId: window.localStorage.getItem('ml_extension_session_id'),
                        projectId: window.localStorage.getItem('ml_extension_project_id'),
                        teachableLink: window.localStorage.getItem('ml_extension_teachable_link'),
                        projectName: window.localStorage.getItem('ml_extension_project_name')
                    });
                }
            } else {
                console.log('QueryParser: No sessionId or projectId found in URL params:', queryParams);
                
                // Check if we have them in localStorage already
                if (typeof window !== 'undefined' && window.localStorage) {
                    const existingSessionId = window.localStorage.getItem('ml_extension_session_id');
                    const existingProjectId = window.localStorage.getItem('ml_extension_project_id');
                    const existingTeachableLink = window.localStorage.getItem('ml_extension_teachable_link');
                    
                    if (existingSessionId && existingProjectId) {
                        console.log('QueryParser: Found existing ML extension params in localStorage:', {
                            sessionId: existingSessionId,
                            projectId: existingProjectId,
                            teachableLink: existingTeachableLink
                        });
                    }
                }
            }
        }
        
        setActiveCards (tutorialId) {
            this.props.onUpdateReduxDeck(tutorialId);
        }
        openTutorials () {
            this.props.onOpenTipsLibrary();
        }
        render () {
            const {
                onOpenTipsLibrary, // eslint-disable-line no-unused-vars
                onUpdateReduxDeck, // eslint-disable-line no-unused-vars
                ...componentProps
            } = this.props;
            return (
                <WrappedComponent
                    {...componentProps}
                />
            );
        }
    }
    QueryParserComponent.propTypes = {
        onOpenTipsLibrary: PropTypes.func,
        onUpdateReduxDeck: PropTypes.func
    };
    const mapDispatchToProps = dispatch => ({
        onOpenTipsLibrary: () => {
            dispatch(openTipsLibrary());
        },
        onUpdateReduxDeck: tutorialId => {
            dispatch(activateDeck(tutorialId));
        }
    });
    return connect(
        null,
        mapDispatchToProps
    )(QueryParserComponent);
};

export {
    QueryParserHOC as default
};
