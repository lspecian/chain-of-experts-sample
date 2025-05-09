/**
 * Chain of Experts Response Parser Utility
 * 
 * This utility provides functions to parse, validate, and structure the Chain of Experts API responses
 * for consumption by the frontend visualization components.
 */

// Type definitions for Chain of Experts API response data
export interface ExpertContribution {
  expertName: string;
  expertType: string;
  expertIndex: number;
  input: unknown;
  output: unknown;
  timestamp: string;
  durationMs?: number;
}

export interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
  provider?: string;
  model?: string;
  cost?: number;
}

export interface ChainResult {
  summary?: string;
  answer?: string;
  result?: unknown;
  intermediateResults?: ExpertContribution[];
  tokenUsage?: TokenUsage;
  traceId?: string;
  durationMs?: number;
  success: boolean;
  error?: string;
}

/**
 * Parse raw Chain of Experts API response data into a structured format
 * @param data - Raw API response data (can be string JSON or object)
 * @returns Structured ChainResult object
 */
export function parseChainResponse(data: unknown): ChainResult {
  if (!data) {
    return { success: false, error: 'No data provided' };
  }

  try {
    // If data is a string, try to parse it as JSON
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    
    // Extract key components from the response
    return {
      summary: extractSummary(parsedData),
      answer: parsedData.answer,
      result: parsedData.result,
      intermediateResults: validateIntermediateResults(parsedData.intermediateResults),
      tokenUsage: validateTokenUsage(parsedData.tokenUsage),
      traceId: parsedData.traceId,
      durationMs: parsedData.durationMs,
      success: parsedData.success !== false,
      error: parsedData.error
    };
  } catch (error) {
    console.error('Error parsing Chain of Experts response:', error);
    
    // If parsing fails, return the original data with error flag
    return {
      result: data,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse response data'
    };
  }
}

/**
 * Extract a summary from the response data, trying different fields
 * @param data - Parsed API response data
 * @returns Summary string or undefined
 */
function extractSummary(data: Record<string, unknown>): string | undefined {
  // Try different fields that might contain summary information
  const summary = data.summary;
  const answer = data.answer;
  const result = data.result;
  
  if (typeof summary === 'string') return summary;
  if (typeof answer === 'string') return answer;
  if (typeof result === 'string') return result;
  
  return undefined;
}

/**
 * Validate and normalize intermediate results
 * @param results - Raw intermediate results array
 * @returns Validated array of ExpertContribution objects
 */
function validateIntermediateResults(results: unknown): ExpertContribution[] {
  if (!results || !Array.isArray(results)) {
    return [];
  }

  return results.map((result, index) => {
    // Type guard to ensure result is an object
    const expertResult = result as Record<string, unknown>;
    
    // Ensure each result has required fields, use defaults for missing ones
    return {
      expertName: typeof expertResult.expertName === 'string' ? expertResult.expertName : `Expert ${index + 1}`,
      expertType: typeof expertResult.expertType === 'string' ? expertResult.expertType : 'Unknown',
      expertIndex: typeof expertResult.expertIndex === 'number' ? expertResult.expertIndex : index,
      input: expertResult.input,
      output: expertResult.output,
      timestamp: typeof expertResult.timestamp === 'string' ? expertResult.timestamp : new Date().toISOString(),
      durationMs: typeof expertResult.durationMs === 'number' ? expertResult.durationMs : undefined
    };
  });
}

/**
 * Validate and normalize token usage data
 * @param usage - Raw token usage data
 * @returns Validated TokenUsage object or undefined
 */
function validateTokenUsage(usage: unknown): TokenUsage | undefined {
  if (!usage || typeof usage !== 'object' || usage === null) {
    return undefined;
  }

  // Type assertion after checking it's an object
  const tokenUsage = usage as Record<string, unknown>;

  // Ensure all required fields exist with sensible defaults
  return {
    total: typeof tokenUsage.total === 'number' ? tokenUsage.total : 0,
    prompt: typeof tokenUsage.prompt === 'number' ? tokenUsage.prompt : 0,
    completion: typeof tokenUsage.completion === 'number' ? tokenUsage.completion : 0,
    provider: typeof tokenUsage.provider === 'string' ? tokenUsage.provider : undefined,
    model: typeof tokenUsage.model === 'string' ? tokenUsage.model : undefined,
    cost: typeof tokenUsage.cost === 'number' ? tokenUsage.cost : undefined
  };
}

/**
 * Format duration in a human-readable way
 * @param ms - Duration in milliseconds
 * @returns Formatted duration string
 */
export function formatDuration(ms?: number): string {
  if (!ms) return 'N/A';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format timestamp in a human-readable way
 * @param timestamp - ISO timestamp string
 * @returns Formatted time string
 */
export function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return 'N/A';
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return timestamp;
  }
}

/**
 * Calculate the total cost of a chain execution based on token usage
 * @param tokenUsage - Token usage data
 * @param costPerToken - Cost per token in dollars (default: 0.000002)
 * @returns Formatted cost string
 */
export function calculateCost(tokenUsage?: TokenUsage, costPerToken: number = 0.000002): string {
  if (!tokenUsage || !tokenUsage.total) return 'N/A';
  
  // Use provided cost if available, otherwise calculate
  const cost = tokenUsage.cost ?? (tokenUsage.total * costPerToken);
  
  // Format as currency
  return `$${cost.toFixed(6)}`;
}

/**
 * Extract expert names from intermediate results
 * @param results - Array of expert contributions
 * @returns Array of expert names in order
 */
export function extractExpertSequence(results?: ExpertContribution[]): string[] {
  if (!results || !Array.isArray(results)) {
    return [];
  }
  
  // Sort by expertIndex and extract names
  return [...results]
    .sort((a, b) => a.expertIndex - b.expertIndex)
    .map(result => result.expertName);
}

/**
 * Check if the response contains an error
 * @param result - Chain result object
 * @returns Boolean indicating if there's an error
 */
export function hasError(result: ChainResult): boolean {
  return !result.success || !!result.error;
}

/**
 * Get a user-friendly error message
 * @param result - Chain result object
 * @returns Formatted error message
 */
export function getErrorMessage(result: ChainResult): string {
  if (!hasError(result)) {
    return '';
  }
  
  return result.error || 'An unknown error occurred while processing the request';
}