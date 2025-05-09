import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse'; // Added imports
import { queryDocuments } from '../vectordb/chromaClient';
import { logger } from '../utils/logger';

interface DataRetrievalParameters {
  collectionName?: string;
  numResults?: number;
  similarityThreshold?: number;
  includeMetadata?: boolean;
}

export class DataRetrievalExpert extends BaseExpert {
  constructor(parameters?: ExpertParameters) {
    // Use consistent naming if possible (e.g., camelCase or kebab-case)
    super('data-retrieval', 'retrieval', parameters);
  }

  // Override to provide default parameters specific to this expert
  protected getDefaultParameters(): ExpertParameters {
    return {
      collectionName: 'documents',
      numResults: 5,
      similarityThreshold: 0.7,
      includeMetadata: true
    };
  }

  // Override to validate parameters specific to this expert
  validateParameters(parameters: ExpertParameters): boolean {
    // Validate numResults is a positive number
    if (parameters.numResults !== undefined &&
        (typeof parameters.numResults !== 'number' || parameters.numResults <= 0)) {
      return false;
    }
    
    // Validate collectionName is a non-empty string
    if (parameters.collectionName !== undefined &&
        (typeof parameters.collectionName !== 'string' || parameters.collectionName.trim() === '')) {
      return false;
    }

    // Validate similarityThreshold is a number between 0 and 1
    if (parameters.similarityThreshold !== undefined &&
        (typeof parameters.similarityThreshold !== 'number' ||
         parameters.similarityThreshold < 0 ||
         parameters.similarityThreshold > 1)) {
      return false;
    }

    // Validate includeMetadata is a boolean
    if (parameters.includeMetadata !== undefined &&
        typeof parameters.includeMetadata !== 'boolean') {
      return false;
    }

    return true;
  }

  async process(input: ChainInput, context: ChainContext, trace: LangfuseTraceClient): Promise<ExpertOutput> {
    // Define parameters and query at a higher scope for accessibility in catch block
    const query = input.query || '';
    const expertBaseParams = this.getParameters() as DataRetrievalParameters;
    const collectionName = expertBaseParams.collectionName || 'documents';
    const numResults = expertBaseParams.numResults || 5;
    const similarityThreshold = expertBaseParams.similarityThreshold || 0.7;
    const includeMetadata = expertBaseParams.includeMetadata !== undefined ? expertBaseParams.includeMetadata : true;

    // Create a span for this expert's processing
    const span = trace.span({ // This span is created by ChainManager's processWithExpert
      name: `${this.name}-overall-processing`, // Renamed to distinguish from internal spans
      input: { // Log a summary of the input
        type: input.type,
        query: input.query,
        dataKeys: input.data ? Object.keys(input.data) : undefined,
        expertOutputKeys: input.expertOutput ? Object.keys(input.expertOutput) : undefined,
      },
      metadata: {
        expertName: this.name,
        expertType: this.type,
        appliedParameters: this.getParameters(), // Log effective parameters
        inputType: input.type,
        tags: [`expert-instance:${this.name}`, `expert-type:${this.type}`],
      },
    });

    try {
      // query, collectionName, numResults, similarityThreshold, includeMetadata are already defined at the top of the method.
      logger.info(`Expert '${this.name}': Retrieving data for query: "${query}"`);
      
      // Start timing for performance metrics
      const startTime = Date.now();
      
      // Parameters are already defined above
      
      // Add parameters to trace for observability
      // Metadata for the overall expert span is updated here
      // Retrieve initial metadata to merge
      const initialOverallSpanMetadata = { // Reconstruct or pass initial metadata
        expertName: this.name,
        expertType: this.type,
        appliedParameters: this.getParameters(),
        inputType: input.type,
        tags: [`expert-instance:${this.name}`, `expert-type:${this.type}`],
      };
      span.update({
        metadata: {
          ...initialOverallSpanMetadata,
          effectiveRetrievalParameters: { // Log parameters used for this specific call
            collectionName: collectionName, // Explicitly assign
            numResults: numResults,
            similarityThreshold: similarityThreshold,
            includeMetadata: includeMetadata,
            queryUsed: query,
          },
        }
      });
      
      // Retrieve relevant documents from the vector database
      // Pass the main expert span (trace object) to allow nesting
      const results = await this.retrieveDocumentsFromVectorDb(
        query,
        collectionName,
        numResults,
        trace // Pass the parent span/trace client
      );
      
      // Calculate retrieval time
      const retrievalTime = Date.now() - startTime;
      
      // Calculate average relevance score
      const avgRelevanceScore = results.documents.length > 0
        ? results.distances.reduce((sum, distance) => sum + (1 - distance), 0) / results.distances.length
        : 0;
      
      const output = {
        documents: results.documents.map((doc, i) => ({
          id: results.ids[i],
          content: doc,
          metadata: results.metadatas[i],
          score: 1 - results.distances[i] // Convert distance to similarity score (1 - distance)
        })),
        relevanceScore: avgRelevanceScore,
        retrievalTime: new Date().toISOString(),
        metrics: {
          processingTimeMs: retrievalTime,
          numDocumentsRetrieved: results.documents.length,
          avgSimilarityScore: avgRelevanceScore
        }
      };

      // End span with successful output
      span.end({
        output,
        metadata: {
          processingTimeMs: retrievalTime,
          numDocumentsRetrieved: output.documents.length,
          avgSimilarityScore: avgRelevanceScore
        }
      });
      logger.info(`Expert '${this.name}': Finished processing. Retrieved ${output.documents.length} documents in ${retrievalTime}ms`);
      return output;
    } catch (error) {
      logger.error(`Expert '${this.name}': Error during processing`, error instanceof Error ? error : undefined);
      // End span with error
      span.end({
        level: "ERROR", // level is valid for span.end()
        statusMessage: error instanceof Error ? error.message : "Unknown error in data retrieval expert",
        output: {
          error: "Data retrieval failed",
          message: error instanceof Error ? error.message : "Unknown error"
        },
        metadata: {
            // Reconstruct or pass initial metadata if needed for context here
            expertName: this.name,
            expertType: this.type,
            appliedParameters: this.getParameters(),
            inputType: input.type,
            tags: [`expert-instance:${this.name}`, `expert-type:${this.type}`],
            processingStatus: "error",
            effectiveRetrievalParameters: { // Also log parameters at time of error
                collectionName: collectionName, // Explicitly assign
                numResults: numResults,
                similarityThreshold: similarityThreshold,
                includeMetadata: includeMetadata,
                queryUsed: query,
            }
        }
      });
      throw error; // Re-throw to allow chain manager to handle
    }
  }

  /**
   * Retrieve documents from the vector database
   * @param query The search query
   * @param collectionName The name of the collection to search
   * @param numResults The number of results to return
   * @returns The retrieved documents, metadatas, ids, and distances
   */
  private async retrieveDocumentsFromVectorDb(
    query: string,
    collectionName: string = 'documents',
    numResults: number = 5,
    parentTrace: LangfuseTraceClient // Accept parent trace/span
  ) {
    // Create a new span for the vector DB query, nested under the expert's main processing span
    const vectorDbSpan = parentTrace.span({
      name: `${this.name}-vectorDBQuery`,
      input: { query, collectionName, numResults },
      metadata: {
        expertName: this.name,
        expertType: this.type,
        dbOperation: 'queryDocuments',
        targetCollection: collectionName,
        tags: [`db-call`, `vector-search`, `chromaDB`],
      },
    });

    logger.info(`Expert '${this.name}': Querying vector database with: "${query}"`, { collectionName, numResults });

    try {
      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        const errorMsg = 'OpenAI API key is not configured. Cannot perform vector search without embeddings.';
        logger.error(`Expert '${this.name}': ${errorMsg}`);
        vectorDbSpan.end({
          level: "ERROR",
          statusMessage: errorMsg,
          output: { error: errorMsg }
        });
        throw new Error(errorMsg);
      }

      // Query the vector database
      const startTime = Date.now();
      const results = await queryDocuments(collectionName, query, numResults);
      const durationMs = Date.now() - startTime;

      // Check if we got any results
      if (results.documents.length === 0) {
        logger.warn(`Expert '${this.name}': No documents found in vector database for query: "${query}"`);
        vectorDbSpan.end({
          output: { documents: [], metadatas: [], ids: [], distances: [] },
          metadata: {
            expertName: this.name, // Add context from parent expert
            expertType: this.type,
            dbOperation: 'queryDocuments',
            targetCollection: collectionName,
            tags: [`db-call`, `vector-search`, `chromaDB`],
            durationMs,
            documentsRetrieved: 0
          }
        });
        return {
          documents: [],
          metadatas: [],
          ids: [],
          distances: []
        };
      }

      logger.info(`Expert '${this.name}': Retrieved ${results.documents.length} documents from vector database in ${durationMs}ms`);
      vectorDbSpan.end({
        output: {
          retrievedIds: results.ids,
          numRetrieved: results.documents.length,
          // Optionally log snippets or metadata of retrieved docs if not too large
        },
        metadata: {
          expertName: this.name, // Add context from parent expert
          expertType: this.type,
          dbOperation: 'queryDocuments',
          targetCollection: collectionName,
          tags: [`db-call`, `vector-search`, `chromaDB`],
          durationMs,
          documentsRetrieved: results.documents.length
        }
      });
      return results;
    } catch (error) {
      const errorMsg = `Vector database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      // Corrected logger call: pass error object directly, then context object
      logger.error(`Expert '${this.name}': Error querying vector database. Query: "${query}", Collection: ${collectionName}`, error instanceof Error ? error : new Error(String(error)));
      vectorDbSpan.end({
        level: "ERROR",
        statusMessage: errorMsg,
        output: {
          error: "Vector DB Query Error",
          message: error instanceof Error ? error.message : String(error),
        },
        metadata: {
          expertName: this.name, // Add context from parent expert
          expertType: this.type,
          dbOperation: 'queryDocuments',
          targetCollection: collectionName,
          tags: [`db-call`, `vector-search`, `chromaDB`],
          processingStatus: "error",
          originalQuery: query, // Log the query that failed
        }
      });
      // Re-throw the error to be handled by the process method
      throw new Error(errorMsg);
    }
  }

  async calculateScores(output: ExpertOutput, langfuseObject: LangfuseTraceClient | LangfuseSpanClient | LangfuseGenerationClient): Promise<void> {
    if (output.metrics && typeof output.metrics.avgSimilarityScore === 'number') {
      langfuseObject.score({
        name: 'avg_similarity_score',
        value: output.metrics.avgSimilarityScore,
        comment: 'Average similarity score of retrieved documents (1-distance).'
      });
    }
    if (output.metrics && typeof output.metrics.numDocumentsRetrieved === 'number') {
      langfuseObject.score({
        name: 'retrieved_document_count',
        value: output.metrics.numDocumentsRetrieved,
        comment: 'Number of documents retrieved by the expert.'
      });
    }
    // Example of a qualitative score based on thresholds
    if (output.metrics && typeof output.metrics.avgSimilarityScore === 'number') {
      let quality = 'low';
      if (output.metrics.avgSimilarityScore > 0.85) quality = 'high';
      else if (output.metrics.avgSimilarityScore > 0.75) quality = 'medium';
      langfuseObject.score({
        name: 'retrieval_quality_estimate',
        value: output.metrics.avgSimilarityScore, // Use the numeric value for sorting/filtering
        comment: `Estimated retrieval quality: ${quality} (based on avg similarity)`
      });
    }
  }
}