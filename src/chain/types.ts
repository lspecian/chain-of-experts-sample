
import { CacheOptions as BaseCacheOptions } from '../cache/cacheManager';
import { RedisCacheOptions } from '../cache/redisCacheManager'; // Import RedisCacheOptions

// --- Core Chain Input/Output ---

export interface ExpertOutput {
  [key: string]: unknown;
}

export interface ChainInput {
  type: string; // Identifier for the type of input/request
  query?: string; // Primary query or instruction
  context?: unknown; // Initial context data
  expertOutput?: ExpertOutput; // Output from the *previous* expert in the sequence
  llmProvider?: string; // Optional LLM provider name
  llmModel?: string; // Optional LLM model name
  [key: string]: unknown; // Allow for additional arbitrary properties
}

// Interface for intermediate results from each expert in the chain
export interface IntermediateResult {
  expertName: string;
  expertType: string;
  expertIndex: number;
  input: ChainInput;
  output: ExpertOutput;
  timestamp: string;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  provider?: string;
  model?: string;
}

export interface ChainOutput {
  result: ExpertOutput | null; // Final output from the last expert
  intermediateResults?: IntermediateResult[]; // Results from each expert in the chain
  success: boolean;
  error?: string; // Error message if success is false
  tokenUsage?: TokenUsage; // Token usage information
  durationMs?: number; // Processing time in milliseconds
}

// --- Context Object ---

// Interface for the context shared and potentially modified by experts
export interface ChainContext {
  // Read-only properties often set at the start
  readonly initialInput: ChainInput;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly traceId?: string; // Link to Langfuse trace if needed

  // Mutable state that experts can read/write
  // Use a Map for flexible, typed storage
  state: Map<string, any>; 

  // Methods for interacting with state (implement in context class)
  // get<T>(key: string): T | undefined;
  // set<T>(key: string, value: T): void;
  // has(key: string): boolean;
  // delete(key: string): boolean;
  // clear(): void;

  // Optional: History tracking
  // history: Array<{ expertName: string; input: any; output: any; timestamp: Date }>;
}

// --- Expert Metadata ---

export interface ExpertMetadata {
  version?: string;
  tags?: string[];
  description?: string;
  author?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: any; // Allow for additional arbitrary properties
}

// --- Configuration Options ---

export interface RetryOptions {
  maxAttempts?: number; // Maximum number of attempts (including the first one)
  delayMs?: number; // Initial delay in milliseconds
  backoffFactor?: number; // Multiplier for delay (e.g., 2 for exponential backoff)
}

export interface ExpertOptions {
  timeoutMs?: number;
  retryOptions?: RetryOptions;
  rateLimit?: {
    requestsPerInterval?: number;
    intervalMs?: number;
  };
  circuitBreaker?: {
    failureThreshold?: number; // Number of failures to open the circuit
    resetTimeoutMs?: number;  // Time to wait before attempting to close (half-open state)
  };
  // Add other expert-specific options
}

export type ExecutionMode = 'sequential' | 'parallel';

export interface ChainOptions {
  executionMode?: ExecutionMode; // Default is 'sequential'
  failFast?: boolean; // Stop on first error? (Relevant for sequential)
  defaultExpertOptions?: ExpertOptions;
  onIntermediateResult?: (result: IntermediateResult) => void; // Callback for streaming intermediate results
  cache?: (BaseCacheOptions & { type?: 'memory' }) | (RedisCacheOptions & { type: 'redis' }); // Caching options
  skipCache?: boolean; // Skip cache for this execution (override cache.enabled)
  expertParameters?: Record<string, Record<string, string | number | boolean | undefined>>; // Parameters for specific experts
  maxConcurrency?: number; // Max number of experts to run in parallel
  // Add other chain-level options
}

// --- Result Types (Potentially more specific than ExpertOutput) ---

// Example: Define specific result types if needed, otherwise rely on ExpertOutput
export interface RetrievalResult extends ExpertOutput {
  documents: Array<{ id: string; content: string; score: number }>;
  relevanceScore: number;
}

export interface SummarizationResult extends ExpertOutput {
  summary: string;
  tokenUsage?: { input: number; output: number; total: number };
}

// You might not need separate ExpertResult/ChainResult if ChainOutput suffices
// export type ExpertResult = ExpertOutput; 
// export type FinalChainResult = ChainOutput;