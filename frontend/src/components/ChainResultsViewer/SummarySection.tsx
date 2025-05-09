import React from 'react';
import type { ChainResult } from '../../utils/chainResponseParser';
import { formatDuration, calculateCost } from '../../utils/chainResponseParser';

interface SummarySectionProps {
  result: ChainResult;
  darkMode?: boolean;
}

/**
 * SummarySection component displays the main result summary and metadata
 */
const SummarySection: React.FC<SummarySectionProps> = ({ result, darkMode = false }) => {
  return (
    <div className={`summary-tab ${darkMode ? 'dark' : 'light'}`}>
      {/* Main Answer/Summary */}
      <div className="result-summary">
        <h3>Result</h3>
        <div className="summary-content">
          {result.summary ? (
            <p>{result.summary}</p>
          ) : (
            <pre className="result-json">{JSON.stringify(result.result, null, 2)}</pre>
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="result-metadata">
        <div className="metadata-item">
          <span className="metadata-label">Processing Time:</span>
          <span className="metadata-value">{formatDuration(result.durationMs)}</span>
        </div>
        {result.traceId && (
          <div className="metadata-item">
            <span className="metadata-label">Trace ID:</span>
            <span className="metadata-value trace-id">{result.traceId}</span>
          </div>
        )}
        {result.tokenUsage && (
          <div className="metadata-item">
            <span className="metadata-label">Token Usage:</span>
            <span className="metadata-value">
              {result.tokenUsage.total} tokens (~{calculateCost(result.tokenUsage)})
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummarySection;