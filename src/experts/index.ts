import { IExpert, ExpertParameters } from './baseExpert'; // Import ExpertParameters
import { ExpertMetadata } from '../chain/types';
import { DataRetrievalExpert } from './expert1';
import { LLMSummarizationExpert } from './expert2';
import { ExpertNotFoundError } from '../chain/errors';

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

  // Static initialization block to register default experts
  static {
    this.register({
      name: 'data-retrieval',
      factory: (parameters) => new DataRetrievalExpert(parameters),
      description: 'Retrieves relevant documents based on a query',
      parameters: {
        collectionName: 'sample_documents',
        numResults: 3
      }
    });
    
    this.register({
      name: 'llm-summarization',
      factory: (parameters) => new LLMSummarizationExpert(parameters),
      description: 'Summarizes documents using an LLM',
      parameters: {
        maxTokens: 500,
        temperature: 0.7
      }
    });
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
    if (this.experts.has(config.name)) {
      console.warn(`Expert with name ${config.name} already registered. Overwriting configuration.`);
    }
    this.experts.set(config.name, config);
    console.log(`Registered expert: ${config.name}`);
    this.notifyChange();
  }

  // Unregister an expert
  static unregister(name: string): boolean {
    const result = this.experts.delete(name);
    if (result) {
      console.log(`Unregistered expert: ${name}`);
      this.notifyChange();
    } else {
      console.warn(`Expert with name ${name} not found. Nothing to unregister.`);
    }
    return result;
  }

  // Get an expert instance
  static getExpert(name: string): IExpert {
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
    return Array.from(this.experts.keys());
  }

  // Get expert configuration
  static getExpertConfig(name: string): ExpertConfig | undefined {
    return this.experts.get(name);
  }

  // Get all expert configurations
  static getAllExpertConfigs(): ExpertConfig[] {
    return Array.from(this.experts.values());
  }
}

// Log available experts on startup (optional)
console.log("Available experts:", ExpertRegistry.getAvailableExperts());