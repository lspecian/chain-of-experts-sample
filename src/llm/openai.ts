import { OpenAI } from 'openai';
import { 
  LLMProvider, 
  LLMCompletionRequest, 
  LLMCompletionResponse, 
  LLMEmbeddingRequest, 
  LLMEmbeddingResponse,
  LLMProviderConfig
} from './types';
import { logger } from '../utils/logger';

/**
 * OpenAI LLM provider implementation
 */
export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private config: LLMProviderConfig;
  private availableModels: string[] = [
    'gpt-4o',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'text-embedding-ada-002',
    'text-embedding-3-small',
    'text-embedding-3-large'
  ];
  private defaultCompletionModel = 'gpt-4o';
  private defaultEmbeddingModel = 'text-embedding-ada-002';

  constructor(config: LLMProviderConfig) {
    this.config = config;
    
    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
      organization: config.organization,
      baseURL: config.baseUrl
    });
    
    logger.info(`Initialized OpenAI provider with model: ${this.getDefaultModel()}`);
  }

  getName(): string {
    return 'openai';
  }

  getAvailableModels(): string[] {
    return this.availableModels;
  }

  getDefaultModel(): string {
    return this.config.model || this.defaultCompletionModel;
  }

  async createCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    try {
      logger.info(`OpenAI: Creating completion with model: ${request.model || this.getDefaultModel()}`);
      
      // Convert to OpenAI format
      const completion = await this.client.chat.completions.create({
        model: request.model || this.getDefaultModel(),
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        top_p: request.topP,
        frequency_penalty: request.frequencyPenalty,
        presence_penalty: request.presencePenalty,
        stop: request.stop
      });

      // Convert to common format
      return {
        content: completion.choices[0]?.message?.content || '',
        usage: completion.usage ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens
        } : undefined,
        model: completion.model,
        finishReason: completion.choices[0]?.finish_reason
      };
    } catch (error) {
      logger.error('OpenAI completion error', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  async createEmbedding(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResponse> {
    try {
      logger.info(`OpenAI: Creating embedding with model: ${request.model || this.defaultEmbeddingModel}`);
      
      // Convert to OpenAI format
      const embedding = await this.client.embeddings.create({
        model: request.model || this.defaultEmbeddingModel,
        input: request.input
      });

      // Convert to common format
      return {
        embeddings: embedding.data.map(item => item.embedding),
        usage: embedding.usage ? {
          promptTokens: embedding.usage.prompt_tokens,
          totalTokens: embedding.usage.total_tokens
        } : undefined
      };
    } catch (error) {
      logger.error('OpenAI embedding error', error instanceof Error ? error : undefined);
      throw error;
    }
  }
}