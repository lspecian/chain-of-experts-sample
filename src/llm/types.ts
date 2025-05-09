/**
 * Types and interfaces for LLM providers
 */

/**
 * Common message format for all LLM providers
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Common completion request format for all LLM providers
 */
export interface LLMCompletionRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string[];
}

/**
 * Common completion response format for all LLM providers
 */
export interface LLMCompletionResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model?: string;
  finishReason?: string;
}

/**
 * Common embedding request format for all LLM providers
 */
export interface LLMEmbeddingRequest {
  input: string | string[];
  model?: string;
}

/**
 * Common embedding response format for all LLM providers
 */
export interface LLMEmbeddingResponse {
  embeddings: number[][];
  usage?: {
    promptTokens: number;
    totalTokens: number;
  };
}

/**
 * Base interface for all LLM providers
 */
export interface LLMProvider {
  /**
   * Get the name of the provider
   */
  getName(): string;

  /**
   * Get the available models for this provider
   */
  getAvailableModels(): string[];

  /**
   * Get the default model for this provider
   */
  getDefaultModel(): string;

  /**
   * Create a completion (chat) with the provider
   * @param request The completion request
   * @returns The completion response
   */
  createCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse>;

  /**
   * Create embeddings with the provider
   * @param request The embedding request
   * @returns The embedding response
   */
  createEmbedding(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResponse>;
}

import { RequestBatcherOptions } from './requestBatcher'; // Import batcher options

/**
 * Configuration for LLM providers
 */
export interface LLMProviderConfig {
  provider: string;
  model?: string;
  apiKey?: string;
  organization?: string;
  baseUrl?: string;
  batchingEnabled?: boolean;
  batcherOptions?: RequestBatcherOptions;
  [key: string]: any;
}

/**
 * Per-expert LLM configuration
 */
export interface ExpertLLMConfig {
  expertName: string;
  provider?: string;
  model?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  selectionStrategy?: string;
  maxCost?: number;
  priority?: 'speed' | 'quality' | 'cost' | 'balanced';
  [key: string]: any;
}

/**
 * Extended configuration for LLM providers with per-expert settings
 */
export interface ExtendedLLMConfig {
  providers: LLMProviderConfig[];
  defaultProvider: string;
  defaultSelectionStrategy?: string;
  expertConfigs?: ExpertLLMConfig[];
}