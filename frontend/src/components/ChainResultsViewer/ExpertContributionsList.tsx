import React, { useState } from 'react';
import type { ExpertContribution } from '../../utils/chainResponseParser';
import { formatDuration, formatTimestamp } from '../../utils/chainResponseParser';

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
  const [expandedExpert, setExpandedExpert] = useState<string | null>(null);

  if (!experts || experts.length === 0) {
    return (
      <div className={`expert-contributions-empty ${darkMode ? 'dark' : 'light'}`}>
        <p className="no-data-message">No expert contribution data available</p>
      </div>
    );
  }

  // Toggle expert expansion
  const toggleExpertExpansion = (expertName: string) => {
    setExpandedExpert(expandedExpert === expertName ? null : expertName);
  };

  return (
    <div className={`expert-contributions ${darkMode ? 'dark' : 'light'}`}>
      {experts.map((expert) => (
        <div key={expert.expertName} className="expert-contribution-card">
          <div 
            className="expert-header"
            onClick={() => toggleExpertExpansion(expert.expertName)}
          >
            <div className="expert-info">
              <h4>{expert.expertName}</h4>
              <span className="expert-type">{expert.expertType}</span>
            </div>
            <div className="expert-metrics">
              <span className="expert-time">{formatDuration(expert.durationMs)}</span>
              <span className="expand-icon">{expandedExpert === expert.expertName ? '▼' : '▶'}</span>
            </div>
          </div>
          
          {expandedExpert === expert.expertName && (
            <div className="expert-details">
              <div className="io-container">
                <div className="io-panel">
                  <div className="io-header">
                    <h5>Input</h5>
                    <span className="io-badge input-badge">IN</span>
                  </div>
                  <pre className="io-content">{JSON.stringify(expert.input, null, 2)}</pre>
                </div>
                
                <div className="io-panel">
                  <div className="io-header">
                    <h5>Output</h5>
                    <span className="io-badge output-badge">OUT</span>
                  </div>
                  <pre className="io-content">{JSON.stringify(expert.output, null, 2)}</pre>
                </div>
              </div>
              
              <div className="expert-metadata">
                <div className="metadata-item">
                  <span className="metadata-label">Timestamp:</span>
                  <span className="metadata-value">{formatTimestamp(expert.timestamp)}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Duration:</span>
                  <span className="metadata-value">{formatDuration(expert.durationMs)}</span>
                </div>
                <div className="metadata-item">
                  <span className="metadata-label">Index:</span>
                  <span className="metadata-value">{expert.expertIndex}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ExpertContributionsList;