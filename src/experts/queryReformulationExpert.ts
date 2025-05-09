import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import { logger } from '../utils/logger';
import { LLMProvider, LLMCompletionRequest, LLMMessage } from '../llm/types';
import { getLLMProviderFactory } from '../llm/factory';

interface QueryReformulationParameters {
  llmProviderName?: string; // e.g., 'openai', 'gemini'
  reformulationModel?: string; // Specific model ID for the chosen provider
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string; // Allow customizing the system prompt
}

export class QueryReformulationExpert extends BaseExpert {
  private llmProvider: LLMProvider | undefined;

  constructor(parameters?: ExpertParameters) {
    super('query-reformulation', 'reformulation', parameters);
    const factory = getLLMProviderFactory();
    // Use the llmProviderName from parameters, or the factory's default
    const providerName = this.parameters.llmProviderName as string || factory.getDefaultProviderName();
    this.llmProvider = factory.getProvider(providerName);

    if (!this.llmProvider) {
      logger.error(`QueryReformulationExpert: Could not initialize LLM provider '${providerName}'. Ensure it's registered and configured.`);
      // Depending on desired behavior, could throw or operate in a degraded mode.
      // For now, it will proceed, and 'process' will handle the undefined llmProvider.
    } else {
      logger.info(`QueryReformulationExpert: Initialized with LLM provider '${this.llmProvider.getName()}'`);
    }
  }

  protected getDefaultParameters(): ExpertParameters {
    return {
      llmProviderName: getLLMProviderFactory().getDefaultProviderName(), // Default to factory's default
      reformulationModel: undefined, // Rely on provider's default model if not set
      temperature: 0.3, // Slightly lower temp for more focused reformulation
      maxTokens: 100,   // Reformulated queries are usually short
      systemPrompt: 'You are an expert query reformulator. Your task is to rewrite the given user query to be more effective for information retrieval. Focus on clarity, specificity, and keyword optimization. Return only the reformulated query, nothing else.'
    };
  }

  validateParameters(parameters: ExpertParameters): boolean {
    const currentParams = parameters as QueryReformulationParameters;
    if (currentParams.llmProviderName !== undefined && typeof currentParams.llmProviderName !== 'string') {
      logger.warn('QueryReformulationExpert: llmProviderName must be a string.');
      return false;
    }
    if (currentParams.reformulationModel !== undefined && typeof currentParams.reformulationModel !== 'string') {
      logger.warn('QueryReformulationExpert: reformulationModel must be a string.');
      return false;
    }
    if (currentParams.temperature !== undefined && (typeof currentParams.temperature !== 'number' || currentParams.temperature < 0 || currentParams.temperature > 1)) {
      logger.warn('QueryReformulationExpert: temperature must be a number between 0 and 1.');
      return false;
    }
    if (currentParams.maxTokens !== undefined && (typeof currentParams.maxTokens !== 'number' || currentParams.maxTokens <= 0)) {
      logger.warn('QueryReformulationExpert: maxTokens must be a positive number.');
      return false;
    }
    if (currentParams.systemPrompt !== undefined && typeof currentParams.systemPrompt !== 'string') {
      logger.warn('QueryReformulationExpert: systemPrompt must be a string.');
      return false;
    }
    return true;
  }

  async process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput> {
    const { query } = input;
    const currentParams = this.getParameters() as QueryReformulationParameters;

    if (!query) {
      logger.warn(`Expert '${this.name}': No query provided in input.`);
      return { reformulatedQuery: '', originalQuery: query, error: 'No query provided' };
    }
    
    if (!this.llmProvider) {
      const errorMsg = `Expert '${this.name}': LLM provider not initialized. Cannot reformulate query.`;
      logger.error(errorMsg);
      // No span created yet, so just return error
      return { originalQuery: query, reformulatedQuery: query, error: errorMsg };
    }

    const span = trace.span({
      name: `${this.name}-overall-processing`,
      input: { query, params: currentParams },
      metadata: {
        expertName: this.name,
        expertType: this.type,
        appliedParameters: currentParams,
        llmProvider: this.llmProvider.getName(),
        llmModelUsed: currentParams.reformulationModel || this.llmProvider.getDefaultModel(),
      },
    });

    try {
      logger.info(`Expert '${this.name}': Reformulating query: "${query}" using ${this.llmProvider.getName()}`);
      const startTime = Date.now();

      const messages: LLMMessage[] = [
        { role: 'system', content: currentParams.systemPrompt! },
        { role: 'user', content: query }
      ];

      const request: LLMCompletionRequest = {
        messages,
        model: currentParams.reformulationModel, // Provider will use its default if this is undefined
        temperature: currentParams.temperature,
        maxTokens: currentParams.maxTokens,
      };
      
      const generation = trace.generation({
        name: `${this.name}-llm-reformulation`,
        input: messages, // Log the full messages array
        model: currentParams.reformulationModel || this.llmProvider.getDefaultModel(),
        modelParameters: {
          temperature: currentParams.temperature ?? this.getDefaultParameters().temperature,
          max_tokens: currentParams.maxTokens ?? this.getDefaultParameters().maxTokens
        },
        metadata: { expertName: this.name, provider: this.llmProvider.getName() }
      });

      const llmResponse = await this.llmProvider.createCompletion(request);
      const reformulatedQuery = llmResponse.content.trim();
      
      generation.end({
        output: { reformulatedQuery, finishReason: llmResponse.finishReason },
        usage: llmResponse.usage ? {
            input: llmResponse.usage.promptTokens,
            output: llmResponse.usage.completionTokens,
            total: llmResponse.usage.totalTokens,
            unit: "TOKENS", // Explicitly set unit
            // Placeholder for costs, actual calculation is complex and provider-specific
            // inputCost: 0,
            // outputCost: 0,
            // totalCost: 0,
        } : undefined,
      });

      const processingTime = Date.now() - startTime;
      logger.info(`Expert '${this.name}': Query reformulated to: "${reformulatedQuery}" in ${processingTime}ms`);

      const output: ExpertOutput = {
        originalQuery: query,
        reformulatedQuery: reformulatedQuery,
        metrics: {
          processingTimeMs: processingTime,
          llmProvider: this.llmProvider.getName(),
          llmModel: llmResponse.model || currentParams.reformulationModel || this.llmProvider.getDefaultModel(),
          ...(llmResponse.usage && { llmUsage: llmResponse.usage }),
        }
      };

      span.end({ output });
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during query reformulation';
      logger.error(`Expert '${this.name}': Error during processing. Query: "${query}"`, error instanceof Error ? error : new Error(String(error)));
      span.end({ // Ensure span is ended on error
        level: "ERROR",
        statusMessage: errorMessage,
        output: { error: errorMessage, originalQuery: query },
      });
      return { originalQuery: query, reformulatedQuery: query, error: errorMessage };
    }
  }

  async calculateScores(output: ExpertOutput, langfuseObject: LangfuseSpanClient | LangfuseGenerationClient, trace: LangfuseTraceClient): Promise<void> {
    // Example: Score based on whether reformulation happened
    if (output.reformulatedQuery && output.originalQuery !== output.reformulatedQuery) {
      langfuseObject.score({
        name: 'query_changed_by_reformulation',
        value: 1,
        comment: 'Query was successfully reformulated.'
      });
    } else if (output.originalQuery === output.reformulatedQuery && !output.error) {
       langfuseObject.score({
        name: 'query_unchanged_by_reformulation',
        value: 1,
        comment: 'Query was not changed by reformulation (might be optimal or simple prefix used).'
      });
    }

    if (output.metrics && typeof output.metrics.processingTimeMs === 'number') {
      langfuseObject.score({
        name: 'reformulation_processing_time_ms',
        value: output.metrics.processingTimeMs,
        comment: 'Time taken for query reformulation in milliseconds.'
      });
    }
    
    // Add more sophisticated scoring later, e.g., semantic similarity between original and reformulated query
    // or a score from an LLM evaluating the reformulation quality.
    return Promise.resolve();
  }
}