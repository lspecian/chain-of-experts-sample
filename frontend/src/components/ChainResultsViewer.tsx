import React, { useState } from 'react';
import './ChainResultsViewer.css';

// Define types for Chain of Experts results
interface ExpertContribution {
  expertName: string;
  expertType: string;
  expertIndex: number;
  input: unknown;
  output: unknown;
  timestamp: string;
  durationMs?: number;
}

interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
  provider?: string;
  model?: string;
}

interface ChainResult {
  summary?: string;
  answer?: string;
  result?: unknown;
  intermediateResults?: ExpertContribution[];
  tokenUsage?: TokenUsage;
  traceId?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
}

interface ChainResultsViewerProps {
  data: unknown;
  darkMode?: boolean;
  loading?: boolean;
}

const ChainResultsViewer: React.FC<ChainResultsViewerProps> = ({
  data,
  darkMode = false,
  loading = false
}) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'details' | 'raw'>('summary');
  const [expandedExpert, setExpandedExpert] = useState<string | null>(null);

  // Parse the data into a structured format
  const parseResult = (): ChainResult => {
    if (!data) {
      return { success: false, error: 'No data provided' };
    }

    try {
      // If data is a string, try to parse it as JSON
      const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
      
      // Extract key components from the response
      return {
        summary: parsedData.summary || parsedData.answer || (typeof parsedData.result === 'string' ? parsedData.result : undefined),
        answer: parsedData.answer,
        result: parsedData.result,
        intermediateResults: parsedData.intermediateResults || [],
        tokenUsage: parsedData.tokenUsage,
        traceId: parsedData.traceId,
        durationMs: parsedData.durationMs,
        success: parsedData.success !== false,
        error: parsedData.error
      };
    } catch {
      // If parsing fails, return the original data
      return {
        result: data,
        success: true
      };
    }
  };

  const result = parseResult();

  // Format duration in a human-readable way
  const formatDuration = (ms?: number): string => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Format timestamp in a human-readable way
  const formatTimestamp = (timestamp?: string): string => {
    if (!timestamp) return 'N/A';
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return timestamp;
    }
  };

  // Toggle expert expansion
  const toggleExpertExpansion = (expertName: string) => {
    setExpandedExpert(expandedExpert === expertName ? null : expertName);
  };

  // Render loading state
  if (loading) {
    return (
      <div className={`chain-results-viewer ${darkMode ? 'dark' : 'light'}`}>
        <div className="loading-container">
          <div className="skeleton-loader header-skeleton"></div>
          <div className="skeleton-loader content-skeleton"></div>
          <div className="skeleton-loader content-skeleton"></div>
          <div className="skeleton-loader content-skeleton-small"></div>
        </div>
      </div>
    );
  }

  // Render error state
  if (!result.success) {
    return (
      <div className={`chain-results-viewer ${darkMode ? 'dark' : 'light'}`}>
        <div className="error-container">
          <h3>Error</h3>
          <p className="error-message">{result.error || 'An unknown error occurred'}</p>
        </div>
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
        <div className="summary-tab">
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
                <span className="metadata-value">{result.tokenUsage.total} tokens</span>
              </div>
            )}
          </div>

          {/* Visual Chain Flow */}
          {result.intermediateResults && result.intermediateResults.length > 0 && (
            <div className="visual-chain-flow">
              <h3>Expert Chain Flow</h3>
              <div className="chain-flow-diagram">
                {result.intermediateResults.map((expert, index) => (
                  <React.Fragment key={expert.expertName}>
                    <div className="expert-node">
                      <div className="node-icon">✓</div>
                      <div className="node-name">{expert.expertName}</div>
                      <div className="node-time">{formatDuration(expert.durationMs)}</div>
                    </div>
                    {index < result.intermediateResults!.length - 1 && (
                      <div className="connector">
                        <div className="arrow">→</div>
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details Tab */}
      {activeTab === 'details' && (
        <div className="details-tab">
          <h3>Expert Contributions</h3>
          {result.intermediateResults && result.intermediateResults.length > 0 ? (
            <div className="expert-contributions">
              {result.intermediateResults.map((expert) => (
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
          ) : (
            <p className="no-data-message">No expert contribution data available</p>
          )}
          
          {/* Token Usage Details */}
          {result.tokenUsage && (
            <div className="token-usage-details">
              <h3>Token Usage</h3>
              <div className="token-usage-card">
                <div className="token-usage-item">
                  <span className="token-label">Total:</span>
                  <span className="token-value">{result.tokenUsage.total}</span>
                </div>
                <div className="token-usage-item">
                  <span className="token-label">Prompt:</span>
                  <span className="token-value">{result.tokenUsage.prompt}</span>
                </div>
                <div className="token-usage-item">
                  <span className="token-label">Completion:</span>
                  <span className="token-value">{result.tokenUsage.completion}</span>
                </div>
                {result.tokenUsage.provider && (
                  <div className="token-usage-item">
                    <span className="token-label">Provider:</span>
                    <span className="token-value">{result.tokenUsage.provider}</span>
                  </div>
                )}
                {result.tokenUsage.model && (
                  <div className="token-usage-item">
                    <span className="token-label">Model:</span>
                    <span className="token-value">{result.tokenUsage.model}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw JSON Tab */}
      {activeTab === 'raw' && (
        <div className="raw-tab">
          <h3>Raw Response</h3>
          <div className="copy-button-container">
            <button 
              className="copy-button"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data, null, 2));
              }}
            >
              Copy to Clipboard
            </button>
          </div>
          <pre className="raw-json">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default ChainResultsViewer;