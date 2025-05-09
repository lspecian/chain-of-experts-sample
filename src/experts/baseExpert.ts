import { ChainInput, ExpertMetadata } from '../chain/types';
// Import LangfuseSpanClient and LangfuseGenerationClient
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';

export interface ExpertOutput {
  [key: string]: any;
}

// Re-export ExpertOutput for convenience

// Expert parameter type definition
export type ExpertParameters = Record<string, any>;

// Renamed from Expert to IExpert as per subtask 16.1
export interface IExpert {
  getName(): string;
  getType(): string;
  // Added canHandle as per subtask details (though not in original snippet)
  canHandle?(input: ChainInput, context: ChainContext): boolean;
  process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput>;
  // Added getMetadata as per subtask details
  getMetadata?(): ExpertMetadata;
  // Methods for parameter handling
  getParameters(): ExpertParameters;
  setParameters(parameters: ExpertParameters): void;
  // Method to validate parameters (optional implementation)
  validateParameters?(parameters: ExpertParameters): boolean;
  // Method for custom scoring
  calculateScores?(output: ExpertOutput, langfuseObject: LangfuseSpanClient | LangfuseGenerationClient, trace: LangfuseTraceClient): Promise<void>;
  // Method for an expert to declare what parts of context it needs
  getRequiredContextKeys?(): { state?: string[]; expertOutput?: string[]; chainInput?: string[] };
}

// BaseExpert now implements IExpert
export abstract class BaseExpert implements IExpert {
  protected name: string;
  protected type: string;
  protected metadata?: ExpertMetadata;
  protected parameters: ExpertParameters;

  constructor(name: string, type: string, parameters: ExpertParameters = {}, metadata?: ExpertMetadata) {
    this.name = name;
    this.type = type;
    this.metadata = metadata;
    this.parameters = this.getDefaultParameters();
    
    // Apply provided parameters on top of defaults
    this.setParameters(parameters);
  }

  getName(): string {
    return this.name;
  }

  getType(): string {
    return this.type;
  }

  getMetadata(): ExpertMetadata {
    return this.metadata || {
      version: '1.0.0',
      tags: [],
      description: `${this.type} expert`
    };
  }

  // Parameter handling methods
  getParameters(): ExpertParameters {
    return { ...this.parameters }; // Return a copy to prevent direct modification
  }

  setParameters(parameters: ExpertParameters): void {
    // Validate parameters if the method is implemented
    if (this.validateParameters && !this.validateParameters(parameters)) {
      console.warn(`Invalid parameters provided for expert ${this.name}`);
      return;
    }

    // Merge with existing parameters (only update provided keys)
    this.parameters = {
      ...this.parameters,
      ...parameters
    };
  }

  // Default implementation for parameter validation
  validateParameters(parameters: ExpertParameters): boolean {
    return true; // By default, accept any parameters
  }

  // Method to get default parameters - should be overridden by subclasses
  protected getDefaultParameters(): ExpertParameters {
    return {}; // Empty by default
  }

  // Updated signature to include context
  abstract process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput>;

  // Default empty implementation for calculateScores
  async calculateScores(output: ExpertOutput, langfuseObject: LangfuseSpanClient | LangfuseGenerationClient, trace: LangfuseTraceClient): Promise<void> {
    // Base implementation does nothing. Subclasses should override this.
    // Example: langfuseObject.score({ name: 'relevance', value: 0.9, comment: 'High relevance' });
    return Promise.resolve();
  }
}

// Forward declaration for ChainContext (will be defined in types.ts)
// This avoids circular dependency issues if types.ts imports from baseExpert.ts
interface ChainContext {}