import { ExpertOutput, ExpertParameters } from '../experts/baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';

/**
 * Input for an evaluator.
 */
export interface EvaluationInput {
  expertName: string;
  expertType: string;
  expertParameters: ExpertParameters;
  chainInput: ChainInput; // Original input to the expert
  expertOutput: ExpertOutput; // Output from the expert
  chainContext: ChainContext; // Context of the chain execution
}

/**
 * Output from an evaluator, typically one or more scores.
 */
export interface EvaluationScore {
  name: string; // Name of the score (e.g., "relevance", "coherence")
  value: number; // Numerical value of the score
  comment?: string; // Optional comment from the evaluator
  evaluatorName?: string; // Name of the evaluator that produced this score
}

export interface EvaluationOutput {
  scores: EvaluationScore[];
  // Potentially other evaluation artifacts
}

/**
 * Interface for an evaluator.
 */
export interface IEvaluator {
  getName(): string;
  evaluate(
    evaluationInput: EvaluationInput,
    langfuseObjectToScore: LangfuseSpanClient | LangfuseGenerationClient
  ): Promise<EvaluationOutput>;
}