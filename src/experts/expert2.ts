import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse'; // Added imports
import { getLLMProviderFactory, selectProvider, ProviderSelectionContext } from '../llm';
import { logger } from '../utils/logger';
import { LLMMessage, LLMProvider } from '../llm/types';
import { getConfig } from '../config';

interface LLMSummarizationParameters {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  selectionStrategy?: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  priority?: 'speed' | 'quality' | 'cost' | 'balanced';
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
    // Try to get expert-specific config from global config
    try {
      const config = getConfig();
      const expertConfig = config.llm.expertConfigs?.find(ec => ec.expertName === 'llm-summarization');
      
      if (expertConfig) {
        return {
          provider: expertConfig.provider || 'openai',
          model: expertConfig.model || 'gpt-4o',
          temperature: 0.7,
          maxTokens: 500,
          systemPrompt: 'You are a helpful assistant that summarizes documents clearly and concisely.',
          selectionStrategy: expertConfig.selectionStrategy || config.llm.defaultSelectionStrategy || 'fallback-default',
          fallbackProvider: expertConfig.fallbackProvider || 'gemini',
          fallbackModel: expertConfig.fallbackModel || 'gemini-1.5-pro',
          priority: expertConfig.priority || 'quality'
        };
      }
    } catch (error) {
      logger.warn('Failed to get expert-specific config, using defaults', error instanceof Error ? error : undefined);
    }
    
    // Default values if config is not available
    return {
      provider: 'openai',
      model: 'gpt-4o',
      temperature: 0.7,
      maxTokens: 500,
      systemPrompt: 'You are a helpful assistant that summarizes documents clearly and concisely.',
      selectionStrategy: 'fallback-default',
      fallbackProvider: 'gemini',
      fallbackModel: 'gemini-1.5-pro',
      priority: 'quality'
    };
  }
  
  // Override to validate parameters specific to this expert
  validateParameters(parameters: ExpertParameters): boolean {
    // Validate temperature is between 0 and 1
    if (parameters.temperature !== undefined &&
        (typeof parameters.temperature !== 'number' ||
         parameters.temperature < 0 ||
         parameters.temperature > 1)) {
      logger.warn(`Invalid temperature parameter: ${parameters.temperature}`);
      return false;
    }
    
    // Validate maxTokens is a positive number
    if (parameters.maxTokens !== undefined &&
        (typeof parameters.maxTokens !== 'number' ||
         parameters.maxTokens <= 0)) {
      logger.warn(`Invalid maxTokens parameter: ${parameters.maxTokens}`);
      return false;
    }
    
    // Validate provider and model are non-empty strings if provided
    if (parameters.provider !== undefined &&
        (typeof parameters.provider !== 'string' ||
         parameters.provider.trim() === '')) {
      logger.warn(`Invalid provider parameter: ${parameters.provider}`);
      return false;
    }
    
    if (parameters.model !== undefined &&
        (typeof parameters.model !== 'string' ||
         parameters.model.trim() === '')) {
      logger.warn(`Invalid model parameter: ${parameters.model}`);
      return false;
    }
    
    // Validate selectionStrategy is a non-empty string if provided
    if (parameters.selectionStrategy !== undefined &&
        (typeof parameters.selectionStrategy !== 'string' ||
         parameters.selectionStrategy.trim() === '')) {
      logger.warn(`Invalid selectionStrategy parameter: ${parameters.selectionStrategy}`);
      return false;
    }
    
    // Validate fallbackProvider and fallbackModel are non-empty strings if provided
    if (parameters.fallbackProvider !== undefined &&
        (typeof parameters.fallbackProvider !== 'string' ||
         parameters.fallbackProvider.trim() === '')) {
      logger.warn(`Invalid fallbackProvider parameter: ${parameters.fallbackProvider}`);
      return false;
    }
    
    if (parameters.fallbackModel !== undefined &&
        (typeof parameters.fallbackModel !== 'string' ||
         parameters.fallbackModel.trim() === '')) {
      logger.warn(`Invalid fallbackModel parameter: ${parameters.fallbackModel}`);
      return false;
    }
    
    // Validate priority is one of the allowed values if provided
    if (parameters.priority !== undefined &&
        (typeof parameters.priority !== 'string' ||
         !['speed', 'quality', 'cost', 'balanced'].includes(parameters.priority))) {
      logger.warn(`Invalid priority parameter: ${parameters.priority}`);
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
      
      // Create a provider selection context
      const selectionContext: ProviderSelectionContext = {
        expertName: this.name,
        taskType: 'summarization',
        priority: requestParams.priority as any,
        preferredProvider: requestParams.provider,
        preferredModel: requestParams.model
      };
      
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
      generation.update({
        input: completionRequest.messages,
        metadata: {
          ...generationInitialMetadata,
          selectionStrategy: requestParams.selectionStrategy,
          selectionContext
        }
      });
      
      try {
        // Select provider using the specified strategy
        logger.info(`Expert '${this.name}': Selecting provider using strategy: ${requestParams.selectionStrategy || 'default'}`);
        const llmProvider = await selectProvider(requestParams.selectionStrategy, selectionContext);
        
        // Call LLM provider
        logger.info(`Expert '${this.name}': Calling LLM API with selected provider: ${llmProvider.getName()}`);
        const completionResponse = await llmProvider.createCompletion(completionRequest);
        
        const summary = completionResponse.content;
        const usage = completionResponse.usage;
        const usedModel = completionResponse.model || requestParams.model || llmProvider.getDefaultModel();
        const usedProvider = llmProvider.getName();

        if (!summary) {
          throw new Error("LLM failed to generate a summary.");
        }

        logger.info(`Expert '${this.name}': LLM call successful with provider: ${usedProvider}, model: ${usedModel}`);
        
        // Determine if fallback was used (provider name might include 'fallback')
        const fallbackUsed = usedProvider.includes('fallback') ||
                            (requestParams.provider && usedProvider !== requestParams.provider);
        
        // End generation with successful output
        generation.end({
          output: summary,
          usage: usage ? {
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens
          } : undefined,
          metadata: {
            ...generationInitialMetadata,
            finalProvider: usedProvider,
            finalModel: usedModel,
            fallbackUsed,
            selectionStrategy: requestParams.selectionStrategy
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
          provider: usedProvider,
          model: usedModel,
          fallback: fallbackUsed,
          originalProvider: requestParams.provider,
          originalModel: requestParams.model,
          selectionStrategy: requestParams.selectionStrategy
        };
        
        const processingStatus = fallbackUsed ? "success-with-fallback" : "success";
        expertSpan.end({
          output: expertOutput,
          metadata: {
            ...updatedExpertSpanMetadata,
            processingStatus,
            finalProvider: usedProvider,
            finalModel: usedModel
          }
        });
        
        return expertOutput;
      } catch (error) {
        logger.error(`Expert '${this.name}': Error with LLM provider selection/call`,
          error instanceof Error ? error : undefined);
        
        // End generation with error
        generation.end({
          level: "ERROR",
          statusMessage: error instanceof Error ? error.message : "Summarization failed",
          output: { error: "Summarization failed", message: error instanceof Error ? error.message : String(error) },
          metadata: {
            ...generationInitialMetadata,
            selectionStrategy: requestParams.selectionStrategy,
            fallbackSucceeded: false
          }
        });
        
        expertSpan.end({
          level: "ERROR",
          statusMessage: "Summarization failed",
          output: { error: "Summarization failed", message: error instanceof Error ? error.message : String(error) },
          metadata: { ...updatedExpertSpanMetadata, processingStatus: "error" }
        });
        
        throw error;
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
    
    // Add score for the selection strategy used
    if (output.selectionStrategy && typeof output.selectionStrategy === 'string') {
        langfuseObject.score({
            name: 'selection_strategy',
            value: 1, // Just recording that a strategy was used
            comment: `Provider selection strategy used: ${output.selectionStrategy}`
        });
    }
    
    // Add score for provider cost efficiency (if we have token usage)
    if (output.provider && output.tokenUsage?.totalTokens) {
        // Estimate cost based on provider and model
        let estimatedCostPer1KTokens = 0.01; // Default cost estimate
        
        // Adjust based on provider and model
        if (output.provider === 'openai') {
            if (output.model?.includes('gpt-4')) {
                estimatedCostPer1KTokens = 0.03; // GPT-4 models
            } else if (output.model?.includes('gpt-3.5')) {
                estimatedCostPer1KTokens = 0.01; // GPT-3.5 models
            }
        } else if (output.provider === 'gemini') {
            estimatedCostPer1KTokens = 0.0035; // Gemini models
        }
        
        // Calculate estimated cost
        const estimatedCost = (output.tokenUsage.totalTokens / 1000) * estimatedCostPer1KTokens;
        
        langfuseObject.score({
            name: 'estimated_cost',
            value: parseFloat(estimatedCost.toFixed(6)),
            comment: `Estimated cost for ${output.provider}/${output.model}: $${estimatedCost.toFixed(6)}`
        });
    }
  }
}