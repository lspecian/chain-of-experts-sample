import React, { useState, useEffect } from 'react';
import './ExpertParameterConfig.css';

// Define parameter types
interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean';
  label: string;
  description?: string;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
  options?: string[];
}

// Define parameter value type
type ParameterValue = string | number | boolean | undefined;

// Define expert parameter templates
const EXPERT_PARAMETER_TEMPLATES: Record<string, ParameterDefinition[]> = {
  'data-retrieval': [
    {
      name: 'collectionName',
      type: 'string',
      label: 'Collection Name',
      description: 'Name of the vector database collection to search',
      defaultValue: 'sample_documents'
    },
    {
      name: 'numResults',
      type: 'number',
      label: 'Number of Results',
      description: 'Number of documents to retrieve',
      defaultValue: 3,
      min: 1,
      max: 10
    },
    {
      name: 'useSimulatedData',
      type: 'boolean',
      label: 'Use Simulated Data',
      description: 'Use simulated data instead of querying the vector database',
      defaultValue: false
    }
  ],
  'llm-summarization': [
    {
      name: 'provider',
      type: 'string',
      label: 'LLM Provider',
      description: 'The LLM provider to use',
      defaultValue: 'openai',
      options: ['openai', 'gemini', 'anthropic', 'ollama']
    },
    {
      name: 'model',
      type: 'string',
      label: 'Model',
      description: 'The model to use for summarization',
      defaultValue: 'gpt-4o'
    },
    {
      name: 'temperature',
      type: 'number',
      label: 'Temperature',
      description: 'Controls randomness of the output (0-1)',
      defaultValue: 0.7,
      min: 0,
      max: 1
    },
    {
      name: 'maxTokens',
      type: 'number',
      label: 'Max Tokens',
      description: 'Maximum number of tokens to generate',
      defaultValue: 500,
      min: 50,
      max: 4000
    },
    {
      name: 'systemPrompt',
      type: 'string',
      label: 'System Prompt',
      description: 'System prompt to guide the LLM',
      defaultValue: 'You are a helpful assistant that summarizes documents clearly and concisely.'
    }
  ]
};

interface ExpertParameterConfigProps {
  expertName: string;
  parameters: Record<string, ParameterValue>;
  onParametersChange: (expertName: string, parameters: Record<string, ParameterValue>) => void;
  darkMode?: boolean;
}

const ExpertParameterConfig: React.FC<ExpertParameterConfigProps> = ({
  expertName,
  parameters,
  onParametersChange,
  darkMode = false
}) => {
  const [localParameters, setLocalParameters] = useState<Record<string, ParameterValue>>({});
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  
  // Initialize local parameters when expertName or parameters change
  useEffect(() => {
    setLocalParameters(parameters || {});
  }, [expertName, parameters]);
  
  // Get parameter template for the expert
  const getParameterTemplate = (): ParameterDefinition[] => {
    return EXPERT_PARAMETER_TEMPLATES[expertName] || [];
  };
  
  // Handle parameter change
  const handleParameterChange = (name: string, value: ParameterValue) => {
    const updatedParameters = {
      ...localParameters,
      [name]: value
    };
    
    setLocalParameters(updatedParameters);
    onParametersChange(expertName, updatedParameters);
  };
  
  // Render parameter input based on type
  const renderParameterInput = (param: ParameterDefinition) => {
    const value = localParameters[param.name] !== undefined
      ? localParameters[param.name]
      : param.defaultValue;
    
    switch (param.type) {
      case 'string':
        if (param.options) {
          // Render dropdown for string with options
          return (
            <select
              id={`param-${expertName}-${param.name}`}
              value={value as string}
              onChange={(e) => handleParameterChange(param.name, e.target.value)}
              className="parameter-select"
            >
              {param.options.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          );
        }
        // Render text input for regular string
        return (
          <input
            type="text"
            id={`param-${expertName}-${param.name}`}
            value={value as string}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            placeholder={`Enter ${param.label.toLowerCase()}`}
          />
        );
      
      case 'number':
        return (
          <input
            type="number"
            id={`param-${expertName}-${param.name}`}
            value={value as number}
            min={param.min}
            max={param.max}
            step="0.1"
            onChange={(e) => handleParameterChange(param.name, parseFloat(e.target.value))}
            placeholder={`Enter ${param.label.toLowerCase()}`}
          />
        );
      
      case 'boolean':
        return (
          <input
            type="checkbox"
            id={`param-${expertName}-${param.name}`}
            checked={value as boolean}
            onChange={(e) => handleParameterChange(param.name, e.target.checked)}
          />
        );
      
      default:
        return null;
    }
  };
  
  // If no template exists for this expert, return null
  if (!EXPERT_PARAMETER_TEMPLATES[expertName]) {
    return null;
  }
  
  return (
    <div className={`expert-parameter-config ${darkMode ? 'dark' : 'light'}`}>
      <div className="parameter-header">
        <h4>{expertName} Parameters</h4>
        <button
          className="toggle-advanced-btn"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
        </button>
      </div>
      
      <div className="parameters-list">
        {getParameterTemplate().map(param => (
          <div key={param.name} className="parameter-item">
            <label htmlFor={`param-${expertName}-${param.name}`}>
              {param.label}:
              {param.description && (
                <span className="parameter-description" title={param.description}>ℹ️</span>
              )}
            </label>
            {renderParameterInput(param)}
          </div>
        ))}
      </div>
      
      {showAdvanced && (
        <div className="advanced-parameters">
          <h5>Raw JSON Parameters</h5>
          <textarea
            value={JSON.stringify(localParameters, null, 2)}
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value);
                setLocalParameters(parsed);
                onParametersChange(expertName, parsed);
              } catch {
                // Ignore parsing errors while typing
              }
            }}
            placeholder="Edit parameters as JSON"
            rows={5}
          />
        </div>
      )}
    </div>
  );
};

export default ExpertParameterConfig;