import React, { useState } from 'react';
import './ChainResultsViewer/ChainResultsViewer.css';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ChainResult, ExpertContribution, TokenUsage } from '../utils/chainResponseParser';
import { parseChainResponse, hasError } from '../utils/chainResponseParser';
import ErrorBoundary from './ErrorBoundary'; // Import ErrorBoundary

// Import sub-components
import {
  SummarySection,
  ChainFlowDiagram,
  ExpertContributionsList,
  TokenUsageDisplay,
  RawResponseView,
  LoadingState,
  ErrorDisplay
} from './ChainResultsViewer/index';

interface ChainResultsViewerProps {
  data: unknown;
  darkMode?: boolean;
  loading?: boolean;
  onRetry?: () => void;
}

/**
 * ChainResultsViewer is the main component for displaying Chain of Experts results
 * It provides a tabbed interface to view different aspects of the results
 */
const ChainResultsViewer: React.FC<ChainResultsViewerProps> = ({
  data,
  darkMode = false,
  loading = false,
  onRetry
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'raw'>('summary');
  const [activeExpert, setActiveExpert] = useState<string | null>(null);

  // Parse the data into a structured format using our utility
  const result: ChainResult = parseChainResponse(data);

  // Handle expert node click
  const handleExpertClick = (expertName: string) => {
    setActiveExpert(expertName === activeExpert ? null : expertName);
    // Switch to details tab when clicking on an expert in the flow diagram
    setActiveTab('details');
  };

  // Render loading state
  if (loading) {
    return (
      <div className={`chain-results-viewer ${darkMode ? 'dark' : 'light'}`}>
        <LoadingState darkMode={darkMode} />
      </div>
    );
  }

  // Render error state
  if (hasError(result)) {
    return (
      <div className={`chain-results-viewer ${darkMode ? 'dark' : 'light'}`}>
        <ErrorDisplay
          result={result}
          darkMode={darkMode}
          onRetry={onRetry}
        />
      </div>
    );
  }

  // If there's no result or summary, and not loading/error, show a message or minimal UI
  if (!result || (!result.summary && !result.answer && !result.intermediateResults?.length)) {
    return (
      <div className={`chain-results-viewer ${darkMode ? 'dark' : 'light'}`}>
        <div className="tab-content">
          <p className="no-data-message">No results to display.</p>
          {result?.traceId && (
            <div className="result-metadata" style={{ justifyContent: 'center', marginTop: '10px' }}>
               <div className="metadata-item tooltip-container">
                <span className="metadata-label">Trace ID:</span>
                <code className="metadata-value trace-id">{result.traceId}</code>
                <span className="tooltip-text">Unique identifier for this chain execution. Useful for debugging.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`chain-results-viewer ${darkMode ? 'dark' : 'light'}`}>
      {/* Tabs for different views */}
      <div className="result-tabs" role="tablist" aria-label="Result views">
        <button
          id="tab-summary"
          role="tab"
          aria-selected={activeTab === 'summary'}
          aria-controls="panel-summary"
          className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
          tabIndex={activeTab === 'summary' ? 0 : -1}
        >
          Summary
        </button>
        <button
          id="tab-details"
          role="tab"
          aria-selected={activeTab === 'details'}
          aria-controls="panel-details"
          className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
          tabIndex={activeTab === 'details' ? 0 : -1}
        >
          Expert Details
        </button>
        <button
          id="tab-raw"
          role="tab"
          aria-selected={activeTab === 'raw'}
          aria-controls="panel-raw"
          className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
          tabIndex={activeTab === 'raw' ? 0 : -1}
        >
          Raw JSON
        </button>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div
          id="panel-summary"
          role="tabpanel"
          aria-labelledby="tab-summary"
          className="tab-content"
          tabIndex={0}
        >
          <ErrorBoundary darkMode={darkMode} fallbackMessage="Could not load summary.">
            <SummarySection result={result} darkMode={darkMode} />
          </ErrorBoundary>
          
          {result.intermediateResults && result.intermediateResults.length > 0 && (
            <ErrorBoundary darkMode={darkMode} fallbackMessage="Could not load chain flow diagram.">
              <ChainFlowDiagram
                experts={result.intermediateResults}
                darkMode={darkMode}
                onExpertClick={handleExpertClick}
              />
            </ErrorBoundary>
          )}

          {result.traceId && !loading && !hasError(result) && ( // Ensure not to show if already shown in no-data block
             <div className="result-metadata" style={{ marginTop: '20px' }}>
               <div className="metadata-item tooltip-container">
                <span className="metadata-label">Trace ID:</span>
                <code className="metadata-value trace-id">{result.traceId}</code>
                <span className="tooltip-text">Unique identifier for this chain execution. Useful for debugging.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div
          id="panel-details"
          role="tabpanel"
          aria-labelledby="tab-details"
          className="tab-content"
          tabIndex={0}
        >
          <h3>Expert Contributions</h3>
          
          {result.intermediateResults && result.intermediateResults.length > 0 && (
            <ErrorBoundary darkMode={darkMode} fallbackMessage="Could not load expert contributions.">
              <ExpertContributionsList
                experts={result.intermediateResults}
                darkMode={darkMode}
              />
            </ErrorBoundary>
          )}
          
          {result.tokenUsage && (
            <ErrorBoundary darkMode={darkMode} fallbackMessage="Could not load token usage.">
              <TokenUsageDisplay
                tokenUsage={result.tokenUsage}
                darkMode={darkMode}
              />
            </ErrorBoundary>
          )}
        </div>
      )}

      {/* Raw JSON Tab */}
      {activeTab === 'raw' && (
        <div
          id="panel-raw"
          role="tabpanel"
          aria-labelledby="tab-raw"
          className="tab-content"
          tabIndex={0}
        >
          <ErrorBoundary darkMode={darkMode} fallbackMessage="Could not load raw JSON view.">
            <RawResponseView data={data} darkMode={darkMode} />
          </ErrorBoundary>
        </div>
      )}
    </div>
  );
};

export default ChainResultsViewer;