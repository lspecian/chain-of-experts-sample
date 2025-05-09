import React, { useState } from 'react';
import type { ExpertContribution } from '../../utils/chainResponseParser';
import { formatDuration, formatTimestamp } from '../../utils/chainResponseParser';
import { CopyButton } from './index'; // Import CopyButton

interface ExpertContributionsListProps {
  experts: ExpertContribution[];
  darkMode?: boolean;
}

/**
 * ExpertContributionsList component displays detailed information about each expert's contribution
 * with collapsible sections for input/output data
 */
const ExpertContributionsList: React.FC<ExpertContributionsListProps> = ({ 
  experts, 
  darkMode = false 
}) => {
  // State to track expanded state of each expert card
  const [expandedExperts, setExpandedExperts] = useState<Record<string, boolean>>({});

  if (!experts || experts.length === 0) {
    return (
      <div className={`expert-contributions-empty ${darkMode ? 'dark' : 'light'}`}>
        <p className="no-data-message">No expert contribution data available</p>
      </div>
    );
  }

  // Toggle individual expert expansion
  const toggleExpertExpansion = (expertName: string) => {
    setExpandedExperts(prev => ({
      ...prev,
      [expertName]: !prev[expertName]
    }));
  };

  return (
    <div className={`expert-contributions ${darkMode ? 'dark' : 'light'}`}>
      {experts.map((expert) => {
        const isExpanded = !!expandedExperts[expert.expertName];
        return (
          <div key={expert.expertName} className="expert-contribution-card">
            <div
              className="expert-header"
              onClick={() => toggleExpertExpansion(expert.expertName)}
              onKeyPress={(e) => (e.key === 'Enter' || e.key === ' ') && toggleExpertExpansion(expert.expertName)}
              role="button"
              tabIndex={0}
              aria-expanded={isExpanded}
              aria-controls={`expert-details-${expert.expertName}`}
            >
              <div className="expert-info">
                <h4>{expert.expertName}</h4>
                <span className="expert-type">{expert.expertType}</span>
              </div>
              <div className="expert-metrics">
                <span className="expert-time">{formatDuration(expert.durationMs)}</span>
                <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
              </div>
            </div>

            <div
              className={`expert-details ${isExpanded ? '' : 'collapsed'}`}
              id={`expert-details-${expert.expertName}`}
              aria-hidden={!isExpanded}
            >
              {isExpanded && ( // Conditionally render content to ensure transitions work correctly
                <>
                  <div className="io-container">
                    <div className="io-panel">
                      <div className="io-header">
                    <h5>Input</h5>
                    <CopyButton
                      textToCopy={JSON.stringify(expert.input, null, 2)}
                      darkMode={darkMode}
                      label="Copy Input"
                      className="io-copy-button"
                    />
                    <span className="io-badge input-badge">IN</span>
                  </div>
                  <pre className="io-content">{JSON.stringify(expert.input, null, 2)}</pre>
                </div>
                
                <div className="io-panel">
                  <div className="io-header">
                    <h5>Output</h5>
                    <CopyButton
                      textToCopy={JSON.stringify(expert.output, null, 2)}
                      darkMode={darkMode}
                      label="Copy Output"
                      className="io-copy-button"
                    />
                    <span className="io-badge output-badge">OUT</span>
                  </div>
                  <pre className="io-content">{JSON.stringify(expert.output, null, 2)}</pre>
                </div>
              </div>
              
              <div className="expert-metadata">
                <div className="metadata-item tooltip-container">
                  <span className="metadata-label">Timestamp:</span>
                  <span className="metadata-value">{formatTimestamp(expert.timestamp)}</span>
                  <span className="tooltip-text">Time this expert finished processing.</span>
                </div>
                <div className="metadata-item tooltip-container">
                  <span className="metadata-label">Duration:</span>
                  <span className="metadata-value">{formatDuration(expert.durationMs)}</span>
                  <span className="tooltip-text">Time taken by this expert.</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Index:</span>
                  <span className="metadata-value">{expert.expertIndex}</span>
                </div>
              </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ExpertContributionsList;