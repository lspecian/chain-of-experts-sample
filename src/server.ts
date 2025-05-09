// Load environment variables from .env file
import dotenv from 'dotenv';
// Load .env file from project root
dotenv.config();
// Note: We're using only the root .env file now

import express from 'express';
import { json } from 'body-parser'; // Import body-parser
import { v4 as uuidv4 } from 'uuid';
import { ChainManager, getLangfuseClient } from './chain/chainManager';
import { ExpertRegistry } from './experts';
import { getExpertByName, getExpertById } from './storage/expertStorage';
import { configPromise, getConfig } from './config';
import { logger } from './utils/logger';
import { ChainContext, ChainInput, ChainOptions, IntermediateResult } from './chain/types'; // Import IntermediateResult
import { AppContext } from './chain/context';
import { initializeVectorDatabase } from './vectordb/initDb';
import { getLLMProviderFactory } from './llm';
import { CacheManager } from './cache/cacheManager';

async function startServer() {
  // Ensure configuration is loaded before proceeding
  try {
    await configPromise; 
    logger.info("Configuration loaded successfully.");
    
    // Initialize vector database
    try {
      await initializeVectorDatabase();
      logger.info("Vector database initialized successfully.");
    } catch (error) {
      logger.warn("Vector database initialization failed. Continuing with fallback data.",
        error instanceof Error ? error : undefined);
      // Continue execution even if vector DB fails - the expert has a fallback
    }
    
    // Initialize LLM providers
    try {
      const config = getConfig();
      const factory = getLLMProviderFactory();
      
      // Register providers from config
      factory.initializeProviders(config.llm.providers);
      
      // Set default provider
      if (config.llm.defaultProvider) {
        factory.setDefaultProvider(config.llm.defaultProvider);
      }
      
      logger.info(`LLM providers initialized. Default provider: ${factory.getDefaultProviderName()}`);
      logger.info(`Available providers: ${factory.getRegisteredProviders().join(', ')}`);
    } catch (error) {
      logger.error("Failed to initialize LLM providers", error instanceof Error ? error : undefined);
      // Continue execution - experts will handle missing providers
    }
  } catch (error) {
    logger.error("Failed to load configuration on startup. Exiting.", error instanceof Error ? error : undefined);
    process.exit(1); // Exit if critical config fails
  }

  const app = express();
  app.use(json()); // Use body-parser middleware
  
  // Add CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    logger.info('Health check requested');
    res.status(200).json({ status: 'ok' });
  });

  // API endpoint to get available experts
  app.get('/api/experts', (req, res) => {
    try {
      const experts = ExpertRegistry.getAllExpertConfigs();
      
      // Add additional metadata for frontend display
      const enhancedExperts = experts.map(expert => {
        const storedExpert = getExpertByName(expert.name);
        return {
          ...expert,
          id: storedExpert?.id || '',
          isBuiltIn: storedExpert?.isBuiltIn || false,
          createdAt: storedExpert?.createdAt || '',
          updatedAt: storedExpert?.updatedAt || ''
        };
      });
      
      logger.info('Experts list requested', { count: experts.length });
      res.json({
        experts: enhancedExperts,
        count: enhancedExperts.length
      });
    } catch (error) {
      // Handle unknown error type
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error getting experts list', errorObj);
      res.status(500).json({ error: 'Failed to retrieve expert list' });
    }
  });

  // API endpoint to get a specific expert configuration
  app.get('/api/experts/:id', (req, res) => {
    try {
      const expertId = req.params.id;
      let expertConfig;
      
      // Check if the ID is a name or an actual ID
      if (expertId.startsWith('builtin-') || expertId.length > 10) {
        // It's likely an ID
        const storedExpert = getExpertById(expertId);
        if (storedExpert) {
          expertConfig = ExpertRegistry.getExpertConfig(storedExpert.name);
        }
      } else {
        // Treat it as a name
        expertConfig = ExpertRegistry.getExpertConfig(expertId);
      }
      
      if (!expertConfig) {
        logger.warn(`Expert not found: ${expertId}`);
        return res.status(404).json({ error: `Expert '${expertId}' not found` });
      }
      
      // Get additional metadata from storage
      const storedExpert = getExpertByName(expertConfig.name);
      
      logger.info(`Expert configuration requested: ${expertConfig.name}`);
      res.json({
        expert: {
          ...expertConfig,
          id: storedExpert?.id || '',
          isBuiltIn: storedExpert?.isBuiltIn || false,
          createdAt: storedExpert?.createdAt || '',
          updatedAt: storedExpert?.updatedAt || ''
        }
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error getting expert configuration', errorObj);
      res.status(500).json({ error: 'Failed to retrieve expert configuration' });
    }
  });

  // API endpoint to register a new expert
  app.post('/api/experts', (req, res) => {
    try {
      const { name, description, parameters, metadata, type = 'custom' } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Expert name is required' });
      }
      
      // Validate name format
      if (!/^[a-z0-9-]+$/.test(name)) {
        return res.status(400).json({
          error: 'Expert name must contain only lowercase letters, numbers, and hyphens'
        });
      }
      
      // Check if expert already exists
      const existingExpert = ExpertRegistry.getExpertConfig(name);
      if (existingExpert) {
        return res.status(409).json({ error: `Expert '${name}' already exists` });
      }
      
      // Create a factory function for the custom expert
      const factory = (params?: any) => {
        // Create a custom expert instance
        const customExpert: any = {
          getName: () => name,
          getType: () => type,
          getMetadata: () => ({
            version: '1.0.0',
            description: description || `Custom expert: ${name}`,
            tags: [type],
            createdAt: new Date().toISOString(),
            ...(metadata || {})
          }),
          getParameters: () => params || parameters || {},
          setParameters: (newParams: any) => {
            // This would be implemented in a real expert
          },
          process: async (input: any, context: any, trace: any) => {
            // This is a placeholder implementation
            return {
              result: `Custom expert '${name}' processed input: ${JSON.stringify(input)}`,
              parameters: params || parameters || {}
            };
          }
        };
        return customExpert;
      };
      
      // Register the expert
      ExpertRegistry.register({
        name,
        factory,
        description: description || `Custom expert: ${name}`,
        parameters: parameters || {},
        metadata: {
          version: '1.0.0',
          tags: [type],
          ...(metadata || {})
        }
      });
      
      // Get the newly registered expert with storage metadata
      const newExpert = ExpertRegistry.getExpertConfig(name);
      const storedExpert = getExpertByName(name);
      
      logger.info(`New expert registered: ${name}`);
      res.status(201).json({
        message: `Expert '${name}' registered successfully`,
        expert: {
          ...newExpert,
          id: storedExpert?.id || '',
          isBuiltIn: storedExpert?.isBuiltIn || false,
          createdAt: storedExpert?.createdAt || '',
          updatedAt: storedExpert?.updatedAt || ''
        }
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error registering expert', errorObj);
      res.status(500).json({ error: 'Failed to register expert' });
    }
  });

  // API endpoint to update an expert
  app.put('/api/experts/:id', (req, res) => {
    try {
      const expertId = req.params.id;
      const { description, parameters, metadata } = req.body;
      
      // Find the expert by ID or name
      let expertName;
      let storedExpert;
      
      if (expertId.startsWith('builtin-') || expertId.length > 10) {
        // It's likely an ID
        storedExpert = getExpertById(expertId);
        if (storedExpert) {
          expertName = storedExpert.name;
        }
      } else {
        // Treat it as a name
        expertName = expertId;
        storedExpert = getExpertByName(expertName);
      }
      
      // Check if expert exists
      const existingExpert = expertName ? ExpertRegistry.getExpertConfig(expertName) : undefined;
      if (!existingExpert || !storedExpert) {
        return res.status(404).json({ error: `Expert '${expertId}' not found` });
      }
      
      // Check if expert is a built-in expert
      if (storedExpert.isBuiltIn) {
        return res.status(403).json({ error: `Cannot update built-in expert '${expertName}'` });
      }
      
      // Create updated expert configuration
      const updatedConfig = {
        ...existingExpert,
        description: description !== undefined ? description : existingExpert.description,
        parameters: parameters !== undefined ? parameters : existingExpert.parameters,
        metadata: metadata !== undefined ? {
          ...existingExpert.metadata,
          ...metadata,
          updatedAt: new Date().toISOString()
        } : existingExpert.metadata
      };
      
      // Register the updated expert (this will overwrite the existing one)
      ExpertRegistry.register(updatedConfig);
      
      // Get the updated expert with storage metadata
      let updatedExpert = null;
      let updatedStoredExpert = null;
      if (expertName) {
        updatedExpert = ExpertRegistry.getExpertConfig(expertName);
        updatedStoredExpert = getExpertByName(expertName);
      }
      
      logger.info(`Expert updated: ${expertName}`);
      res.json({
        message: `Expert '${expertName}' updated successfully`,
        expert: {
          ...updatedExpert,
          id: updatedStoredExpert?.id || '',
          isBuiltIn: updatedStoredExpert?.isBuiltIn || false,
          createdAt: updatedStoredExpert?.createdAt || '',
          updatedAt: updatedStoredExpert?.updatedAt || ''
        }
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error updating expert', errorObj);
      res.status(500).json({ error: 'Failed to update expert' });
    }
  });

  // API endpoint to delete an expert
  app.delete('/api/experts/:id', (req, res) => {
    try {
      const expertId = req.params.id;
      
      // Find the expert by ID or name
      let expertName;
      let storedExpert;
      
      if (expertId.startsWith('builtin-') || expertId.length > 10) {
        // It's likely an ID
        storedExpert = getExpertById(expertId);
        if (storedExpert) {
          expertName = storedExpert.name;
        }
      } else {
        // Treat it as a name
        expertName = expertId;
        storedExpert = getExpertByName(expertName);
      }
      
      // Check if expert exists
      if (!expertName || !storedExpert) {
        return res.status(404).json({ error: `Expert '${expertId}' not found` });
      }
      
      // Check if expert is a built-in expert
      if (storedExpert.isBuiltIn) {
        return res.status(403).json({ error: `Cannot delete built-in expert '${expertName}'` });
      }
      
      // Unregister the expert
      const result = ExpertRegistry.unregister(expertName);
      
      if (result) {
        logger.info(`Expert deleted: ${expertName}`);
        res.json({
          message: `Expert '${expertName}' deleted successfully`,
          id: storedExpert.id
        });
      } else {
        logger.warn(`Failed to delete expert: ${expertName}`);
        res.status(500).json({ error: `Failed to delete expert '${expertName}'` });
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error deleting expert', errorObj);
      res.status(500).json({ error: 'Failed to delete expert' });
    }
  });
  
  // API endpoint to get expert chain visualization data
  app.get('/api/experts/chain/visualization', (req, res) => {
    try {
      const experts = ExpertRegistry.getAllExpertConfigs();
      
      // Create nodes for each expert
      const nodes = experts.map((expert, index) => {
        const storedExpert = getExpertByName(expert.name);
        return {
          id: expert.name,
          type: expert.metadata?.tags?.[0] || 'custom',
          label: expert.name,
          description: expert.description || '',
          isBuiltIn: storedExpert?.isBuiltIn || false,
          parameters: expert.parameters || {},
          position: { x: 100 + (index % 3) * 250, y: 100 + Math.floor(index / 3) * 150 }
        };
      });
      
      // Create edges based on expert dependencies
      // For now, we'll create a simple sequential chain
      const edges = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          id: `e${i}-${i+1}`,
          source: nodes[i].id,
          target: nodes[i+1].id,
          animated: true,
          label: 'output',
        });
      }
      
      logger.info('Expert chain visualization data requested');
      res.json({
        nodes,
        edges,
        layout: 'horizontal'
      });
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error getting expert chain visualization data', errorObj);
      res.status(500).json({ error: 'Failed to retrieve expert chain visualization data' });
    }
  });

  // Example API endpoint for capturing user feedback/scores
  app.post('/api/feedback', async (req, res) => {
    const { traceId, scoreValue, comment, scoreName = "user-feedback" } = req.body;

    if (!traceId || scoreValue === undefined) {
      return res.status(400).json({ error: 'traceId and scoreValue are required' });
    }

    try {
      // Get the Langfuse client
      const langfuse = getLangfuseClient();
      
      // Submit the score to Langfuse
      await langfuse.score({
        traceId: traceId,
        name: scoreName, // e.g., 'user-satisfaction', 'thumbs-up-down'
        value: scoreValue, // e.g., 1 for positive, 0 for negative, or a rating
        comment: comment,
      });
      
      logger.info('Feedback received and sent to Langfuse', { traceId, scoreName, scoreValue });
      res.status(200).json({ message: 'Feedback received' });
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error processing feedback', errorObj, { traceId });
      res.status(500).json({ error: 'Failed to process feedback' });
    }
  });

  // API endpoint to process input through the chain
  // Cache management API endpoints
  app.get('/api/cache/stats', (req, res) => {
    try {
      const cacheManager = CacheManager.getInstance();
      const stats = cacheManager.getStats();
      res.status(200).json(stats);
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error getting cache stats', errorObj);
      res.status(500).json({ error: 'Failed to get cache stats' });
    }
  });

  app.post('/api/cache/clear', (req, res) => {
    try {
      const cacheManager = CacheManager.getInstance();
      cacheManager.clear();
      res.status(200).json({ message: 'Cache cleared successfully' });
    } catch (error) {
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('Error clearing cache', errorObj);
      res.status(500).json({ error: 'Failed to clear cache' });
    }
  });

  app.post('/api/process', async (req, res) => {
    const requestStartTime = Date.now();
    let effectiveUserId = ''; // Initialize outside try block
    let effectiveSessionId = ''; // Initialize outside try block

    try {
      // Destructure request body
      const { input, expertNames, userId, sessionId, options, skipCache, expertParameters } = req.body;
      const chainOptions: ChainOptions = options || {}; // Get chain options or default to empty object
      
      // Set skipCache option if provided
      if (skipCache !== undefined) {
        chainOptions.skipCache = skipCache;
      }
      
      // Set expert parameters if provided
      if (expertParameters) {
        chainOptions.expertParameters = expertParameters;
      }
      
      // Generate IDs if not provided
      effectiveUserId = userId || `user-${uuidv4()}`;
      effectiveSessionId = sessionId || `session-${uuidv4()}`;

      logger.info('Processing request', {
        userId: effectiveUserId,
        sessionId: effectiveSessionId,
        expertNames,
        executionMode: chainOptions.executionMode || 'sequential'
      });

      // Validate request
      if (!input) {
        logger.warn('Processing request failed: Input is required', { userId: effectiveUserId, sessionId: effectiveSessionId });
        return res.status(400).json({ error: 'Input is required' });
      }
      
      if (!expertNames || !Array.isArray(expertNames) || expertNames.length === 0) {
        logger.warn('Processing request failed: Expert names are required', { userId: effectiveUserId, sessionId: effectiveSessionId });
        return res.status(400).json({ error: 'At least one expert name is required' });
      }
      
      // Create an instance of AppContext
      // Cast input to ChainInput if necessary, or ensure req.body matches ChainInput structure
      const context = new AppContext(input as ChainInput, effectiveUserId, effectiveSessionId); 

      // Create a chain manager with the specified experts
      // TODO: Handle potential errors from ExpertRegistry.getExpert
      const chainManager = new ChainManager(expertNames); 

      // Process the input through the chain, passing the context and options
      const result = await chainManager.process(input, context, effectiveUserId, effectiveSessionId, chainOptions);
      
      const durationMs = Date.now() - requestStartTime;
      logger.info('Processing request successful', { userId: effectiveUserId, sessionId: effectiveSessionId, durationMs, success: result.success });

      // Return the result with traceId and durationMs
      res.status(result.success ? 200 : 500).json({
        ...result,
        traceId: context.traceId, // Include the traceId in the response
        durationMs // Include the processing time in the response
      }); // Use appropriate status code
    } catch (error) {
      const durationMs = Date.now() - requestStartTime;
      // Handle unknown error type
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('API error during processing', errorObj, { userId: effectiveUserId, sessionId: effectiveSessionId, durationMs });
      res.status(500).json({ 
        success: false, // Add success flag for consistency
        error: 'An error occurred while processing the request',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Streaming API endpoint to process input through the chain
  app.post('/api/process/stream', async (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const requestStartTime = Date.now();
    let effectiveUserId = '';
    let effectiveSessionId = '';

    try {
      // Destructure request body
      const { input, expertNames, userId, sessionId, options, skipCache, expertParameters } = req.body;
      const chainOptions: ChainOptions = options || {};
      
      // Set skipCache option if provided
      if (skipCache !== undefined) {
        chainOptions.skipCache = skipCache;
      }
      
      // Set expert parameters if provided
      if (expertParameters) {
        chainOptions.expertParameters = expertParameters;
      }
      
      // Generate IDs if not provided
      effectiveUserId = userId || `user-${uuidv4()}`;
      effectiveSessionId = sessionId || `session-${uuidv4()}`;

      logger.info('Processing streaming request', {
        userId: effectiveUserId,
        sessionId: effectiveSessionId,
        expertNames,
        executionMode: chainOptions.executionMode || 'sequential'
      });

      // Validate request
      if (!input) {
        logger.warn('Streaming request failed: Input is required', { userId: effectiveUserId, sessionId: effectiveSessionId });
        res.write(`data: ${JSON.stringify({ error: 'Input is required', success: false })}\n\n`);
        return res.end();
      }
      
      if (!expertNames || !Array.isArray(expertNames) || expertNames.length === 0) {
        logger.warn('Streaming request failed: Expert names are required', { userId: effectiveUserId, sessionId: effectiveSessionId });
        res.write(`data: ${JSON.stringify({ error: 'At least one expert name is required', success: false })}\n\n`);
        return res.end();
      }
      
      // Create an instance of AppContext
      const context = new AppContext(input as ChainInput, effectiveUserId, effectiveSessionId);
      
      // Send initial event with traceId
      res.write(`data: ${JSON.stringify({
        type: 'init',
        traceId: context.traceId,
        experts: expertNames
      })}\n\n`);

      // Create a chain manager with the specified experts
      const chainManager = new ChainManager(expertNames);
      
      // Create a callback function to handle intermediate results
      const onIntermediateResult = (result: IntermediateResult) => {
        // Send the intermediate result to the client
        res.write(`data: ${JSON.stringify({
          type: 'intermediate',
          result: result
        })}\n\n`);
      };
      
      // Process the input through the chain with streaming
      const result = await chainManager.process(
        input,
        context,
        effectiveUserId,
        effectiveSessionId,
        { ...chainOptions, onIntermediateResult }
      );
      
      const durationMs = Date.now() - requestStartTime;
      logger.info('Streaming request successful', {
        userId: effectiveUserId,
        sessionId: effectiveSessionId,
        durationMs,
        success: result.success
      });

      // Send the final result
      res.write(`data: ${JSON.stringify({
        type: 'final',
        result: result.result,
        success: result.success,
        traceId: context.traceId,
        durationMs
      })}\n\n`);
      
      // End the response
      res.end();
    } catch (error) {
      const durationMs = Date.now() - requestStartTime;
      const errorObj = error instanceof Error ? error : undefined;
      logger.error('API error during streaming', errorObj, {
        userId: effectiveUserId,
        sessionId: effectiveSessionId,
        durationMs
      });
      
      // Send error event
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: 'An error occurred while processing the request',
        message: error instanceof Error ? error.message : 'Unknown error',
        success: false
      })}\n\n`);
      
      // End the response
      res.end();
    }
  });

  // Start the server
  const config = getConfig(); // Get config instance (safe now)
  const port = config.server?.port || 8080;
  app.listen(port, () => {
    logger.info(`Server running on port ${port}`);
  });
}

// Start the server process
startServer();