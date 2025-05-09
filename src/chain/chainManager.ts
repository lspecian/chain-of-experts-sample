import { IExpert } from '../experts/baseExpert'; // Use IExpert
import { ExpertRegistry } from '../experts';
import { ChainInput, ChainOutput, ChainContext, ChainOptions, ExpertOutput, IntermediateResult } from './types'; // Import IntermediateResult
import { Langfuse, LangfuseTraceClient } from 'langfuse';
import { getConfig } from '../config';
import { ExpertError, isChainError } from './errors';
import { logger } from '../utils/logger';
import { CacheManager } from '../cache/cacheManager';

// Initialize Langfuse client
// TODO: Ensure config object and its properties are correctly defined and loaded
// Note: getConfig() returns the loaded config synchronously AFTER the initial promise resolves.
// Ensure config is loaded before this module initializes if direct access is needed here.
// Initialize Langfuse client lazily after config is loaded
// Or ensure configPromise is awaited before this module is loaded
let langfuse: Langfuse;
export function getLangfuseClient(): Langfuse {
  if (!langfuse) {
    const config = getConfig(); // Get config instance
    langfuse = new Langfuse({
      secretKey: config.langfuse.secretKey,
      publicKey: config.langfuse.publicKey,
      baseUrl: config.langfuse.baseUrl,
    });
  }
  return langfuse;
}

export class ChainManager {
  private experts: IExpert[]; // Use IExpert

  constructor(expertNames: string[]) {
    // Initialize experts from registry based on provided names
    // TODO: Implement ExpertRegistry.getExpert(name)
    this.experts = expertNames.map(name => ExpertRegistry.getExpert(name));
  }

  // Add ChainOptions parameter
  async process(
    input: ChainInput,
    context: ChainContext,
    userId: string,
    sessionId: string,
    options: ChainOptions = {} // Default to empty options
  ): Promise<ChainOutput> {
    const executionMode = options.executionMode || 'sequential'; // Default to sequential
    logger.info(`Starting chain process (mode: ${executionMode})`, { userId, sessionId, inputType: input.type, traceId: context.traceId });

    // Create a trace for the entire chain execution
    const trace = getLangfuseClient().trace({
      name: `chain-of-experts-${executionMode}`, // Include mode in trace name
      userId,
      sessionId,
      metadata: { inputType: input.type, executionMode },
      tags: ["production", "chain-of-experts", executionMode],
    });

    try {
      if (this.experts.length === 0) {
        logger.warn("Chain process attempted with no experts.", { userId, sessionId, traceId: context.traceId });
        trace.update({ output: { error: "No experts provided" }, metadata: { processingStatus: "error" } });
        return { result: null, success: false, error: 'No experts provided in the chain.' };
      }

      let finalOutput: ExpertOutput | null = null;
      // Array to store intermediate results from each expert
      const intermediateResults: IntermediateResult[] = [];

      if (executionMode === 'sequential') {
        // --- Sequential Execution ---
        logger.debug("Executing experts sequentially", { traceId: context.traceId, count: this.experts.length });
        let currentInput = input;
        for (let i = 0; i < this.experts.length; i++) {
          const expert = this.experts[i];
          const expertName = expert.getName();
          const expertType = expert.getType();
          logger.debug(`Processing sequentially with expert: ${expertName}`, { traceId: context.traceId });

          // Store the input for this expert
          const expertInput = { ...currentInput };

          // Get expert-specific parameters if available
          const expertSpecificParams = options.expertParameters?.[expertName];

          // Process with the expert
          finalOutput = await this.processWithExpert(
            expert,
            currentInput,
            context,
            trace,
            `expert-${i + 1}-${expertName}`,
            options,
            expertSpecificParams
          );

          // Create the intermediate result
          const intermediateResult: IntermediateResult = {
            expertName,
            expertType,
            expertIndex: i,
            input: expertInput,
            output: finalOutput,
            timestamp: new Date().toISOString()
          };
          
          // Store the intermediate result
          intermediateResults.push(intermediateResult);
          
          // Call the callback if provided
          if (options.onIntermediateResult) {
            options.onIntermediateResult(intermediateResult);
          }

          // Prepare input for the next expert
          currentInput = {
            ...input, // Keep original input context
            expertOutput: finalOutput, // Add output from current expert
          };
        }
        logger.info("Sequential chain process finished successfully", { userId, sessionId, traceId: context.traceId });

      } else {
        // --- Parallel Execution ---
        logger.debug("Executing experts in parallel", { traceId: context.traceId, count: this.experts.length });
        const promises = this.experts.map((expert, i) => {
          const expertName = expert.getName();
          logger.debug(`Processing in parallel with expert: ${expertName}`, { traceId: context.traceId });
          // Each parallel expert gets the *initial* input
          // Let processWithExpert resolve/reject directly
          // Get expert-specific parameters if available
          const expertSpecificParams = options.expertParameters?.[expertName];

          return this.processWithExpert(
            expert,
            input, // Use initial input for all parallel experts
            context,
            trace,
            `expert-${i + 1}-${expertName}`,
            options,
            expertSpecificParams
          );
        });

        // Use Promise.allSettled to wait for all parallel executions
        const results = await Promise.allSettled(promises);

        // Aggregate results
        const parallelResults: Record<string, any> = {};
        let overallSuccess = true;
        const errors: string[] = [];

        results.forEach((result, index) => {
          const expertName = this.experts[index].getName(); // Get name based on index
          if (result.status === 'fulfilled') {
            parallelResults[expertName] = result.value; // result.value is the ExpertOutput
          } else { // status === 'rejected'
            // result.reason should be the ExpertError thrown by processWithExpert
            const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
            parallelResults[expertName] = { error: errorMessage };
            errors.push(`Expert '${expertName}': ${errorMessage}`);
            overallSuccess = false;
          }
        });

        finalOutput = parallelResults; // Final output is the aggregated results object

        if (!overallSuccess) {
           logger.warn("Parallel chain process finished with errors", { userId, sessionId, traceId: context.traceId, errors });
           // Throw an aggregated error or handle partial success as needed
           // For now, we'll let the trace update reflect the aggregated output including errors
        } else {
           logger.info("Parallel chain process finished successfully", { userId, sessionId, traceId: context.traceId });
        }
      }

      // Update trace with final output (might be aggregated results in parallel mode)
      trace.update({
        output: finalOutput,
        metadata: { processingStatus: "success" } // Consider updating status based on parallel results
      });

      return {
        result: finalOutput,
        intermediateResults, // Include intermediate results in the response
        success: true, // TODO: Adjust success based on parallel results if needed (e.g., fail if any expert fails)
      };
    } catch (error) { // This catches errors from sequential mode or aggregated errors from parallel if re-thrown
      // Log error (already done by logger.error) and update trace
      // console.error('Chain processing error:', error); // Redundant if logger is used
      trace.update({
        // level: "ERROR", // 'level' might not be a valid property here
        // statusMessage: error instanceof Error ? error.message : "Unknown error", // Also seems invalid
        output: {
          error: "Processing failed",
          // Use custom error message if available
          message: isChainError(error) ? error.message : (error instanceof Error ? error.message : "Unknown error")
        }
      });

      return {
        result: null,
        success: false,
        // Use custom error message if available
        error: isChainError(error) ? error.message : (error instanceof Error ? error.message : 'Unknown error'),
      };
    } finally {
      // Ensure Langfuse client sends remaining data before function exits
      // IMPORTANT: Use this ONLY in short-lived environments (serverless/edge)
      // In long-running servers (like Express), rely on flushInterval/flushAt
      // await langfuse.shutdownAsync(); 
    }
  }

  private async processWithExpert(
    expert: IExpert,
    input: ChainInput,
    context: ChainContext,
    trace: LangfuseTraceClient,
    spanName: string,
    options?: ChainOptions,
    expertParameters?: Record<string, string | number | boolean | undefined>
  ): Promise<ExpertOutput> {
    // Apply expert-specific parameters if provided
    if (expertParameters && Object.keys(expertParameters).length > 0) {
      expert.setParameters(expertParameters);
      logger.debug(`Applied custom parameters to expert: ${expert.getName()}`, {
        parameters: expertParameters,
        traceId: context.traceId
      });
    }
    // Default retry configuration (could be overridden by expert/chain options)
    const maxAttempts = 3;
    const initialDelayMs = 200;
    const backoffFactor = 2;

    // Get cache manager instance with options from chain options
    const cacheManager = CacheManager.getInstance(options?.cache);
    
    // Check if we should skip cache
    const skipCache = options?.skipCache === true;
    
    // Generate cache key
    const expertName = expert.getName();
    const currentExpertParams = expert.getParameters();
    const cacheKey = cacheManager.generateCacheKey(expertName, input, currentExpertParams);
    
    // Check cache first if not skipping
    if (!skipCache) {
      const cachedOutput = cacheManager.get(cacheKey);
      if (cachedOutput) {
        logger.debug(`Using cached result for expert: ${expertName}`, {
          spanName,
          traceId: context.traceId,
          cacheKey
        });
        
        // Create a span for the cached result
        const cacheSpan = trace.span({
          name: `${spanName}-cached`,
          input,
          metadata: {
            expertType: expert.getType(),
            cached: true,
            cacheKey
          },
        });
        
        // End span with cached output
        cacheSpan.end({
          output: cachedOutput,
          metadata: { fromCache: true }
        });
        
        return cachedOutput;
      }
    }

    let attempts = 0;
    let currentDelayMs = initialDelayMs;
    let lastError: any = null;

    // Create a span for this expert's processing attempt(s)
    const span = trace.span({
      name: spanName,
      input,
      metadata: {
        expertType: expert.getType(),
        maxAttempts,
        cached: false,
        cacheKey
      },
    });

    while (attempts < maxAttempts) {
      attempts++;
      try {
        logger.debug(`Executing expert process: ${expertName} (Attempt ${attempts}/${maxAttempts})`, {
          spanName,
          traceId: context.traceId
        });
        
        const output = await expert.process(input, context, trace); // Pass trace for potential sub-spans/generations
        
        logger.debug(`Expert process finished successfully: ${expertName} (Attempt ${attempts})`, {
          spanName,
          traceId: context.traceId
        });

        // Store result in cache if not skipping
        if (!skipCache) {
          cacheManager.set(cacheKey, output);
          logger.debug(`Cached result for expert: ${expertName}`, {
            spanName,
            traceId: context.traceId,
            cacheKey
          });
        }

        // End span successfully
        span.end({
          output,
          metadata: {
            cached: false,
            attempts
          }
        });
        
        return output; // Success, exit loop and return output
      } catch (error) {
        lastError = error;
        logger.warn(`Expert process attempt ${attempts} failed: ${expert.getName()}`, { spanName, traceId: context.traceId, error: error instanceof Error ? error.message : error });

        // Check if it's the last attempt
        if (attempts >= maxAttempts) {
          logger.error(`Expert process failed after ${maxAttempts} attempts: ${expert.getName()}`, lastError instanceof Error ? lastError : new Error(String(lastError)), { spanName, traceId: context.traceId });
          // End span with error after final attempt
          span.end({
            level: "ERROR", // Langfuse level for error
            statusMessage: error instanceof Error ? error.message : "Expert processing failed after retries",
            output: {
              error: "Expert processing failed after retries",
              message: error instanceof Error ? error.message : "Unknown error",
              attempts,
            }
          });
          // Re-throw as a specific ExpertError
          throw new ExpertError(
            error instanceof Error ? error.message : "Unknown error during expert processing",
            expert.getName(),
            { originalError: error, attempts }
          );
        }

        // TODO: Implement logic to check if the error is retriable
        // For now, we retry on any error
        const isRetriable = true; // Assume all errors are retriable for now

        if (!isRetriable) {
           logger.error(`Non-retriable error encountered in expert ${expert.getName()}`, lastError instanceof Error ? lastError : new Error(String(lastError)), { spanName, traceId: context.traceId });
           span.end({ level: "ERROR", statusMessage: "Non-retriable error", output: { error: "Non-retriable error", message: error instanceof Error ? error.message : "Unknown error" } });
           throw new ExpertError(error instanceof Error ? error.message : "Non-retriable error", expert.getName(), { originalError: error });
        }

        // Wait before retrying
        logger.info(`Retrying expert ${expert.getName()} in ${currentDelayMs}ms... (Attempt ${attempts + 1}/${maxAttempts})`, { spanName, traceId: context.traceId });
        await new Promise(resolve => setTimeout(resolve, currentDelayMs));

        // Increase delay for next attempt (exponential backoff)
        currentDelayMs *= backoffFactor;
      }
    }

    // This part should theoretically not be reached due to the throw in the loop,
    // but included for completeness and type safety.
    logger.error(`Expert process loop completed without success or final error throw: ${expert.getName()}`, undefined, { spanName, traceId: context.traceId });
    span.end({ level: "ERROR", statusMessage: "Expert processing failed unexpectedly after loop", output: { error: "Unexpected loop exit" } });
    throw new ExpertError("Expert processing failed unexpectedly after retries", expert.getName(), { originalError: lastError, attempts });
  }
}