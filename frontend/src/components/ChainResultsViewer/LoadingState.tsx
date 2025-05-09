import React from 'react';

interface LoadingStateProps {
  darkMode?: boolean;
}

/**
 * LoadingState component displays a skeleton loader while data is being fetched
 */
const LoadingState: React.FC<LoadingStateProps> = ({ darkMode = false }) => {
  return (
    <div className={`loading-container ${darkMode ? 'dark' : 'light'}`}>
      <div className="progress-message">Fetching results, please wait...</div>
      {/* Skeleton for Tabs */}
      <div className="skeleton-tabs">
        <div className="skeleton-loader tab-skeleton"></div>
        <div className="skeleton-loader tab-skeleton"></div>
        <div className="skeleton-loader tab-skeleton"></div>
      </div>

      {/* Skeleton for Tab Content Area */}
      <div className="skeleton-tab-content">
        {/* Skeleton for Summary Section */}
        <div className="skeleton-section">
          <div className="skeleton-loader title-skeleton"></div>
          <div className="skeleton-loader text-skeleton-long"></div>
          <div className="skeleton-loader text-skeleton-medium"></div>
        </div>

        {/* Skeleton for ChainFlowDiagram */}
        <div className="skeleton-section">
          <div className="skeleton-loader title-skeleton"></div>
          <div className="skeleton-flow-diagram">
            <div className="skeleton-loader flow-node-skeleton"></div>
            <div className="skeleton-loader flow-connector-skeleton"></div>
            <div className="skeleton-loader flow-node-skeleton"></div>
            <div className="skeleton-loader flow-connector-skeleton"></div>
            <div className="skeleton-loader flow-node-skeleton"></div>
          </div>
        </div>

        {/* Skeleton for ExpertContributionsList (simplified) */}
        <div className="skeleton-section">
          <div className="skeleton-loader title-skeleton"></div>
          <div className="skeleton-loader card-skeleton"></div>
          <div className="skeleton-loader card-skeleton"></div>
        </div>

        {/* Skeleton for TokenUsageDisplay */}
        <div className="skeleton-section">
          <div className="skeleton-loader title-skeleton"></div>
          <div className="skeleton-token-usage">
            <div className="skeleton-loader token-item-skeleton"></div>
            <div className="skeleton-loader token-item-skeleton"></div>
            <div className="skeleton-loader token-item-skeleton"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoadingState;