import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext, RetrievalResult } from '../chain/types'; // Import RetrievalResult
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import { logger } from '../utils/logger';

// Define the expected structure of a document that this expert might receive
// This aligns with the document structure in RetrievalResult
type InputDocument = RetrievalResult['documents'][0] & {
  // Add any other potential metadata fields if necessary, e.g., from input.data
  [key: string]: any;
};


interface DocumentFilteringParameters {
  minRelevanceScore?: number; // Minimum relevance score to keep a document
  maxOutputDocuments?: number; // Maximum number of documents to output
  sortBy?: 'relevance' | 'recency' | 'custom'; // Example sorting options
  // Add other potential parameters like dateCutoff, requiredKeywords, etc.
}

export class DocumentFilteringExpert extends BaseExpert {
  constructor(parameters?: ExpertParameters) {
    super('document-filtering', 'filtering', parameters);
  }

  protected getDefaultParameters(): ExpertParameters {
    return {
      minRelevanceScore: 0.5, // Default threshold
      maxOutputDocuments: 5,    // Default max output
      sortBy: 'relevance',
    };
  }

  validateParameters(parameters: ExpertParameters): boolean {
    const params = parameters as DocumentFilteringParameters;
    if (params.minRelevanceScore !== undefined && (typeof params.minRelevanceScore !== 'number' || params.minRelevanceScore < 0 || params.minRelevanceScore > 1)) {
      logger.warn('DocumentFilteringExpert: minRelevanceScore must be a number between 0 and 1.');
      return false;
    }
    if (params.maxOutputDocuments !== undefined && (typeof params.maxOutputDocuments !== 'number' || params.maxOutputDocuments <= 0)) {
      logger.warn('DocumentFilteringExpert: maxOutputDocuments must be a positive number.');
      return false;
    }
    if (params.sortBy !== undefined && !['relevance', 'recency', 'custom'].includes(params.sortBy)) {
      logger.warn('DocumentFilteringExpert: sortBy must be one of "relevance", "recency", "custom".');
      return false;
    }
    return true;
  }

  async process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput> {
    // This expert expects 'documents' in the input.expertOutput (as RetrievalResult) or input.data
    let documentsToFilter: InputDocument[] = [];

    if (input.expertOutput && (input.expertOutput as RetrievalResult).documents) {
      documentsToFilter = (input.expertOutput as RetrievalResult).documents as InputDocument[];
    } else if (input.data && typeof input.data === 'object' && input.data !== null && Array.isArray((input.data as any).documents)) {
      // Assume input.data.documents also follows a similar structure if used directly
      documentsToFilter = (input.data as any).documents as InputDocument[];
    }
    
    const currentParams = this.getParameters() as DocumentFilteringParameters;

    const span = trace.span({
      name: `${this.name}-overall-processing`,
      input: {
        documentsCount: documentsToFilter.length,
        firstDocumentSample: documentsToFilter.length > 0 ? { id: documentsToFilter[0].id, score: documentsToFilter[0].score, contentSnippet: documentsToFilter[0].content.substring(0,50) } : null,
        params: currentParams
      },
      metadata: {
        expertName: this.name,
        expertType: this.type,
        appliedParameters: currentParams,
        numInputDocuments: documentsToFilter.length,
      },
    });

    try {
      logger.info(`Expert '${this.name}': Filtering ${documentsToFilter.length} documents.`);
      const startTime = Date.now();

      let filteredDocuments = [...documentsToFilter];

      // 1. Filter by minRelevanceScore (if documents have a score)
      if (currentParams.minRelevanceScore !== undefined) {
        filteredDocuments = filteredDocuments.filter(doc => doc.score === undefined || doc.score! >= currentParams.minRelevanceScore!);
      }
      
      // 2. Sort documents (example: by relevance score descending)
      // More complex sorting (e.g., by recency if timestamps are available) would go here.
      if (currentParams.sortBy === 'relevance') {
        filteredDocuments.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
      }
      // TODO: Implement other sorting strategies like 'recency' if applicable metadata exists.

      // 3. Limit by maxOutputDocuments
      if (currentParams.maxOutputDocuments !== undefined) {
        filteredDocuments = filteredDocuments.slice(0, currentParams.maxOutputDocuments);
      }

      const processingTime = Date.now() - startTime;
      logger.info(`Expert '${this.name}': Filtered down to ${filteredDocuments.length} documents in ${processingTime}ms.`);

      const output: ExpertOutput = {
        documents: filteredDocuments, // Output the filtered documents
        metrics: {
          processingTimeMs: processingTime,
          numInputDocuments: documentsToFilter.length,
          numOutputDocuments: filteredDocuments.length,
        }
      };

      span.end({ output });
      return output;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during document filtering';
      logger.error(`Expert '${this.name}': Error during processing.`, error instanceof Error ? error : new Error(String(error)));
      span.end({
        level: "ERROR",
        statusMessage: errorMessage,
        output: { error: errorMessage, numInputDocuments: documentsToFilter.length },
      });
      return { documents: [], error: errorMessage };
    }
  }

  async calculateScores(output: ExpertOutput, langfuseObject: LangfuseSpanClient | LangfuseGenerationClient, trace: LangfuseTraceClient): Promise<void> {
    if (output.metrics && typeof output.metrics.numOutputDocuments === 'number' && typeof output.metrics.numInputDocuments === 'number') {
      const reductionPercentage = output.metrics.numInputDocuments > 0 
        ? ((output.metrics.numInputDocuments - output.metrics.numOutputDocuments) / output.metrics.numInputDocuments) * 100
        : 0;
      langfuseObject.score({
        name: 'document_reduction_percentage',
        value: parseFloat(reductionPercentage.toFixed(2)),
        comment: `Percentage of documents filtered out. Input: ${output.metrics.numInputDocuments}, Output: ${output.metrics.numOutputDocuments}`
      });
    }
    if (output.metrics && typeof output.metrics.processingTimeMs === 'number') {
      langfuseObject.score({
        name: 'filtering_processing_time_ms',
        value: output.metrics.processingTimeMs,
        comment: 'Time taken for document filtering in milliseconds.'
      });
    }
    return Promise.resolve();
  }
}