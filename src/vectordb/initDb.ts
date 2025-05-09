import { populateDatabase } from './populateDb';
import { getChromaClient } from './chromaClient';
import { logger } from '../utils/logger';

/**
 * Initialize the vector database
 * This function checks if ChromaDB is running and populates it with sample data
 */
async function initializeVectorDatabase() {
  try {
    logger.info('Initializing vector database...');
    
    // Check if required environment variables are set
    if (!process.env.OPENAI_API_KEY) {
      logger.warn('OPENAI_API_KEY environment variable is not set. Vector database will use fallback data.');
      logger.info('You can set the OPENAI_API_KEY in your .env file to use the vector database.');
      return false;
    }
    
    try {
      // Check if ChromaDB is running
      const client = await getChromaClient();
      const heartbeat = await client.heartbeat();
      logger.info(`ChromaDB is running. Heartbeat: ${heartbeat}`);
      
      // List existing collections
      const collections = await client.listCollections();
      logger.info(`Found ${collections.length} existing collections: ${collections.join(', ') || 'none'}`);
      
      // Check if our collection already exists
      const collectionName = 'sample_documents';
      const collectionExists = collections.includes(collectionName);
      
      if (collectionExists) {
        logger.info(`Collection '${collectionName}' already exists. Skipping population.`);
        logger.info('If you want to repopulate the database, delete the collection first.');
      } else {
        // Populate the database with sample documents
        logger.info(`Collection '${collectionName}' does not exist. Populating with sample documents...`);
        try {
          await populateDatabase();
          logger.info(`Successfully populated collection '${collectionName}'`);
        } catch (populateError) {
          logger.error('Failed to populate database with sample documents',
            populateError instanceof Error ? populateError : undefined);
          return false;
        }
      }
      
      logger.info('Vector database initialization complete');
      return true;
    } catch (dbError) {
      logger.error('Failed to connect to ChromaDB', dbError instanceof Error ? dbError : undefined);
      logger.error('Make sure ChromaDB is running. You can start it with: docker-compose up -d');
      return false;
    }
  } catch (error) {
    logger.error('Unexpected error during vector database initialization',
      error instanceof Error ? error : undefined);
    return false;
  }
}

// Execute if this script is run directly
if (require.main === module) {
  initializeVectorDatabase()
    .then((success) => {
      if (success) {
        logger.info('Vector database initialization completed successfully');
        process.exit(0);
      } else {
        logger.error('Vector database initialization failed');
        process.exit(1);
      }
    })
    .catch((error) => {
      logger.error('Unexpected error during vector database initialization', error);
      process.exit(1);
    });
}

export { initializeVectorDatabase };