// Base error class for all chain-related errors
export class ChainError extends Error {
  public readonly context?: any; // Optional context for debugging

  constructor(message: string, context?: any) {
    super(message);
    this.name = this.constructor.name; // Set the error name to the class name
    this.context = context;
    // Maintain stack trace (V8 specific)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

// Error specific to an expert's execution
export class ExpertError extends ChainError {
  public readonly expertName: string;

  constructor(message: string, expertName: string, context?: any) {
    super(`Error in expert '${expertName}': ${message}`, context);
    this.expertName = expertName;
  }
}

// Error related to chain configuration or orchestration
export class ChainExecutionError extends ChainError {
  constructor(message: string, context?: any) {
    super(`Chain execution error: ${message}`, context);
  }
}

// Example of a more specific expert error
export class DataValidationError extends ExpertError {
  constructor(expertName: string, validationDetails: string, context?: any) {
    super(`Data validation failed. Details: ${validationDetails}`, expertName, context);
  }
}

// Error related to chain configuration (e.g., missing expert)
export class ChainConfigurationError extends ChainError {
  constructor(message: string, context?: any) {
    super(`Chain configuration error: ${message}`, context);
  }
}

// Example of a configuration error
export class ExpertNotFoundError extends ChainConfigurationError {
    constructor(expertName: string) {
        super(`Expert '${expertName}' not found in registry.`);
    }
}

// Type guard to check for ChainError instances
export function isChainError(error: unknown): error is ChainError {
  return error instanceof ChainError;
}