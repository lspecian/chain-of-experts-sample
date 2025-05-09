import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse'; // Added imports
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

  async process(input: ChainInput, context: ChainContext, parentTrace: LangfuseTraceClient): Promise<ExpertOutput> {
    // Create an overall span for this expert's processing, nested under parentTrace
    const expertSpan = parentTrace.span({
      name: `${this.name}-overall-processing`,
      input: { // Log a summary of the input
        type: input.type,
        query: input.query,
        dataKeys: input.data ? Object.keys(input.data) : undefined,
        expertOutputKeys: input.expertOutput ? Object.keys(input.expertOutput) : undefined,
        documentsProvided: (Array.isArray(input.expertOutput?.documents) ? input.expertOutput.documents.length : 0) + (Array.isArray(input.documents) ? input.documents.length : 0),
        llmProviderOverride: input.llmProvider,
        llmModelOverride: input.llmModel,
      },
      metadata: {
        expertName: this.name,
        expertType: this.type,
        appliedParameters: this.getParameters(), // Log initial parameters
        inputType: input.type,
        tags: [`expert-instance:${this.name}`, `expert-type:${this.type}`],
      },
    });
    // Store initial metadata for later merging
    const expertSpanInitialMetadata = { // Defined explicitly from what was passed
        expertName: this.name,
        expertType: this.type,
        appliedParameters: this.getParameters(),
        inputType: input.type,
        tags: [`expert-instance:${this.name}`, `expert-type:${this.type}`],
    };

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
    const documents = input.expertOutput?.documents || input.documents;
    
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      logger.warn(`Expert '${this.name}': No valid documents found for summarization.`);
      expertSpan.end({
        output: { summary: "No documents provided for summarization.", skipped: true },
        metadata: { ...expertSpanInitialMetadata, processingStatus: "skipped" }
      });
      return { summary: "No documents provided for summarization.", skipped: true };
    }
    
    // Update expert span with effective parameters for the LLM call
    const updatedExpertSpanMetadata = {
      ...expertSpanInitialMetadata,
      effectiveLLMParameters: {
        provider: requestParams.provider,
        model: requestParams.model,
        temperature: requestParams.temperature,
        maxTokens: requestParams.maxTokens,
        systemPromptLength: requestParams.systemPrompt?.length,
      },
      numDocumentsToSummarize: documents.length,
    };
    expertSpan.update({
      metadata: updatedExpertSpanMetadata
    });

    // Create a generation for this LLM call, nested under the expertSpan
    const generationStartTime = new Date();
    const generation = expertSpan.generation({ // Use expertSpan to create nested generation
      name: `${this.name}-llm-generation`,
      startTime: generationStartTime,
      // Input will be set before the call, output and usage after
      model: requestParams.model || 'gpt-4o',
      modelParameters: { // Log all parameters that will be sent
        temperature: requestParams.temperature || 0.7,
        max_tokens: requestParams.maxTokens || 500,
        // Potentially other model-specific params if they exist in requestParams
      },
      metadata: {
        expertName: this.name, // For context
        expertType: this.type,
        llmProvider: requestParams.provider || 'openai',
        tags: [`llm-call`, `summarization`, `provider:${requestParams.provider || 'openai'}`],
      },
    });
    // Store initial generation metadata
    const generationInitialMetadata = { // Defined explicitly
        expertName: this.name,
        expertType: this.type,
        llmProvider: requestParams.provider || 'openai',
        tags: [`llm-call`, `summarization`, `provider:${requestParams.provider || 'openai'}`],
    };

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

        // Update generation input before the call
        generation.update({ input: completionRequest.messages });
        
        // Call LLM provider
        logger.info(`Expert '${this.name}': Calling ${requestParams.provider} API...`);
        const completionResponse = await llmProvider.createCompletion(completionRequest);
        const generationEndTime = new Date();
        
        const summary = completionResponse.content;
        const usage = completionResponse.usage;

        if (!summary) {
          throw new Error("LLM failed to generate a summary.");
        }

        logger.info(`Expert '${this.name}': ${requestParams.provider} call successful.`);
        // End generation with successful output
        generation.end({
          output: summary,
          // endTime: generationEndTime, // Langfuse sets endTime automatically
          usage: usage ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens
          } : undefined,
          metadata: {
            ...generationInitialMetadata, // Merge with initial
            finalProvider: requestParams.provider,
            finalModel: requestParams.model,
          }
        });

        const expertOutput: ExpertOutput = {
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
        expertSpan.end({ output: expertOutput, metadata: { ...updatedExpertSpanMetadata, processingStatus: "success" } });
        return expertOutput;
      } catch (providerError) {
        logger.error(`Expert '${this.name}': Error with provider ${requestParams.provider}`,
          providerError instanceof Error ? providerError : undefined);
        
        // If the requested provider is not the default, try falling back to the default provider
        if ((requestParams.provider || 'openai') !== 'openai') {
          logger.info(`Expert '${this.name}': Falling back to default provider (openai)`);
          
          // Define these at this scope to be available in the inner try/catch
          const fallbackProviderName = 'openai';
          const fallbackModelName = 'gpt-4o';
          let generationMetadataForFallbackAttempt = { // Use let as it's reassigned in catch
            ...generationInitialMetadata,
            attemptedProvider: requestParams.provider,
            attemptedModel: requestParams.model,
            fallbackReason: providerError instanceof Error ? providerError.message : String(providerError),
            usingFallback: true,
            llmProvider: fallbackProviderName,
          };

          try {
            generation.update({
              model: fallbackModelName,
              metadata: generationMetadataForFallbackAttempt
            });
            
            // Get the default provider
            const defaultProvider = getProvider(fallbackProviderName);
            
            // Create completion request
            const fallbackRequest = {
              messages: [
                { role: "system" as const, content: requestParams.systemPrompt || "You are a summarization expert. Provide a concise summary of the documents." },
                { role: "user" as const, content: `Summarize the following documents:\n\n${documentText}` }
              ],
              model: fallbackModelName,
              temperature: requestParams.temperature,
              maxTokens: requestParams.maxTokens
            };

            // Update generation input for fallback call
            generation.update({ input: fallbackRequest.messages });
            
            // Call default provider
            logger.info(`Expert '${this.name}': Calling fallback provider (${fallbackProviderName}) API...`);
            const fallbackResponse = await defaultProvider.createCompletion(fallbackRequest);
            const fallbackGenerationEndTime = new Date();
            
            const summary = fallbackResponse.content;
            const usage = fallbackResponse.usage;
            
            if (!summary) {
              throw new Error("Fallback LLM failed to generate a summary.");
            }
            
            logger.info(`Expert '${this.name}': Fallback provider call successful.`);
            // End generation with successful output from fallback
            generation.end({
              output: summary,
              // endTime: fallbackGenerationEndTime, // Langfuse sets endTime automatically
              usage: usage ? {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens
              } : undefined,
              metadata: {
                ...generationMetadataForFallbackAttempt,
                finalProvider: fallbackProviderName,
                finalModel: fallbackModelName,
                fallbackSucceeded: true,
              }
            });
            
            const expertOutputFallback: ExpertOutput = {
              summary,
              summaryLength: summary.length,
              tokenUsage: usage ? {
                promptTokens: usage.promptTokens,
                completionTokens: usage.completionTokens,
                totalTokens: usage.totalTokens
              } : undefined,
              provider: fallbackProviderName, // Report the provider that succeeded
              model: fallbackModelName,       // Report the model that succeeded
              fallback: true,
              originalProvider: requestParams.provider, // The one that was initially requested
              originalModel: requestParams.model,
            };
            expertSpan.end({ output: expertOutputFallback, metadata: { ...updatedExpertSpanMetadata, processingStatus: "success-with-fallback" } });
            return expertOutputFallback;
          } catch (fallbackError) {
            // fallbackProviderName and fallbackModelName are in scope here
            logger.error(`Expert '${this.name}': Error with fallback provider (${fallbackProviderName})`,
              fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
            // End generation with error if fallback also fails
            generation.end({
              level: "ERROR",
              statusMessage: fallbackError instanceof Error ? fallbackError.message : "Fallback summarization failed",
              output: { error: "Fallback summarization failed", message: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) },
              metadata: { // generationMetadataForFallbackAttempt is in scope
                 ...generationMetadataForFallbackAttempt,
                 finalProvider: fallbackProviderName, // fallbackProviderName is in scope
                 finalModel: fallbackModelName, // fallbackModelName is in scope
                 fallbackSucceeded: false
              }
            });
            expertSpan.end({
              level: "ERROR",
              statusMessage: "Summarization failed after fallback attempt",
              output: {
                error: "Summarization failed after fallback",
                originalError: providerError instanceof Error ? providerError.message : String(providerError),
                fallbackError: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
              },
              metadata: { ...updatedExpertSpanMetadata, processingStatus: "error-after-fallback" }
            });
            throw fallbackError; // Re-throw the error from the fallback provider
          }
        } else {
          // If we're already using the default provider, just throw the error
          // Original provider error, and it was the default provider (so no fallback was attempted beyond this)
          // Or an error occurred before even trying the first provider (e.g., document processing)
          generation.end({ // Ensure generation is ended if error occurs before/during primary attempt and no fallback
            level: "ERROR",
            statusMessage: providerError instanceof Error ? providerError.message : "Summarization failed (primary attempt)",
            output: { error: "Summarization failed (primary attempt)", message: providerError instanceof Error ? providerError.message : String(providerError) },
            metadata: { ...generationInitialMetadata, finalProvider: requestParams.provider, finalModel: requestParams.model, fallbackSucceeded: false }
          });
          expertSpan.end({
            level: "ERROR",
            statusMessage: "Summarization failed (primary attempt)",
            output: { error: "Summarization failed (primary attempt)", message: providerError instanceof Error ? providerError.message : String(providerError) },
            metadata: { ...updatedExpertSpanMetadata, processingStatus: "error" }
          });
          throw providerError;
        }
      }
    } catch (error) { // Catch errors re-thrown from primary or fallback attempts
      logger.error(`Expert '${this.name}': Overall processing error for summarization`, error instanceof Error ? error : new Error(String(error)));
      // Ensure generation and expertSpan are ended if not already
      let isGenerationEnded = false;
      let isExpertSpanEnded = false;
      // Check if output was set, as endTime is not directly readable from client
      // A more robust way would be to track if .end() was called via a flag if Langfuse client doesn't expose status
      // For now, we assume if we reach here and they weren't ended in a success path, they need to be error-ended.

      try { // Wrap .end() calls in try/catch in case they were already ended (though Langfuse should handle this)
        generation.end({
          level: "ERROR",
          statusMessage: error instanceof Error ? error.message : "Unknown summarization error",
          output: { error: "Summarization failed", message: error instanceof Error ? error.message : String(error) },
          metadata: { ...generationInitialMetadata, processingStatus: "error" }
        });
        isGenerationEnded = true;
      } catch (e) { logger.warn("Attempted to end generation that might have already been ended.", e); }

      try {
         expertSpan.end({
           level: "ERROR",
           statusMessage: error instanceof Error ? error.message : "Overall summarization expert error",
           output: { error: "Overall summarization expert error", message: error instanceof Error ? error.message : String(error) },
           metadata: { ...expertSpanInitialMetadata, processingStatus: "error" }
         });
         isExpertSpanEnded = true;
      } catch (e) { logger.warn("Attempted to end expertSpan that might have already been ended.", e); }
      
      throw error; // Re-throw
    }
  }

  async calculateScores(output: ExpertOutput, langfuseObject: LangfuseSpanClient | LangfuseGenerationClient, trace: LangfuseTraceClient): Promise<void> {
    // In LLMSummarizationExpert, the langfuseObject passed from ChainManager's processWithExpert
    // is the expertSpan. The generation is created inside this expert's process method.
    // We want to score the generation, not the overall expertSpan here.
    // However, the `calculateScores` is called with the `expertSpan`.
    // We need a way to access the `generation` client from within `calculateScores` or pass it.

    // For now, let's assume we want to score the expertSpan based on the final output.
    // If specific generation scores are needed, the design might need adjustment,
    // or scores can be added directly when generation.end() is called.

    if (output.summaryLength && typeof output.summaryLength === 'number') {
      langfuseObject.score({ // This will score the expertSpan
        name: 'summary_length',
        value: output.summaryLength,
        comment: 'Length of the generated summary in characters.'
      });
    }

    if (output.tokenUsage && typeof output.tokenUsage.totalTokens === 'number') {
      langfuseObject.score({ // This will score the expertSpan
        name: 'total_tokens_used',
        value: output.tokenUsage.totalTokens,
        comment: 'Total tokens used by the LLM for summarization.'
      });
    }

    if (output.summary && typeof output.summary === 'string') {
      // Example: Score based on presence of keywords or a simple heuristic
      const concisenessScore = 1 / (output.summary.length || 1); // Simplistic, needs refinement
      langfuseObject.score({
        name: 'conciseness_heuristic',
        value: parseFloat(concisenessScore.toFixed(4)), // Ensure value is a number
        comment: 'Heuristic for summary conciseness (1/length). Higher is better (shorter).'
      });
    }
    
    if (typeof output.fallback === 'boolean' && output.fallback) {
        langfuseObject.score({
            name: 'fallback_used',
            value: 1, // 1 if fallback was used, 0 otherwise (though we'd only call if true)
            comment: `Fallback to ${output.provider} was used. Original provider: ${output.originalProvider}`
        });
    }
  }
}