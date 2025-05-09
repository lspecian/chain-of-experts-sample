import { IExpert, ExpertParameters } from './baseExpert'; // Import ExpertParameters
import { ExpertMetadata } from '../chain/types';
import { DataRetrievalExpert } from './expert1';
import { LLMSummarizationExpert } from './expert2';
import { QueryReformulationExpert } from './queryReformulationExpert';
import { DocumentFilteringExpert } from './documentFilteringExpert';
import { FactCheckingExpert } from './factCheckingExpert';
import { ResponseFormattingExpert } from './responseFormattingExpert'; // Added import
import { ExpertNotFoundError } from '../chain/errors';
import { logger } from '../utils/logger';
import {
  readExperts,
  writeExperts,
  getExpertById,
  getExpertByName,
  addExpert,
  updateExpert,
  deleteExpert,
  initializeBuiltInExperts,
  StoredExpertConfig
} from '../storage/expertStorage';

// Updated Expert factory type definition to accept parameters
export type ExpertFactory = (parameters?: ExpertParameters) => IExpert;

// Expert configuration interface
export interface ExpertConfig {
  name: string;
  factory: ExpertFactory;
  metadata?: ExpertMetadata;
  description?: string;
  parameters?: Record<string, any>;
}

// More robust registry using a Map and factory functions
export class ExpertRegistry {
  private static experts: Map<string, ExpertConfig> = new Map();
  private static listeners: Array<() => void> = [];
  private static initialized: boolean = false;

  // Initialize the registry
  static initialize(): void {
    if (this.initialized) {
      return;
    }

    // Register built-in experts
    const builtInExperts: ExpertConfig[] = [
      {
        name: 'data-retrieval',
        factory: (parameters) => new DataRetrievalExpert(parameters),
        description: 'Retrieves relevant documents based on a query',
        parameters: {
          collectionName: 'sample_documents',
          numResults: 3
        }
      },
      {
        name: 'llm-summarization',
        factory: (parameters) => new LLMSummarizationExpert(parameters),
        description: 'Summarizes documents using an LLM',
        parameters: {
          maxTokens: 500,
          temperature: 0.7
        }
      },
      {
        name: 'query-reformulation',
        factory: (parameters) => new QueryReformulationExpert(parameters),
        description: 'Reformulates user queries for better search results',
        parameters: {
          // Default parameters for QueryReformulationExpert if any
        }
      },
      {
        name: 'document-filtering',
        factory: (parameters) => new DocumentFilteringExpert(parameters),
        description: 'Filters and ranks retrieved documents based on relevance and other criteria.',
        parameters: {
          minRelevanceScore: 0.5,
          maxOutputDocuments: 5,
          sortBy: 'relevance',
        }
      },
      {
        name: 'fact-checking',
        factory: (parameters) => new FactCheckingExpert(parameters),
        description: 'Verifies factual claims against source documents using an LLM.',
        parameters: {
          temperature: 0.2,
          maxTokensPerClaim: 200,
        }
      },
      {
        name: 'response-formatting',
        factory: (parameters) => new ResponseFormattingExpert(parameters),
        description: 'Formats text into specified structures (e.g., bullet points, JSON) using an LLM.',
        parameters: {
          targetFormat: 'paragraph',
          style: 'concise',
          temperature: 0.5,
        }
      }
    ];

    // Initialize storage with built-in experts
    initializeBuiltInExperts(builtInExperts);

    // Load all experts from storage
    this.loadExpertsFromStorage();

    this.initialized = true;
    logger.info("ExpertRegistry initialized successfully");
  }

  // Load experts from storage
  private static loadExpertsFromStorage(): void {
    try {
      const storedExperts = readExperts();
      
      // Clear existing experts
      this.experts.clear();
      
      // Register each expert from storage
      storedExperts.forEach(storedExpert => {
        // Create a factory function based on the expert type
        let factory: ExpertFactory;
        
        switch (storedExpert.name) {
          case 'data-retrieval':
            factory = (parameters) => new DataRetrievalExpert(parameters);
            break;
          case 'llm-summarization':
            factory = (parameters) => new LLMSummarizationExpert(parameters);
            break;
          case 'query-reformulation':
            factory = (parameters) => new QueryReformulationExpert(parameters);
            break;
          case 'document-filtering':
            factory = (parameters) => new DocumentFilteringExpert(parameters);
            break;
          case 'fact-checking':
            factory = (parameters) => new FactCheckingExpert(parameters);
            break;
          case 'response-formatting':
            factory = (parameters) => new ResponseFormattingExpert(parameters);
            break;
          default:
            // For custom experts, create a generic factory
            factory = (parameters) => {
              // This is a placeholder implementation for custom experts
              const customExpert: any = {
                getName: () => storedExpert.name,
                getType: () => 'custom',
                getMetadata: () => storedExpert.metadata || {
                  version: '1.0.0',
                  description: storedExpert.description || `Custom expert: ${storedExpert.name}`,
                  tags: ['custom'],
                  createdAt: storedExpert.createdAt
                },
                getParameters: () => parameters || storedExpert.parameters || {},
                setParameters: (params: ExpertParameters) => {
                  // Update parameters
                },
                process: async (input: any, context: any, trace: any) => {
                  return {
                    result: `Custom expert '${storedExpert.name}' processed input: ${JSON.stringify(input)}`,
                    parameters: parameters || storedExpert.parameters || {}
                  };
                }
              };
              return customExpert;
            };
        }
        
        // Register the expert
        this.experts.set(storedExpert.name, {
          name: storedExpert.name,
          factory,
          description: storedExpert.description,
          parameters: storedExpert.parameters,
          metadata: storedExpert.metadata
        });
      });
      
      logger.info(`Loaded ${storedExperts.length} experts from storage`);
    } catch (error) {
      logger.error('Failed to load experts from storage', error instanceof Error ? error : undefined);
    }
  }

  // Register a change listener
  static addChangeListener(listener: () => void): void {
    this.listeners.push(listener);
  }

  // Remove a change listener
  static removeChangeListener(listener: () => void): void {
    const index = this.listeners.indexOf(listener);
    if (index !== -1) {
      this.listeners.splice(index, 1);
    }
  }

  // Notify all listeners of a change
  private static notifyChange(): void {
    this.listeners.forEach(listener => listener());
  }

  // Register an expert
  static register(config: ExpertConfig): void {
    // Ensure registry is initialized
    if (!this.initialized) {
      this.initialize();
    }

    if (this.experts.has(config.name)) {
      logger.warn(`Expert with name ${config.name} already registered. Overwriting configuration.`);
    }
    
    // Add to in-memory registry
    this.experts.set(config.name, config);
    
    // Add to persistent storage
    const existingExpert = getExpertByName(config.name);
    if (existingExpert) {
      // Update existing expert
      updateExpert(existingExpert.id, {
        description: config.description,
        parameters: config.parameters,
        metadata: config.metadata
      });
    } else {
      // Add new expert
      addExpert({
        name: config.name,
        factory: config.factory,
        description: config.description,
        parameters: config.parameters,
        metadata: config.metadata,
        isBuiltIn: false
      });
    }
    
    logger.info(`Registered expert: ${config.name}`);
    this.notifyChange();
  }

  // Unregister an expert
  static unregister(name: string): boolean {
    // Ensure registry is initialized
    if (!this.initialized) {
      this.initialize();
    }

    // Check if expert exists
    const expert = getExpertByName(name);
    if (!expert) {
      logger.warn(`Expert with name ${name} not found. Nothing to unregister.`);
      return false;
    }
    
    // Don't allow unregistering built-in experts
    if (expert.isBuiltIn) {
      logger.warn(`Cannot unregister built-in expert: ${name}`);
      return false;
    }
    
    // Remove from in-memory registry
    const result = this.experts.delete(name);
    
    // Remove from persistent storage
    if (result) {
      deleteExpert(expert.id);
      logger.info(`Unregistered expert: ${name}`);
      this.notifyChange();
    }
    
    return result;
  }

  // Get an expert instance
  static getExpert(name: string): IExpert {
    // Ensure registry is initialized
    if (!this.initialized) {
      this.initialize();
    }

    const config = this.experts.get(name);
    if (!config) {
      throw new ExpertNotFoundError(name);
    }
    // Create a new instance each time getExpert is called
    // Only pass parameters if they exist
    return config.parameters ? config.factory(config.parameters) : config.factory();
  }

  // Get all available expert names
  static getAvailableExperts(): string[] {
    // Ensure registry is initialized
    if (!this.initialized) {
      this.initialize();
    }

    return Array.from(this.experts.keys());
  }

  // Get expert configuration
  static getExpertConfig(name: string): ExpertConfig | undefined {
    // Ensure registry is initialized
    if (!this.initialized) {
      this.initialize();
    }

    return this.experts.get(name);
  }

  // Get all expert configurations
  static getAllExpertConfigs(): ExpertConfig[] {
    // Ensure registry is initialized
    if (!this.initialized) {
      this.initialize();
    }

    return Array.from(this.experts.values());
  }
}

// Initialize the registry on module load
ExpertRegistry.initialize();

// Log available experts on startup (optional)
logger.info("Available experts:", { experts: ExpertRegistry.getAvailableExperts() });