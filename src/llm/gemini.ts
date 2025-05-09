import { GoogleGenerativeAI, GenerativeModel, EmbedContentRequest, Content, TaskType } from '@google/generative-ai';
import { 
  LLMProvider, 
  LLMCompletionRequest, 
  LLMCompletionResponse, 
  LLMEmbeddingRequest, 
  LLMEmbeddingResponse,
  LLMProviderConfig,
  LLMMessage
} from './types';
import { logger } from '../utils/logger';

/**
 * Google Gemini LLM provider implementation
 */
export class GeminiProvider implements LLMProvider {
  private client: GoogleGenerativeAI;
  private config: LLMProviderConfig;
  private availableModels: string[] = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-1.0-pro',
    'embedding-001'
  ];
  private defaultCompletionModel = 'gemini-1.5-pro';
  private defaultEmbeddingModel = 'embedding-001';

  constructor(config: LLMProviderConfig) {
    this.config = config;
    
    // Initialize Gemini client
    this.client = new GoogleGenerativeAI(
      config.apiKey || process.env.GOOGLE_API_KEY || ''
    );
    
    logger.info(`Initialized Gemini provider with model: ${this.getDefaultModel()}`);
  }

  getName(): string {
    return 'gemini';
  }

  getAvailableModels(): string[] {
    return this.availableModels;
  }

  getDefaultModel(): string {
    return this.config.model || this.defaultCompletionModel;
  }

  /**
   * Convert standard LLM messages to Gemini format
   */
  private convertMessagesToGeminiFormat(messages: LLMMessage[]): Content[] {
    const geminiMessages: Content[] = [];
    
    // Handle system message specially since Gemini doesn't have a system role
    const systemMessage = messages.find(msg => msg.role === 'system');
    
    // Process messages in order, but handle system message specially
    for (const message of messages) {
      if (message.role === 'system') {
        // Skip system messages as they're handled separately
        continue;
      } else if (message.role === 'user') {
        // For the first user message, prepend the system message if it exists
        if (systemMessage && geminiMessages.length === 0) {
          geminiMessages.push({
            role: 'user',
            parts: [{ text: `${systemMessage.content}\n\n${message.content}` }]
          });
        } else {
          geminiMessages.push({
            role: 'user',
            parts: [{ text: message.content }]
          });
        }
      } else if (message.role === 'assistant') {
        geminiMessages.push({
          role: 'model',
          parts: [{ text: message.content }]
        });
      }
    }
    
    return geminiMessages;
  }

  async createCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    try {
      const modelName = request.model || this.getDefaultModel();
      logger.info(`Gemini: Creating completion with model: ${modelName}`);
      
      // Get the model
      const model = this.client.getGenerativeModel({ model: modelName });
      
      // Convert messages to Gemini format
      const geminiMessages = this.convertMessagesToGeminiFormat(request.messages);
      
      // Create chat session
      const chat = model.startChat({
        generationConfig: {
          temperature: request.temperature,
          topP: request.topP,
          maxOutputTokens: request.maxTokens,
          stopSequences: request.stop
        }
      });
      
      // Send the last user message
      const lastUserMessage = geminiMessages[geminiMessages.length - 1];
      const messageText = lastUserMessage.parts[0]?.text || '';
      const result = await chat.sendMessage(messageText);
      const response = await result.response;
      const text = response.text();
      
      // Gemini doesn't provide token usage, so we'll estimate
      const estimatedPromptTokens = geminiMessages.reduce(
        (sum, msg) => sum + ((msg.parts[0]?.text?.length || 0) / 4), 0
      );
      const estimatedCompletionTokens = text.length / 4;
      
      return {
        content: text,
        usage: {
          promptTokens: Math.ceil(estimatedPromptTokens),
          completionTokens: Math.ceil(estimatedCompletionTokens),
          totalTokens: Math.ceil(estimatedPromptTokens + estimatedCompletionTokens)
        },
        model: modelName,
        finishReason: 'stop' // Gemini doesn't provide finish reason
      };
    } catch (error) {
      logger.error('Gemini completion error', error instanceof Error ? error : undefined);
      throw error;
    }
  }

  async createEmbedding(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResponse> {
    try {
      const modelName = request.model || this.defaultEmbeddingModel;
      logger.info(`Gemini: Creating embedding with model: ${modelName}`);
      
      // Get the embedding model
      const model = this.client.getGenerativeModel({ model: modelName });
      
      // Convert input to array if it's a string
      const inputs = Array.isArray(request.input) ? request.input : [request.input];
      
      // Process each input and get embeddings
      const embeddings: number[][] = [];
      for (const input of inputs) {
        const embeddingRequest: EmbedContentRequest = {
          content: {
            role: 'user',
            parts: [{ text: input }]
          },
          taskType: TaskType.RETRIEVAL_DOCUMENT
        };
        const embeddingResult = await model.embedContent(embeddingRequest);
        
        embeddings.push(embeddingResult.embedding.values);
      }
      
      // Estimate token usage (Gemini doesn't provide this)
      const estimatedTokens = inputs.reduce((sum, input) => {
        return sum + (typeof input === 'string' ? input.length / 4 : 0);
      }, 0);
      
      return {
        embeddings,
        usage: {
          promptTokens: Math.ceil(estimatedTokens),
          totalTokens: Math.ceil(estimatedTokens)
        }
      };
    } catch (error) {
      logger.error('Gemini embedding error', error instanceof Error ? error : undefined);
      throw error;
    }
  }
}