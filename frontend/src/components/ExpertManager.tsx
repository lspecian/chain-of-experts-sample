import { useState, useEffect } from 'react';
import './ExpertManager.css';

// Define types for expert configuration
interface ExpertMetadata {
  version?: string;
  tags?: string[];
  description?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

interface ExpertConfig {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  metadata?: ExpertMetadata;
}

// Define common parameter types for experts
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

// Define parameter templates for different expert types
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
  ],
  'custom': [
    {
      name: 'customParam',
      type: 'string',
      label: 'Custom Parameter',
      description: 'Add your own custom parameter',
      defaultValue: ''
    }
  ]
};

const ExpertManager: React.FC = () => {
  const [experts, setExperts] = useState<ExpertConfig[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Form state for creating/editing experts
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [currentExpert, setCurrentExpert] = useState<ExpertConfig | null>(null);
  const [newExpertName, setNewExpertName] = useState<string>('');
  const [newExpertDescription, setNewExpertDescription] = useState<string>('');
  const [newExpertParameters, setNewExpertParameters] = useState<Record<string, unknown>>({});
  const [showAdvancedParams, setShowAdvancedParams] = useState<boolean>(false);
  
  // Fetch experts on component mount
  useEffect(() => {
    fetchExperts();
  }, []);
  
  // Function to fetch experts from the API
  const fetchExperts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/experts');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setExperts(data.experts || []);
    } catch (err) {
      console.error('Error fetching experts:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to create a new expert
  const createExpert = async () => {
    if (!newExpertName.trim()) {
      setError('Expert name is required');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Use parameters object directly
      const parameters = newExpertParameters;
      
      const response = await fetch('/api/experts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newExpertName,
          description: newExpertDescription,
          parameters,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      // Reset form
      setNewExpertName('');
      setNewExpertDescription('');
      setNewExpertParameters({});
      
      // Refresh experts list
      fetchExperts();
    } catch (err) {
      console.error('Error creating expert:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to update an expert
  const updateExpert = async () => {
    if (!currentExpert) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use parameters object directly
      const parameters = newExpertParameters;
      
      const response = await fetch(`/api/experts/${currentExpert.name}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: newExpertDescription,
          parameters,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      // Reset form
      setIsEditing(false);
      setCurrentExpert(null);
      setNewExpertName('');
      setNewExpertDescription('');
      setNewExpertParameters({});
      
      // Refresh experts list
      fetchExperts();
    } catch (err) {
      console.error('Error updating expert:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to delete an expert
  const deleteExpert = async (expertName: string) => {
    if (!window.confirm(`Are you sure you want to delete expert "${expertName}"?`)) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/experts/${expertName}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      
      // Refresh experts list
      fetchExperts();
    } catch (err) {
      console.error('Error deleting expert:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  // Function to start editing an expert
  const startEditing = (expert: ExpertConfig) => {
    setIsEditing(true);
    setCurrentExpert(expert);
    setNewExpertName(expert.name);
    setNewExpertDescription(expert.description || '');
    setNewExpertParameters(expert.parameters || {});
  };
  
  // Function to cancel editing
  const cancelEditing = () => {
    setIsEditing(false);
    setCurrentExpert(null);
    setNewExpertName('');
    setNewExpertDescription('');
    setNewExpertParameters({});
  };
  
  // Function to handle parameter change
  const handleParameterChange = (name: string, value: string | number | boolean) => {
    setNewExpertParameters(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Function to get parameter template based on expert name
  const getParameterTemplate = (expertName: string): ParameterDefinition[] => {
    // For built-in experts, use predefined templates
    if (expertName === 'data-retrieval' || expertName === 'llm-summarization') {
      return EXPERT_PARAMETER_TEMPLATES[expertName];
    }
    
    // For custom experts, use the custom template
    return EXPERT_PARAMETER_TEMPLATES['custom'];
  };
  
  // Function to render parameter input based on type
  const renderParameterInput = (param: ParameterDefinition) => {
    const value = newExpertParameters[param.name] !== undefined
      ? newExpertParameters[param.name]
      : param.defaultValue;
    
    switch (param.type) {
      case 'string':
        if (param.options) {
          // Render dropdown for string with options
          return (
            <select
              id={`param-${param.name}`}
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
            id={`param-${param.name}`}
            value={value as string}
            onChange={(e) => handleParameterChange(param.name, e.target.value)}
            placeholder={`Enter ${param.label.toLowerCase()}`}
          />
        );
      
      case 'number':
        return (
          <input
            type="number"
            id={`param-${param.name}`}
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
            id={`param-${param.name}`}
            checked={value as boolean}
            onChange={(e) => handleParameterChange(param.name, e.target.checked)}
          />
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="expert-manager">
      <h2>Expert Manager</h2>
      
      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      
      {/* Expert List */}
      <div className="expert-list">
        <h3>Available Experts</h3>
        {loading && <p>Loading experts...</p>}
        {!loading && experts.length === 0 && <p>No experts found.</p>}
        {!loading && experts.length > 0 && (
          <ul>
            {experts.map((expert) => (
              <li key={expert.name} className="expert-item">
                <div className="expert-info">
                  <h4>{expert.name}</h4>
                  <p>{expert.description || 'No description'}</p>
                  <div className="expert-actions">
                    <button 
                      onClick={() => startEditing(expert)}
                      disabled={['data-retrieval', 'llm-summarization'].includes(expert.name)}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => deleteExpert(expert.name)}
                      disabled={['data-retrieval', 'llm-summarization'].includes(expert.name)}
                      className="delete-button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      {/* Expert Form */}
      <div className="expert-form">
        <h3>{isEditing ? 'Edit Expert' : 'Create New Expert'}</h3>
        <div className="form-group">
          <label htmlFor="expertName">Name:</label>
          <input
            type="text"
            id="expertName"
            value={newExpertName}
            onChange={(e) => setNewExpertName(e.target.value)}
            disabled={isEditing}
            placeholder="Enter expert name"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="expertDescription">Description:</label>
          <textarea
            id="expertDescription"
            value={newExpertDescription}
            onChange={(e) => setNewExpertDescription(e.target.value)}
            placeholder="Enter expert description"
          />
        </div>
        
        <div className="form-group">
          <div className="parameters-header">
            <label>Parameters:</label>
            <button
              type="button"
              className="toggle-advanced-btn"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
            >
              {showAdvancedParams ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>
          
          <div className="parameters-container">
            {getParameterTemplate(newExpertName).map(param => (
              <div key={param.name} className="parameter-item">
                <label htmlFor={`param-${param.name}`}>{param.label}:</label>
                {renderParameterInput(param)}
                {param.description && (
                  <div className="parameter-description">{param.description}</div>
                )}
              </div>
            ))}
          </div>
          
          {showAdvancedParams && (
            <div className="advanced-parameters">
              <h4>Advanced: Raw JSON Parameters</h4>
              <textarea
                value={JSON.stringify(newExpertParameters, null, 2)}
                onChange={(e) => {
                  try {
                    const parsed = JSON.parse(e.target.value);
                    setNewExpertParameters(parsed);
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
        
        <div className="form-actions">
          {isEditing ? (
            <>
              <button onClick={updateExpert} disabled={loading}>Update Expert</button>
              <button onClick={cancelEditing} disabled={loading}>Cancel</button>
            </>
          ) : (
            <button onClick={createExpert} disabled={loading || !newExpertName.trim()}>
              Create Expert
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpertManager;