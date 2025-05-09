import { BaseEvaluator } from './baseEvaluator';
import { EvaluationInput, EvaluationOutput, EvaluationScore } from './types';
import { getLLMProviderFactory } from '../llm';
import { LLMProvider, LLMMessage } from '../llm/types';
import { logger } from '../utils/logger';
import { LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';

interface RelevanceEvaluatorParams {
  evaluatorProvider?: string;
  evaluatorModel?: string;
  evaluatorTemperature?: number;
  relevancePromptTemplate?: string;
}

export class RelevanceEvaluator extends BaseEvaluator {
  private params: RelevanceEvaluatorParams;

  constructor(params: RelevanceEvaluatorParams = {}) {
    super('relevance-llm-evaluator');
    this.params = {
      evaluatorProvider: params.evaluatorProvider || 'openai',
      evaluatorModel: params.evaluatorModel || 'gpt-3.5-turbo', // Use a cost-effective model for evaluation
      evaluatorTemperature: params.evaluatorTemperature || 0.2,
      relevancePromptTemplate: params.relevancePromptTemplate || 
        `Given the following user query and the expert's output, please rate the relevance of the output to the query on a scale of 0 to 1, where 1 is perfectly relevant and 0 is not relevant at all. Provide only the numeric score.
        User Query: {query}
        Expert Output: {expertOutput}
        Relevance Score (0-1):`
    };
    logger.info(`Initialized ${this.name} with provider: ${this.params.evaluatorProvider}, model: ${this.params.evaluatorModel}`);
  }

  async evaluate(
    evaluationInput: EvaluationInput,
    langfuseObjectToScore: LangfuseSpanClient | LangfuseGenerationClient
  ): Promise<EvaluationOutput> {
    const { expertName, expertType, chainInput, expertOutput } = evaluationInput;
    const query = chainInput.query || (typeof chainInput.data === 'string' ? chainInput.data : JSON.stringify(chainInput.data));
    const outputText = typeof expertOutput.summary === 'string' ? expertOutput.summary : 
                       (expertOutput.documents && Array.isArray(expertOutput.documents) && expertOutput.documents.length > 0 ? 
                         expertOutput.documents.map((doc: any) => doc.content || JSON.stringify(doc)).join('\\n') : 
                         JSON.stringify(expertOutput));

    if (!query || !outputText) {
      logger.warn(`${this.name}: Insufficient data for relevance evaluation. Query: ${query}, Output: ${outputText}`);
      return { scores: [] };
    }

    const promptTemplate = this.params.relevancePromptTemplate ||
      `Given the following user query and the expert's output, please rate the relevance of the output to the query on a scale of 0 to 1, where 1 is perfectly relevant and 0 is not relevant at all. Provide only the numeric score.
      User Query: {query}
      Expert Output: {expertOutput}
      Relevance Score (0-1):`; // Ensure a default template

    const prompt = promptTemplate
      .replace('{query}', query)
      .replace('{expertOutput}', outputText.substring(0, 3000)); // Truncate output

    const llmFactory = getLLMProviderFactory();
    const providerName = this.params.evaluatorProvider || 'openai'; // Default provider
    let llmProvider: LLMProvider;
    try {
      const provider = llmFactory.getProvider(providerName);
      if (!provider) {
        throw new Error(`LLM provider '${providerName}' not found or not registered.`);
      }
      llmProvider = provider;
    } catch (error) {
      logger.error(`${this.name}: Failed to get LLM provider ${providerName}`, error instanceof Error ? error : undefined);
      return { scores: [] };
    }
    
    const messages: LLMMessage[] = [{ role: 'user', content: prompt }];

    // Create a Langfuse generation for the evaluation LLM call
    const initialEvalGenerationMetadata = {
        evaluatorName: this.name,
        evaluatedExpert: expertName,
        evaluatedExpertType: expertType,
        promptTemplate: this.params.relevancePromptTemplate, // Log the template used
        targetProvider: providerName,
        targetModel: this.params.evaluatorModel,
    };
    // This generation will be a child of the span/generation being scored (langfuseObjectToScore)
    const evaluationGeneration = langfuseObjectToScore.generation({
        name: `${this.name}-generation`,
        input: messages,
        model: this.params.evaluatorModel,
        modelParameters: {
            temperature: this.params.evaluatorTemperature || 0.2, // Provide default
        },
        metadata: initialEvalGenerationMetadata
    });

    try {
      const completion = await llmProvider.createCompletion({
        messages,
        model: this.params.evaluatorModel,
        temperature: this.params.evaluatorTemperature,
        maxTokens: 10, // Expecting just a score
      });

      const scoreText = completion.content?.trim();
      const relevanceScoreValue = parseFloat(scoreText || '');

      if (isNaN(relevanceScoreValue) || relevanceScoreValue < 0 || relevanceScoreValue > 1) {
        logger.warn(`${this.name}: LLM returned an invalid relevance score: '${scoreText}'`);
        evaluationGeneration.end({ output: { rawScoreText: scoreText, error: "Invalid score format" }, level: "WARNING" });
        return { scores: [] };
      }

      const score: EvaluationScore = {
        name: 'llm_relevance_score',
        value: relevanceScoreValue,
        comment: `Evaluated by ${this.name} using ${this.params.evaluatorModel}. Raw: ${scoreText}`,
        evaluatorName: this.name,
      };
      
      evaluationGeneration.end({ 
        output: { rawScoreText: scoreText, parsedScore: relevanceScoreValue },
        usage: completion.usage ? {
            promptTokens: completion.usage.promptTokens,
            completionTokens: completion.usage.completionTokens,
            totalTokens: completion.usage.totalTokens,
        } : undefined,
        metadata: { ...initialEvalGenerationMetadata, finalScore: relevanceScoreValue }
      });
      
      // Record the score using the base class helper (optional, as generation.score can also be used)
      // await this.recordScores(langfuseObjectToScore, { scores: [score] }); 
      // Or directly score the generation if that's more appropriate
      evaluationGeneration.score({ // Score the generation itself
          name: 'parsed_relevance_score',
          value: relevanceScoreValue,
          comment: `Parsed from LLM output: ${scoreText}`
      });


      return { scores: [score] };

    } catch (error) {
      logger.error(`${this.name}: Error during LLM call for relevance evaluation`, error instanceof Error ? error : undefined);
      evaluationGeneration.end({ 
        output: { error: "LLM call failed during evaluation" }, 
        level: "ERROR",
        statusMessage: error instanceof Error ? error.message : String(error),
      });
      return { scores: [] };
    }
  }
}