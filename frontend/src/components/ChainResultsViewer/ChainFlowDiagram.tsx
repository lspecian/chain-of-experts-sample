import React from 'react';
import type { ExpertContribution } from '../../utils/chainResponseParser';
import { formatDuration } from '../../utils/chainResponseParser';

interface ChainFlowDiagramProps {
  experts: ExpertContribution[];
  darkMode?: boolean;
  onExpertClick?: (expertName: string) => void;
}

/**
 * ChainFlowDiagram component visualizes the sequence of expert contributions
 * in the chain as a flow diagram with connecting arrows
 */
const ChainFlowDiagram: React.FC<ChainFlowDiagramProps> = ({ 
  experts, 
  darkMode = false,
  onExpertClick
}) => {
  if (!experts || experts.length === 0) {
    return null;
  }

  // Sort experts by index to ensure correct order
  const sortedExperts = [...experts].sort((a, b) => a.expertIndex - b.expertIndex);

  return (
    <div className={`visual-chain-flow ${darkMode ? 'dark' : 'light'}`}>
      <h3>Expert Chain Flow</h3>
      <div className="chain-flow-diagram">
        {sortedExperts.map((expert, index) => (
          <React.Fragment key={expert.expertName}>
            <div 
              className="expert-node"
              onClick={() => onExpertClick && onExpertClick(expert.expertName)}
              title={`${expert.expertType} expert: ${expert.expertName}`}
            >
              <div className="node-icon">✓</div>
              <div className="node-name">{expert.expertName}</div>
              <div className="node-type">{expert.expertType}</div>
              <div className="node-time">{formatDuration(expert.durationMs)}</div>
            </div>
            {index < sortedExperts.length - 1 && (
              <div className="connector">
                <div className="arrow">→</div>
                <div className="data-flow-indicator" title="Data flowing to next expert">
                  <span className="data-dot"></span>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ChainFlowDiagram;