import React, { useState, useEffect } from 'react';
import './ChainVisualizer.css';

interface ExpertNode {
  name: string;
  description?: string;
  status: 'idle' | 'processing' | 'completed' | 'error';
  input?: unknown;
  output?: unknown;
}

interface ChainVisualizerProps {
  experts: string[];
  activeExpert?: string;
  processingStatus?: 'idle' | 'processing' | 'completed' | 'error';
  expertDetails?: Record<string, {
    description?: string;
    input?: unknown;
    output?: unknown;
    [key: string]: unknown;
  }>;
  onExpertClick?: (expertName: string) => void;
}

const ChainVisualizer: React.FC<ChainVisualizerProps> = ({
  experts,
  activeExpert,
  processingStatus = 'idle',
  expertDetails = {},
  onExpertClick
}) => {
  const [nodes, setNodes] = useState<ExpertNode[]>([]);
  
  // Update nodes when experts or activeExpert changes
  useEffect(() => {
    const newNodes = experts.map(expert => {
      const details = expertDetails[expert] || {};
      
      let status: ExpertNode['status'] = 'idle';
      if (processingStatus === 'error') {
        status = expert === activeExpert ? 'error' : (experts.indexOf(expert) < experts.indexOf(activeExpert || '') ? 'completed' : 'idle');
      } else if (processingStatus === 'completed') {
        status = 'completed';
      } else if (processingStatus === 'processing') {
        status = expert === activeExpert ? 'processing' : (experts.indexOf(expert) < experts.indexOf(activeExpert || '') ? 'completed' : 'idle');
      }
      
      return {
        name: expert,
        description: details.description,
        status,
        input: details.input,
        output: details.output
      };
    });
    
    setNodes(newNodes);
  }, [experts, activeExpert, processingStatus, expertDetails]);
  
  // Handle expert node click
  const handleNodeClick = (expertName: string) => {
    if (onExpertClick) {
      onExpertClick(expertName);
    }
  };
  
  // Get status class for node
  const getNodeStatusClass = (status: ExpertNode['status']) => {
    switch (status) {
      case 'processing':
        return 'node-processing';
      case 'completed':
        return 'node-completed';
      case 'error':
        return 'node-error';
      default:
        return '';
    }
  };
  
  // Get status icon for node
  const getNodeStatusIcon = (status: ExpertNode['status']) => {
    switch (status) {
      case 'processing':
        return '⚙️';
      case 'completed':
        return '✅';
      case 'error':
        return '❌';
      default:
        return '⭕';
    }
  };
  
  return (
    <div className="chain-visualizer">
      <h3>Expert Chain Flow</h3>
      
      <div className="chain-flow">
        {nodes.map((node, index) => (
          <React.Fragment key={node.name}>
            {/* Expert Node */}
            <div 
              className={`expert-node ${getNodeStatusClass(node.status)}`}
              onClick={() => handleNodeClick(node.name)}
              title={node.description || node.name}
            >
              <div className="node-icon">{getNodeStatusIcon(node.status)}</div>
              <div className="node-name">{node.name}</div>
            </div>
            
            {/* Connector with data flow indicator (if not the last node) */}
            {index < nodes.length - 1 && (
              <div className={`connector ${nodes[index + 1].status === 'completed' || nodes[index + 1].status === 'processing' ? 'connector-active' : ''}`}>
                <div className="arrow">→</div>
                {node.output !== undefined && (
                  <div className="data-flow-indicator" title="Data flowing to next expert">
                    <span className="data-dot"></span>
                  </div>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
      
      {/* Details Panel (optional) */}
      {activeExpert && expertDetails[activeExpert] && (
        <div className="expert-details">
          <h4>{activeExpert} Details</h4>
          <div className="details-content">
            {expertDetails[activeExpert].description && (
              <p className="expert-description">{expertDetails[activeExpert].description}</p>
            )}
            
            <div className="io-container">
              {/* Input Panel */}
              {expertDetails[activeExpert].input !== undefined && (
                <div className="io-panel">
                  <div className="io-header">
                    <h5>Input</h5>
                    <span className="io-badge input-badge">IN</span>
                  </div>
                  <pre className="io-content">{JSON.stringify(expertDetails[activeExpert].input, null, 2)}</pre>
                </div>
              )}
              
              {/* Output Panel */}
              {expertDetails[activeExpert].output !== undefined && (
                <div className="io-panel">
                  <div className="io-header">
                    <h5>Output</h5>
                    <span className="io-badge output-badge">OUT</span>
                  </div>
                  <pre className="io-content">{JSON.stringify(expertDetails[activeExpert].output, null, 2)}</pre>
                </div>
              )}
            </div>
            
            {/* Transformation Summary */}
            {expertDetails[activeExpert].input !== undefined && expertDetails[activeExpert].output !== undefined && (
              <div className="transformation-summary">
                <h5>Transformation</h5>
                <p>This expert transformed the input data into the output shown above.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChainVisualizer;