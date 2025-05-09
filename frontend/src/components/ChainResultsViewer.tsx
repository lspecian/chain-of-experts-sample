import React, { useState } from 'react';
import './ChainResultsViewer/ChainResultsViewer.css';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { ChainResult, ExpertContribution, TokenUsage } from '../utils/chainResponseParser';
import { parseChainResponse, hasError } from '../utils/chainResponseParser';

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

  return (
    <div className={`chain-results-viewer ${darkMode ? 'dark' : 'light'}`}>
      {/* Tabs for different views */}
      <div className="result-tabs">
        <button 
          className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        <button 
          className={`tab-button ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Expert Details
        </button>
        <button 
          className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
          onClick={() => setActiveTab('raw')}
        >
          Raw JSON
        </button>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="tab-content">
          <SummarySection result={result} darkMode={darkMode} />
          
          {result.intermediateResults && result.intermediateResults.length > 0 && (
            <ChainFlowDiagram 
              experts={result.intermediateResults} 
              darkMode={darkMode}
              onExpertClick={handleExpertClick}
            />
          )}
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="tab-content">
          <h3>Expert Contributions</h3>
          
          {result.intermediateResults && result.intermediateResults.length > 0 && (
            <ExpertContributionsList 
              experts={result.intermediateResults} 
              darkMode={darkMode} 
            />
          )}
          
          {result.tokenUsage && (
            <TokenUsageDisplay 
              tokenUsage={result.tokenUsage} 
              darkMode={darkMode} 
            />
          )}
        </div>
      )}

      {/* Raw JSON Tab */}
      {activeTab === 'raw' && (
        <RawResponseView data={data} darkMode={darkMode} />
      )}
    </div>
  );
};

export default ChainResultsViewer;