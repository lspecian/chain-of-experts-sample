import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LangfuseTraceClient } from 'langfuse';
import { getLLMProviderFactory } from '../llm';
import { logger } from '../utils/logger';
import { LLMMessage, LLMProvider } from '../llm/types';

interface LLMSummarizationParameters {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export class LLMSummarizationExpert extends BaseExpert {
  constructor(parameters?: ExpertParameters) {
    super('llm-summarization', 'summarization-llm', parameters);
    
    // Log initialization with current parameters
    const params = this.getParameters() as LLMSummarizationParameters;
    logger.info(`Initialized ${this.name} expert with provider: ${params.provider}, model: ${params.model}`);
  }
  
  // Override to provide default parameters specific to this expert
  protected getDefaultParameters(): ExpertParameters {
    return {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 500,
      systemPrompt: 'You are a helpful assistant that summarizes documents clearly and concisely.'
    };
  }
  
  // Override to validate parameters specific to this expert
  validateParameters(parameters: ExpertParameters): boolean {
    // Validate temperature is between 0 and 1
    if (parameters.temperature !== undefined &&
        (typeof parameters.temperature !== 'number' ||
         parameters.temperature < 0 ||
         parameters.temperature > 1)) {
      return false;
    }
    
    // Validate maxTokens is a positive number
    if (parameters.maxTokens !== undefined &&
        (typeof parameters.maxTokens !== 'number' ||
         parameters.maxTokens <= 0)) {
      return false;
    }
    
    // Validate provider and model are non-empty strings if provided
    if (parameters.provider !== undefined &&
        (typeof parameters.provider !== 'string' ||
         parameters.provider.trim() === '')) {
      return false;
    }
    
    if (parameters.model !== undefined &&
        (typeof parameters.model !== 'string' ||
         parameters.model.trim() === '')) {
      return false;
    }
    
    return true;
  }

  async process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput> {
    logger.info(`Expert '${this.name}': Processing input...`);
    
    // Get current parameters
    const params = this.getParameters() as LLMSummarizationParameters;
    
    // Create a copy of parameters that we can modify for this specific request
    const requestParams = { ...params };
    
    // Check if provider is specified in the input
    if (input.llmProvider) {
      requestParams.provider = input.llmProvider;
      logger.info(`Expert '${this.name}': Using provider from input: ${requestParams.provider}`);
    }
    
    // Check if model is specified in the input
    if (input.llmModel) {
      requestParams.model = input.llmModel;
      logger.info(`Expert '${this.name}': Using model from input: ${requestParams.model}`);
    }
    
    // Get documents from previous expert or input
    // Ensure input.expertOutput exists and has a documents property
    const documents = input.expertOutput?.documents || input.documents; 
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      logger.warn(`Expert '${this.name}': No valid documents found for summarization.`);
      // Return a specific output indicating no action was taken
      return { summary: "No documents provided for summarization.", skipped: true }; 
    }

    // Create a generation for this LLM call
    const generation = trace.generation({
      name: `${this.name}-generation`,
      input: { documents }, // Log the input documents
      model: requestParams.model || 'gpt-4o', // Provide default value
      modelParameters: {
        temperature: requestParams.temperature || 0.7, // Provide default value
        max_tokens: requestParams.maxTokens || 500 // Provide default value
      },
      metadata: {
        expertType: this.type,
        provider: requestParams.provider || 'openai' // Provide default value
      },
    });

    try {
      // Prepare documents for the prompt
      const documentText = documents
        .map((doc: any, index: number) => `Document ${index + 1}: ${doc.content}`)
        .join('\n\n');
      
      // Get the LLM provider factory
      const llmFactory = getLLMProviderFactory();
      
      // Function to get provider and handle errors
      const getProvider = (providerName: string): LLMProvider => {
        const provider = llmFactory.getProvider(providerName);
        if (!provider) {
          throw new Error(`LLM provider '${providerName}' not found or not registered.`);
        }
        return provider;
      };

      // Attempt to use the specified or default provider
      try {
        const providerName = requestParams.provider || 'openai'; // Provide default value
        const modelName = requestParams.model || 'gpt-4o'; // Provide default value
        
        logger.info(`Expert '${this.name}': Attempting to use ${providerName} provider with model ${modelName}`);
        const llmProvider = getProvider(providerName);
        
        // Create completion request
        const completionRequest = {
          messages: [
            { role: "system" as const, content: requestParams.systemPrompt || "You are a summarization expert. Provide a concise summary of the documents." },
            { role: "user" as const, content: `Summarize the following documents:\n\n${documentText}` }
          ],
          model: requestParams.model,
          temperature: requestParams.temperature,
          maxTokens: requestParams.maxTokens
        };
        
        // Call LLM provider
        logger.info(`Expert '${this.name}': Calling ${requestParams.provider} API...`);
        const completionResponse = await llmProvider.createCompletion(completionRequest);
        
        const summary = completionResponse.content;
        const usage = completionResponse.usage;

        if (!summary) {
          throw new Error("LLM failed to generate a summary.");
        }

        logger.info(`Expert '${this.name}': ${requestParams.provider} call successful.`);
        // End generation with successful output
        generation.end({
          output: summary,
          usage: usage ? {
            input: usage.promptTokens,
            output: usage.completionTokens,
            total: usage.totalTokens
          } : undefined,
        });

        return {
          summary,
          summaryLength: summary.length,
          tokenUsage: usage ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens
          } : undefined,
          provider: requestParams.provider,
          model: requestParams.model
        };
      } catch (providerError) {
        logger.error(`Expert '${this.name}': Error with provider ${requestParams.provider}`,
          providerError instanceof Error ? providerError : undefined);
        
        // If the requested provider is not the default, try falling back to the default provider
        if ((requestParams.provider || 'openai') !== 'openai') {
          logger.info(`Expert '${this.name}': Falling back to default provider (openai)`);
          
          try {
            // Reset to default provider
            requestParams.provider = 'openai';
            requestParams.model = 'gpt-4o';
            
            // Get the default provider
            const defaultProvider = getProvider('openai');
            
            // Create completion request
            const fallbackRequest = {
              messages: [
                { role: "system" as const, content: "You are a summarization expert. Provide a concise summary of the documents." },
                { role: "user" as const, content: `Summarize the following documents:\n\n${documentText}` }
              ],
              model: requestParams.model,
              temperature: requestParams.temperature,
              maxTokens: requestParams.maxTokens
            };
            
            // Call default provider
            logger.info(`Expert '${this.name}': Calling fallback provider (openai) API...`);
            const fallbackResponse = await defaultProvider.createCompletion(fallbackRequest);
            
            const summary = fallbackResponse.content;
            const usage = fallbackResponse.usage;
            
            if (!summary) {
              throw new Error("Fallback LLM failed to generate a summary.");
            }
            
            logger.info(`Expert '${this.name}': Fallback provider call successful.`);
            // End generation with successful output from fallback
            generation.end({
              output: summary,
              usage: usage ? {
                input: usage.promptTokens,
                output: usage.completionTokens,
                total: usage.totalTokens
              } : undefined,
              metadata: {
                fallback: true,
                originalProvider: input.llmProvider,
                fallbackProvider: 'openai'
              }
            });
            
            return {
              summary,
              summaryLength: summary.length,
              tokenUsage: usage ? {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens
              } : undefined,
              provider: requestParams.provider,
              model: requestParams.model,
              fallback: true,
              originalProvider: input.llmProvider
            };
          } catch (fallbackError) {
            logger.error(`Expert '${this.name}': Error with fallback provider`,
              fallbackError instanceof Error ? fallbackError : undefined);
            throw fallbackError;
          }
        } else {
          // If we're already using the default provider, just throw the error
          throw providerError;
        }
      }
    } catch (error) {
      logger.error(`Expert '${this.name}': Error during LLM call`, error instanceof Error ? error : undefined);
      // End generation with error
      generation.end({
        output: { 
          error: "Summarization failed",
          message: error instanceof Error ? error.message : "Unknown error"
        }
      });
      throw error; // Re-throw
    }
  }
}