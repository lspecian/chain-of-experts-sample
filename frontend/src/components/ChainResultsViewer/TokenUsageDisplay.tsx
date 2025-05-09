import React from 'react';
import type { TokenUsage } from '../../utils/chainResponseParser';
import { calculateCost } from '../../utils/chainResponseParser';

interface TokenUsageDisplayProps {
  tokenUsage: TokenUsage;
  darkMode?: boolean;
}

/**
 * TokenUsageDisplay component shows detailed information about token usage
 * including total, prompt, and completion tokens
 */
const TokenUsageDisplay: React.FC<TokenUsageDisplayProps> = ({ 
  tokenUsage, 
  darkMode = false 
}) => {
  if (!tokenUsage) {
    return null;
  }

  return (
    <div className={`token-usage-details ${darkMode ? 'dark' : 'light'}`}>
      <h3>Token Usage</h3>
      <div className="token-usage-card">
        <div className="token-usage-item">
          <span className="token-label">Total:</span>
          <span className="token-value">{tokenUsage.total}</span>
        </div>
        <div className="token-usage-item">
          <span className="token-label">Prompt:</span>
          <span className="token-value">{tokenUsage.prompt}</span>
        </div>
        <div className="token-usage-item">
          <span className="token-label">Completion:</span>
          <span className="token-value">{tokenUsage.completion}</span>
        </div>
        
        {tokenUsage.provider && (
          <div className="token-usage-item">
            <span className="token-label">Provider:</span>
            <span className="token-value">{tokenUsage.provider}</span>
          </div>
        )}
        
        {tokenUsage.model && (
          <div className="token-usage-item">
            <span className="token-label">Model:</span>
            <span className="token-value">{tokenUsage.model}</span>
          </div>
        )}
        
        <div className="token-usage-item">
          <span className="token-label">Estimated Cost:</span>
          <span className="token-value">{calculateCost(tokenUsage)}</span>
        </div>
      </div>
    </div>
  );
};

export default TokenUsageDisplay;