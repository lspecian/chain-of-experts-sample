import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LLMProvider, LLMCompletionRequest, LLMMessage } from '../llm/types';
import { getLLMProviderFactory } from '../llm/factory';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import { logger } from '../utils/logger';

interface ResponseFormattingParameters {
  llmProviderName?: string;
  formattingModel?: string;
  temperature?: number;
  maxTokens?: number;
  targetFormat?: 'bullet_points' | 'paragraph' | 'summary_table' | 'json_object' | 'custom_prompt'; // Example formats
  customPrompt?: string; // Used if targetFormat is 'custom_prompt'
  style?: 'concise' | 'detailed' | 'professional' | 'casual'; // Example styles
}

export class ResponseFormattingExpert extends BaseExpert {
  private llmProvider: LLMProvider | undefined;

  constructor(parameters?: ExpertParameters) {
    super('response-formatting', 'formatting', parameters);
    const factory = getLLMProviderFactory();
    const providerName = this.parameters.llmProviderName as string || factory.getDefaultProviderName();
    this.llmProvider = factory.getProvider(providerName);

    if (!this.llmProvider) {
      logger.error(`ResponseFormattingExpert: Could not initialize LLM provider '${providerName}'.`);
    } else {
      logger.info(`ResponseFormattingExpert: Initialized with LLM provider '${this.llmProvider.getName()}'`);
    }
  }

  protected getDefaultParameters(): ExpertParameters {
    return {
      llmProviderName: getLLMProviderFactory().getDefaultProviderName(),
      formattingModel: undefined, // Rely on provider's default
      temperature: 0.5, 
      maxTokens: 500, // Allow for potentially longer formatted outputs
      targetFormat: 'paragraph',
      style: 'concise',
      customPrompt: "Reformat the following text into {target_format} with a {style} style. Text:\n{text_to_format}",
    };
  }

  validateParameters(parameters: ExpertParameters): boolean {
    const params = parameters as ResponseFormattingParameters;
    if (params.llmProviderName !== undefined && typeof params.llmProviderName !== 'string') return false;
    if (params.formattingModel !== undefined && typeof params.formattingModel !== 'string') return false;
    if (params.temperature !== undefined && (typeof params.temperature !== 'number' || params.temperature < 0 || params.temperature > 1)) return false;
    if (params.maxTokens !== undefined && (typeof params.maxTokens !== 'number' || params.maxTokens <= 0)) return false;
    if (params.targetFormat !== undefined && !['bullet_points', 'paragraph', 'summary_table', 'json_object', 'custom_prompt'].includes(params.targetFormat)) return false;
    if (params.customPrompt !== undefined && typeof params.customPrompt !== 'string') return false;
    if (params.style !== undefined && !['concise', 'detailed', 'professional', 'casual'].includes(params.style)) return false;
    return true;
  }

  async process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput> {
    // Expects 'textToFormat' from previous expert or input.data
    const textToFormat = input.expertOutput?.formattedText as string // if a previous formatter ran
                        || input.expertOutput?.summary as string       // from a summarizer
                        || input.expertOutput?.content as string       // generic content
                        || (input.data as any)?.textToFormat as string;

    const currentParams = this.getParameters() as ResponseFormattingParameters;

    if (!textToFormat) {
      return { formattedText: '', error: 'No text provided for formatting.' };
    }
    if (!this.llmProvider) {
      return { formattedText: textToFormat, error: `LLM provider not initialized for ResponseFormattingExpert.` };
    }

    const span = trace.span({
      name: `${this.name}-overall-processing`,
      input: { textLength: textToFormat.length, params: currentParams },
      metadata: { expertName: this.name, expertType: this.type, appliedParameters: currentParams },
    });

    try {
      logger.info(`Expert '${this.name}': Starting formatting for text (length: ${textToFormat.length}). Target: ${currentParams.targetFormat}, Style: ${currentParams.style}`);
      const startTime = Date.now();

      let prompt = currentParams.customPrompt!
        .replace('{target_format}', currentParams.targetFormat!)
        .replace('{style}', currentParams.style!)
        .replace('{text_to_format}', textToFormat);
      
      // More specific prompts based on targetFormat if not 'custom_prompt'
      if (currentParams.targetFormat !== 'custom_prompt') {
        switch (currentParams.targetFormat) {
          case 'bullet_points':
            prompt = `Reformat the following text into clear, ${currentParams.style} bullet points:\n\n${textToFormat}`;
            break;
          case 'paragraph':
            prompt = `Rewrite the following text as a well-structured, ${currentParams.style} paragraph:\n\n${textToFormat}`;
            break;
          case 'summary_table':
            prompt = `Summarize the key information from the following text into a ${currentParams.style} table format:\n\n${textToFormat}`;
            break;
          case 'json_object':
            prompt = `Convert the following text into a structured JSON object. Ensure the JSON is valid. The style should be ${currentParams.style} (e.g. concise field names or detailed descriptions within values):\n\n${textToFormat}`;
            break;
        }
      }
      
      const generation = trace.generation({
          name: `${this.name}-llm-formatting`,
          input: { prompt_used: prompt, original_text_length: textToFormat.length },
          model: currentParams.formattingModel || this.llmProvider.getDefaultModel(),
          modelParameters: { 
            temperature: currentParams.temperature ?? this.getDefaultParameters().temperature,
            max_tokens: currentParams.maxTokens ?? this.getDefaultParameters().maxTokens
          },
          metadata: { targetFormat: currentParams.targetFormat, style: currentParams.style }
      });

      const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
      const request: LLMCompletionRequest = {
        messages,
        model: currentParams.formattingModel,
        temperature: currentParams.temperature,
        maxTokens: currentParams.maxTokens,
      };

      const llmResponse = await this.llmProvider.createCompletion(request);
      let formattedText = llmResponse.content.trim();

      // For JSON, attempt to parse and re-stringify to ensure validity and clean formatting
      if (currentParams.targetFormat === 'json_object') {
        try {
          const jsonObj = JSON.parse(formattedText);
          formattedText = JSON.stringify(jsonObj, null, 2); // Pretty print
        } catch (jsonError) {
          logger.warn(`ResponseFormattingExpert: LLM output for JSON was not valid JSON. Returning raw output. Error: ${jsonError}`);
          // Optionally, could try to ask LLM to fix it, or return an error in output
        }
      }
      
      generation.end({ output: { formattedTextLength: formattedText.length }, usage: llmResponse.usage });

      const processingTime = Date.now() - startTime;
      logger.info(`Expert '${this.name}': Formatting completed in ${processingTime}ms.`);

      const output: ExpertOutput = {
        formattedText,
        originalText: textToFormat, // Include original for comparison if needed
        metrics: {
          processingTimeMs: processingTime,
          targetFormat: currentParams.targetFormat,
          style: currentParams.style,
          outputLength: formattedText.length,
        }
      };
      span.end({ output });
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during response formatting';
      logger.error(`Expert '${this.name}': Error during processing.`, error instanceof Error ? error : new Error(String(error)));
      span.end({ level: "ERROR", statusMessage: errorMessage, output: { error: errorMessage } });
      return { formattedText: textToFormat, error: errorMessage }; // Return original text on error
    }
  }

  async calculateScores(output: ExpertOutput, langfuseObject: LangfuseSpanClient | LangfuseGenerationClient, trace: LangfuseTraceClient): Promise<void> {
    if (output.metrics && typeof output.metrics.processingTimeMs === 'number') {
      langfuseObject.score({ name: 'formatting_processing_time_ms', value: output.metrics.processingTimeMs });
    }
    if (output.formattedText && output.originalText) {
        const lengthChange = (output.formattedText as string).length - (output.originalText as string).length;
        langfuseObject.score({ name: 'formatting_length_change_chars', value: lengthChange });
    }
    // Could add scores for adherence to format if a validator is available (e.g. JSON schema validation)
    return Promise.resolve();
  }
}