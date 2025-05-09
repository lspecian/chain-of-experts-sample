import React from 'react';
import type { ChainResult } from '../../utils/chainResponseParser';
import { getErrorMessage } from '../../utils/chainResponseParser';

interface ErrorDisplayProps {
  result: ChainResult;
  darkMode?: boolean;
  onRetry?: () => void;
}

/**
 * ErrorDisplay component shows error messages with optional retry functionality
 */
const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ 
  result, 
  darkMode = false,
  onRetry
}) => {
  return (
    <div className={`error-container ${darkMode ? 'dark' : 'light'}`}>
      <div className="error-icon">❌</div>
      <h3>Error</h3>
      <p className="error-message">{getErrorMessage(result)}</p>
      
      {onRetry && (
        <div className="error-actions">
          <button 
            className="retry-button"
            onClick={onRetry}
            aria-label="Retry request"
          >
            Retry
          </button>
        </div>
      )}
      
      {result.traceId && (
        <div className="error-trace">
          <span className="trace-label">Trace ID:</span>
          <code className="trace-id">{result.traceId}</code>
        </div>
      )}
    </div>
  );
};

export default ErrorDisplay;