import { LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import { EvaluationInput, EvaluationOutput, IEvaluator } from './types';
import { logger } from '../utils/logger';

export abstract class BaseEvaluator implements IEvaluator {
  protected name: string;

  constructor(name: string) {
    this.name = name;
    logger.info(`Initialized evaluator: ${this.name}`);
  }

  getName(): string {
    return this.name;
  }

  abstract evaluate(
    evaluationInput: EvaluationInput,
    langfuseObjectToScore: LangfuseSpanClient | LangfuseGenerationClient
  ): Promise<EvaluationOutput>;

  /**
   * Helper method to record scores on the Langfuse object.
   */
  protected async recordScores(
    langfuseObject: LangfuseSpanClient | LangfuseGenerationClient,
    evaluationOutput: EvaluationOutput
  ): Promise<void> {
    if (evaluationOutput.scores && evaluationOutput.scores.length > 0) {
      for (const score of evaluationOutput.scores) {
        try {
          await langfuseObject.score({
            name: score.name,
            value: score.value,
            comment: score.comment,
            // Potentially add evaluatorName to the score object itself if needed
          });
          logger.debug(`Recorded score '${score.name}' (${score.value}) for ${this.name} on Langfuse object ${langfuseObject.id}`);
        } catch (error) {
          // Pass the error object directly as the second argument if it's an Error instance
          const errorContext = {
            scoreDetails: score,
            langfuseObjectId: langfuseObject.id,
            evaluatorName: this.name
          };
          if (error instanceof Error) {
            logger.error(`Failed to record score '${score.name}' for ${this.name}`, error, errorContext);
          } else {
            logger.error(`Failed to record score '${score.name}' for ${this.name}. Error: ${String(error)}`, undefined, errorContext);
          }
        }
      }
    }
  }
}