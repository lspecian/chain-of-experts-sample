import React from 'react';
import './ChainFlowDiagram.css';

interface ExpertData {
  expertName: string;
  expertType: string;
  expertIndex: number;
  input: unknown;
  output: unknown;
  timestamp: string;
  durationMs?: number;
}

interface ChainFlowDiagramProps {
  experts: ExpertData[];
  darkMode?: boolean;
  onExpertClick?: (expertName: string) => void;
}

const ChainFlowDiagram: React.FC<ChainFlowDiagramProps> = ({ experts, darkMode = false, onExpertClick }) => {
  if (!experts || experts.length === 0) {
    return <div className={`chain-flow-diagram-empty ${darkMode ? 'dark' : 'light'}`}>No expert data to display.</div>;
  }

  return (
    <div className={`chain-flow-diagram-container ${darkMode ? 'dark' : 'light'}`}>
      <h2>Chain Flow</h2>
      <div className="diagram">
        {experts.map((expert, index) => (
          <React.Fragment key={expert.expertName}>
            <div
              className="expert-node"
              onClick={() => onExpertClick && onExpertClick(expert.expertName)}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => e.key === 'Enter' && onExpertClick && onExpertClick(expert.expertName)}
            >
              <div className="expert-name">{expert.expertName}</div>
              <div className="expert-type">({expert.expertType})</div>
              {/* Placeholder for more expert details/summary */}
            </div>
            {index < experts.length - 1 && (
              <div className="arrow">→</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default ChainFlowDiagram;