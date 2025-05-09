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
      <div className="skeleton-header">
        <div className="skeleton-loader header-skeleton"></div>
      </div>
      
      <div className="skeleton-content">
        <div className="skeleton-loader content-skeleton"></div>
        <div className="skeleton-loader content-skeleton"></div>
        <div className="skeleton-loader content-skeleton-small"></div>
      </div>
      
      <div className="skeleton-metadata">
        <div className="skeleton-loader metadata-skeleton"></div>
        <div className="skeleton-loader metadata-skeleton"></div>
      </div>
      
      <div className="skeleton-flow">
        <div className="skeleton-loader flow-node-skeleton"></div>
        <div className="skeleton-loader flow-connector-skeleton"></div>
        <div className="skeleton-loader flow-node-skeleton"></div>
        <div className="skeleton-loader flow-connector-skeleton"></div>
        <div className="skeleton-loader flow-node-skeleton"></div>
      </div>
    </div>
  );
};

export default LoadingState;