import { BaseExpert, ExpertOutput, ExpertParameters } from './baseExpert';
import { ChainInput, ChainContext } from '../chain/types';
import { LangfuseTraceClient } from 'langfuse';
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
    // Create a span for this expert's processing
    const span = trace.span({
      name: `${this.name}-processing`,
      input,
      metadata: { expertType: this.type },
    });

    try {
      // Extract query from input
      const query = input.query || '';
      logger.info(`Expert '${this.name}': Retrieving data for query: "${query}"`);
      
      // Start timing for performance metrics
      const startTime = Date.now();
      
      // Get parameters from the expert's configuration
      const params = this.getParameters() as DataRetrievalParameters;
      const collectionName = params.collectionName || 'documents';
      const numResults = params.numResults || 5;
      const similarityThreshold = params.similarityThreshold || 0.7;
      const includeMetadata = params.includeMetadata !== undefined ? params.includeMetadata : true;
      
      // Add parameters to trace for observability
      span.update({
        metadata: {
          parameters: {
            collectionName,
            numResults,
            similarityThreshold,
            includeMetadata
          }
        }
      });
      
      // Retrieve relevant documents from the vector database
      const results = await this.retrieveDocumentsFromVectorDb(
        query,
        collectionName,
        numResults
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
        // level: "ERROR", // Invalid property
        output: { 
          error: "Data retrieval failed",
          message: error instanceof Error ? error.message : "Unknown error"
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
    numResults: number = 5
  ) {
    logger.info(`Expert '${this.name}': Querying vector database with: "${query}"`);
    
    try {
      // Check if OpenAI API key is available
      if (!process.env.OPENAI_API_KEY) {
        logger.error(`Expert '${this.name}': OpenAI API key is not configured`);
        throw new Error('OpenAI API key is not configured. Cannot perform vector search without embeddings.');
      }
      
      // Query the vector database
      const results = await queryDocuments(collectionName, query, numResults);
      
      // Check if we got any results
      if (results.documents.length === 0) {
        logger.warn(`Expert '${this.name}': No documents found in vector database for query: "${query}"`);
        return {
          documents: [],
          metadatas: [],
          ids: [],
          distances: []
        };
      }
      
      logger.info(`Expert '${this.name}': Retrieved ${results.documents.length} documents from vector database`);
      return results;
    } catch (error) {
      logger.error(`Expert '${this.name}': Error querying vector database`, error instanceof Error ? error : undefined);
      
      // Re-throw the error to be handled by the process method
      throw new Error(`Vector database query failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}