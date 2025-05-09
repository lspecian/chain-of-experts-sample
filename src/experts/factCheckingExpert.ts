import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext, RetrievalResult } from '../chain/types'; // Assuming source documents might come in RetrievalResult format
import { LLMProvider, LLMCompletionRequest, LLMMessage } from '../llm/types';
import { getLLMProviderFactory } from '../llm/factory';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import { logger } from '../utils/logger';

// Define the expected structure of a source document
type SourceDocument = RetrievalResult['documents'][0];

interface FactCheckingParameters {
  llmProviderName?: string;
  factCheckingModel?: string;
  temperature?: number;
  maxTokensPerClaim?: number;
  claimExtractionPrompt?: string; // Prompt to extract claims from text
  factVerificationPrompt?: string; // Prompt to verify a single claim against sources
}

// Structure for a claim and its verification status
export interface ClaimVerification {
  claim: string;
  isSupported: boolean | 'uncertain';
  supportingEvidence?: string[]; // Snippets from source documents
  contradictoryEvidence?: string[];
  confidence?: number; // Confidence in the verification
  reasoning?: string; // LLM's reasoning
}

export class FactCheckingExpert extends BaseExpert {
  private llmProvider: LLMProvider | undefined;

  constructor(parameters?: ExpertParameters) {
    super('fact-checking', 'verification', parameters);
    const factory = getLLMProviderFactory();
    const providerName = this.parameters.llmProviderName as string || factory.getDefaultProviderName();
    this.llmProvider = factory.getProvider(providerName);

    if (!this.llmProvider) {
      logger.error(`FactCheckingExpert: Could not initialize LLM provider '${providerName}'.`);
    } else {
      logger.info(`FactCheckingExpert: Initialized with LLM provider '${this.llmProvider.getName()}'`);
    }
  }

  protected getDefaultParameters(): ExpertParameters {
    return {
      llmProviderName: getLLMProviderFactory().getDefaultProviderName(),
      factCheckingModel: undefined, // Rely on provider's default
      temperature: 0.2, // Low temperature for factual tasks
      maxTokensPerClaim: 200,
      claimExtractionPrompt: "Extract individual, verifiable factual claims from the following text. Output each claim on a new line. Text: \n{text_to_check}",
      factVerificationPrompt: "Given the following claim and source documents, determine if the claim is supported, contradicted, or if there's not enough information. Provide a brief reasoning and cite specific evidence (snippets) from the documents if possible.\n\nClaim: {claim}\n\nSource Documents:\n{source_documents_formatted}\n\nVerification (supported/contradicted/uncertain) and Reasoning:",
    };
  }

  validateParameters(parameters: ExpertParameters): boolean {
    const params = parameters as FactCheckingParameters;
    if (params.llmProviderName !== undefined && typeof params.llmProviderName !== 'string') return false;
    if (params.factCheckingModel !== undefined && typeof params.factCheckingModel !== 'string') return false;
    if (params.temperature !== undefined && (typeof params.temperature !== 'number' || params.temperature < 0 || params.temperature > 1)) return false;
    if (params.maxTokensPerClaim !== undefined && (typeof params.maxTokensPerClaim !== 'number' || params.maxTokensPerClaim <= 0)) return false;
    if (params.claimExtractionPrompt !== undefined && typeof params.claimExtractionPrompt !== 'string') return false;
    if (params.factVerificationPrompt !== undefined && typeof params.factVerificationPrompt !== 'string') return false;
    return true;
  }

  async process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput> {
    // Expects 'textToCheck' (e.g., a summary) and 'sourceDocuments'
    const textToCheck = input.expertOutput?.summary as string || (input.data as any)?.textToCheck as string;
    let sourceDocuments: SourceDocument[] = [];
    if (input.expertOutput && (input.expertOutput as RetrievalResult).documents) {
      sourceDocuments = (input.expertOutput as RetrievalResult).documents as SourceDocument[];
    } else if (input.data && typeof input.data === 'object' && input.data !== null && Array.isArray((input.data as any).sourceDocuments)) {
      sourceDocuments = (input.data as any).sourceDocuments as SourceDocument[];
    }


    const currentParams = this.getParameters() as FactCheckingParameters;

    if (!textToCheck) {
      return { verifiedClaims: [], error: 'No text provided for fact-checking.' };
    }
    if (!this.llmProvider) {
      return { verifiedClaims: [], error: `LLM provider not initialized for FactCheckingExpert.` };
    }

    const span = trace.span({
      name: `${this.name}-overall-processing`,
      input: { textLength: textToCheck.length, numSources: sourceDocuments.length, params: currentParams },
      metadata: { expertName: this.name, expertType: this.type, appliedParameters: currentParams },
    });

    try {
      logger.info(`Expert '${this.name}': Starting fact-checking for text (length: ${textToCheck.length}) with ${sourceDocuments.length} sources.`);
      const startTime = Date.now();

      // 1. Extract claims (simplified, could be an LLM call itself)
      // For this initial version, we'll assume claims are sentences or manually provided.
      // A more robust implementation would use an LLM call with claimExtractionPrompt.
      // Let's simulate claim extraction for now by splitting sentences.
      const claims = textToCheck.match(/[^.!?]+[.!?]+/g) || [textToCheck]; // Simple sentence split
      
      const verifiedClaims: ClaimVerification[] = [];
      const sourceDocumentsFormatted = sourceDocuments.map((doc, i) => `Doc ${i+1} (ID: ${doc.id}):\n${doc.content}`).join('\n\n---\n\n');

      for (const claim of claims) {
        if (claim.trim().length === 0) continue;

        const verificationGen = trace.generation({
            name: `${this.name}-claim-verification`,
            input: { claim, sourceDocumentsFormatted },
            model: currentParams.factCheckingModel || this.llmProvider.getDefaultModel(),
            modelParameters: {
              temperature: currentParams.temperature ?? this.getDefaultParameters().temperature,
              max_tokens: currentParams.maxTokensPerClaim ?? this.getDefaultParameters().maxTokensPerClaim
            },
            metadata: { claim }
        });

        const prompt = currentParams.factVerificationPrompt!
            .replace('{claim}', claim)
            .replace('{source_documents_formatted}', sourceDocumentsFormatted.substring(0, 3500)); // Truncate sources to fit context

        const messages: LLMMessage[] = [{ role: 'user', content: prompt }];
        const request: LLMCompletionRequest = {
          messages,
          model: currentParams.factCheckingModel,
          temperature: currentParams.temperature,
          maxTokens: currentParams.maxTokensPerClaim,
        };

        const llmResponse = await this.llmProvider.createCompletion(request);
        const verificationText = llmResponse.content.trim();
        
        // Basic parsing of LLM response (needs to be more robust)
        let isSupported: ClaimVerification['isSupported'] = 'uncertain';
        if (verificationText.toLowerCase().includes('supported')) isSupported = true;
        else if (verificationText.toLowerCase().includes('contradicted')) isSupported = false;

        verifiedClaims.push({
          claim,
          isSupported,
          reasoning: verificationText, // Full LLM response as reasoning for now
          // TODO: Extract evidence snippets and confidence
        });
        
        verificationGen.end({ output: { verificationText, isSupported }, usage: llmResponse.usage });
      }

      const processingTime = Date.now() - startTime;
      logger.info(`Expert '${this.name}': Fact-checking completed in ${processingTime}ms. Verified ${verifiedClaims.length} claims.`);

      const output: ExpertOutput = {
        verifiedClaims,
        metrics: {
          processingTimeMs: processingTime,
          numClaimsChecked: verifiedClaims.length,
          numSourcesProvided: sourceDocuments.length,
        }
      };
      span.end({ output });
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during fact-checking';
      logger.error(`Expert '${this.name}': Error during processing.`, error instanceof Error ? error : new Error(String(error)));
      span.end({ level: "ERROR", statusMessage: errorMessage, output: { error: errorMessage } });
      return { verifiedClaims: [], error: errorMessage };
    }
  }

  async calculateScores(output: ExpertOutput, langfuseObject: LangfuseSpanClient | LangfuseGenerationClient, trace: LangfuseTraceClient): Promise<void> {
    if (output.verifiedClaims && Array.isArray(output.verifiedClaims)) {
      const claims = output.verifiedClaims as ClaimVerification[];
      const supportedCount = claims.filter(c => c.isSupported === true).length;
      const contradictedCount = claims.filter(c => c.isSupported === false).length;
      const uncertainCount = claims.filter(c => c.isSupported === 'uncertain').length;

      if (claims.length > 0) {
        langfuseObject.score({ name: 'fact_check_supported_ratio', value: supportedCount / claims.length, comment: `${supportedCount}/${claims.length} claims supported.` });
        langfuseObject.score({ name: 'fact_check_contradicted_ratio', value: contradictedCount / claims.length, comment: `${contradictedCount}/${claims.length} claims contradicted.` });
      }
      langfuseObject.score({ name: 'fact_check_total_claims', value: claims.length });
      langfuseObject.score({ name: 'fact_check_uncertain_claims', value: uncertainCount });
    }
    if (output.metrics && typeof output.metrics.processingTimeMs === 'number') {
      langfuseObject.score({ name: 'fact_checking_processing_time_ms', value: output.metrics.processingTimeMs });
    }
  }
}