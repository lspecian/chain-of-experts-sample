import { IExpert } from '../experts/baseExpert'; // Use IExpert
import { ExpertRegistry } from '../experts';
import { ChainInput, ChainOutput, ChainContext, ChainOptions, ExpertOutput, IntermediateResult, TokenUsage } from './types'; // Import TokenUsage
import { Langfuse, LangfuseTraceClient } from 'langfuse';
import { getConfig } from '../config';
import { ExpertError, isChainError } from './errors';
import { logger } from '../utils/logger';
import { CacheManager as InMemoryCacheManager, CacheOptions as InMemoryCacheOptions } from '../cache/cacheManager';
import { RedisCacheManager, RedisCacheOptions } from '../cache/redisCacheManager';
import { RelevanceEvaluator, EvaluationInput } from '../evaluators'; // Import evaluators

// Define a union type for the cache manager instance
type CacheManagerInstance = InMemoryCacheManager | RedisCacheManager;

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

interface CircuitBreakerState {
  failures: number;
  openUntil: number; // Timestamp until which the circuit is open
  lastAttempt: number; // Timestamp of the last attempt
}

export class ChainManager {
  private experts: IExpert[]; // Use IExpert
  private circuitBreakerStates: Map<string, CircuitBreakerState> = new Map();
  private rateLimitTimestamps: Map<string, number[]> = new Map(); // Stores timestamps of recent requests for an expert/service

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
      name: `chain-of-experts-${executionMode}`,
      userId,
      sessionId,
      metadata: {
        inputType: input.type,
        executionMode,
        inputQuery: input.type === 'query' ? input.query : undefined,
        inputDataKeys: input.type === 'data' && input.data ? Object.keys(input.data) : undefined,
        hasExpertOutputInInitialInput: !!input.expertOutput,
        chainOptions: {
          skipCache: options.skipCache,
          // Do not log sensitive cache config like Redis URLs directly
          cacheEnabled: !!options.cache,
          hasExpertParameters: !!options.expertParameters && Object.keys(options.expertParameters).length > 0,
        },
        contextTraceId: context.traceId, // Log the internal traceId from context as well
      },
      tags: ["production", "chain-of-experts", executionMode, `input-type:${input.type}`],
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
        const concurrency = options.maxConcurrency || this.experts.length; // Default to all experts if not set
        logger.debug("Executing experts in parallel", { traceId: context.traceId, count: this.experts.length, concurrency });

        const expertPromises: (() => Promise<ExpertOutput>)[] = this.experts.map((expert, i) => {
          const expertName = expert.getName();
          // Get expert-specific parameters if available
          const expertSpecificParams = options.expertParameters?.[expertName];
          
          // Return a function that when called, executes processWithExpert
          return () => {
            logger.debug(`Starting parallel execution for expert: ${expertName}`, { traceId: context.traceId });
            return this.processWithExpert(
              expert,
              input, // Use initial input for all parallel experts
              context,
              trace,
              `expert-${i + 1}-${expertName}`,
              options,
              expertSpecificParams
            );
          };
        });

        // Helper function to run promises with a concurrency limit
        async function runWithConcurrency<T>(
          poolLimit: number,
          iterable: (() => Promise<T>)[]
        ): Promise<PromiseSettledResult<T>[]> {
          const results: Promise<PromiseSettledResult<T>>[] = []; // Corrected type here
          const executing: Promise<void>[] = [];
          let i = 0;

          for (const itemFn of iterable) {
            const p = Promise.resolve().then(() => itemFn())
              .then(value => ({ status: 'fulfilled', value } as PromiseFulfilledResult<T>))
              .catch(reason => ({ status: 'rejected', reason } as PromiseRejectedResult));
            
            results.push(p); // Store the promise of the settled result

            const e: Promise<void> = p.then(() => {
              executing.splice(executing.indexOf(e), 1);
            });
            executing.push(e);
            if (executing.length >= poolLimit) {
              await Promise.race(executing);
            }
            i++;
          }
          await Promise.all(executing); // Wait for all to finish
          // At this point, all promises in 'executing' have settled.
          // The 'results' array contains promises that will resolve to PromiseSettledResult.
          // We need to await all of them to get the actual settled results.
          return Promise.all(results);
        }
        
        // Use the concurrency helper
        const results = await runWithConcurrency(concurrency, expertPromises);
        
        // The code block below was the previous direct Promise.allSettled approach.
        // It's kept here commented out for reference but is superseded by runWithConcurrency.
        /*
        const promises = this.experts.map((expert, i) => {
           const expertName = expert.getName();
           logger.debug(`Processing in parallel with expert: ${expertName}`, { traceId: context.traceId });
           const expertSpecificParams = options.expertParameters?.[expertName];
           return this.processWithExpert(
             expert,
             input,
             context,
             trace,
             `expert-${i + 1}-${expertName}`,
             options,
             expertSpecificParams
           );
         });
        const results = await Promise.allSettled(promises);
        */

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
        metadata: {
          processingStatus: "success",
          // Add summary of final output structure
          finalOutputKeys: finalOutput && typeof finalOutput === 'object' ? Object.keys(finalOutput) : undefined,
          intermediateResultsCount: intermediateResults.length,
        }
      });

      // Extract token usage from the experts if available
      let tokenUsage: TokenUsage | undefined = undefined;
      
      // Try to extract token usage from the final expert's output
      if (finalOutput && typeof finalOutput === 'object' && finalOutput.tokenUsage) {
        tokenUsage = finalOutput.tokenUsage as TokenUsage;
      }
      // If not found in final output, check if any expert's output has token usage
      else if (intermediateResults && intermediateResults.length > 0) {
        for (const result of intermediateResults) {
          if (result.output && typeof result.output === 'object' && result.output.tokenUsage) {
            tokenUsage = result.output.tokenUsage as TokenUsage;
            break;
          }
        }
      }
      
      return {
        result: finalOutput,
        intermediateResults, // Include intermediate results in the response
        success: true, // TODO: Adjust success based on parallel results if needed (e.g., fail if any expert fails)
        tokenUsage, // Include token usage in the response if available
      };
    } catch (error) { // This catches errors from sequential mode or aggregated errors from parallel if re-thrown
      // Log error (already done by logger.error) and update trace
      // console.error('Chain processing error:', error); // Redundant if logger is used
      trace.update({
        output: {
          error: "Chain processing failed",
          errorMessage: isChainError(error) ? error.message : (error instanceof Error ? error.message : "Unknown error"),
          errorType: error?.constructor?.name,
          isChainError: isChainError(error),
        },
        metadata: {
            processingStatus: "error",
            statusMessage: error instanceof Error ? error.message : "Unknown error in chain processing",
            // level: "ERROR", // Store level in metadata if needed, not a root property
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
    let processedInput = { ...input };
    let processedContextState = new Map(context.state); // Make a mutable copy

    // Apply expert-specific context filtering
    if (expert.getRequiredContextKeys) {
      const requiredKeys = expert.getRequiredContextKeys();
      logger.debug(`Expert ${expert.getName()} requires specific context keys.`, { requiredKeys, traceId: context.traceId });

      // Filter ChainInput properties
      if (requiredKeys.chainInput && requiredKeys.chainInput.length > 0) {
        const filteredChainInput: Partial<ChainInput> = { type: input.type }; // Always include type
        for (const key of requiredKeys.chainInput) {
          if (key in input) {
            (filteredChainInput as any)[key] = (input as any)[key];
          }
        }
        // Ensure expertOutput is included if specified, as it's a common pattern
        if (requiredKeys.chainInput.includes('expertOutput') && input.expertOutput) {
            filteredChainInput.expertOutput = input.expertOutput;
        }
        processedInput = filteredChainInput as ChainInput; // Cast, assuming expert knows what it needs
      } else if (requiredKeys.chainInput === undefined) {
        // If chainInput is not specified in requiredKeys, pass all by default (current behavior)
      } else { // chainInput is an empty array, meaning pass minimal (only type)
        processedInput = { type: input.type };
      }


      // Filter expertOutput from previous expert if it exists on the input
      if (requiredKeys.expertOutput && input.expertOutput) {
        const filteredExpertOutput: ExpertOutput = {};
        for (const key of requiredKeys.expertOutput) {
          if (key in input.expertOutput) {
            filteredExpertOutput[key] = input.expertOutput[key];
          }
        }
        processedInput.expertOutput = filteredExpertOutput;
      } else if (requiredKeys.expertOutput === undefined && input.expertOutput) {
        // If expertOutput is not specified in requiredKeys, pass all by default
        processedInput.expertOutput = input.expertOutput;
      } else if (requiredKeys.expertOutput && !input.expertOutput) {
        // If keys are required but no expertOutput is present, pass undefined
        processedInput.expertOutput = undefined;
      }


      // Filter ChainContext.state
      if (requiredKeys.state && requiredKeys.state.length > 0) {
        const filteredState = new Map<string, any>();
        for (const key of requiredKeys.state) {
          if (context.state.has(key)) {
            filteredState.set(key, context.state.get(key));
          }
        }
        processedContextState = filteredState;
      } else if (requiredKeys.state === undefined) {
        // If state is not specified, pass all by default
      } else { // state is an empty array, pass empty map
        processedContextState = new Map<string, any>();
      }
    }
    
    const contextForExpert: ChainContext = {
        ...context, // Spread other readonly properties like initialInput, userId, etc.
        state: processedContextState, // Use the potentially filtered state
    };

    // Apply expert-specific parameters if provided
    if (expertParameters && Object.keys(expertParameters).length > 0) {
      expert.setParameters(expertParameters);
      logger.debug(`Applied custom parameters to expert: ${expert.getName()}`, {
        parameters: expertParameters,
        traceId: context.traceId
      });
    }

    const expertNameForOptions = expert.getName(); // Renaming to avoid conflict with later expertName variable
    const expertSpecificOptions = options?.defaultExpertOptions; // TODO: Allow expert-specific overrides in ChainOptions
    const retryOptions = expertSpecificOptions?.retryOptions || { maxAttempts: 3, delayMs: 200, backoffFactor: 2 };
    const rateLimitOptions = expertSpecificOptions?.rateLimit;
    const circuitBreakerOptions = expertSpecificOptions?.circuitBreaker || { failureThreshold: 5, resetTimeoutMs: 30000 };

    // --- Circuit Breaker Check ---
    const circuitState = this.circuitBreakerStates.get(expertNameForOptions) || { failures: 0, openUntil: 0, lastAttempt: 0 };
    if (circuitState.openUntil > Date.now()) {
      logger.warn(`Circuit for ${expertNameForOptions} is open. Skipping execution.`, { openUntil: new Date(circuitState.openUntil).toISOString(), traceId: context.traceId });
      throw new ExpertError(`Circuit for ${expertNameForOptions} is open`, expertNameForOptions, { isCircuitBreakerError: true });
    }

    // --- Rate Limiter (Simple Token Bucket Conceptual Implementation) ---
    if (rateLimitOptions && rateLimitOptions.requestsPerInterval && rateLimitOptions.intervalMs) {
      const now = Date.now();
      let timestamps = this.rateLimitTimestamps.get(expertNameForOptions) || [];
      // Filter out timestamps older than the interval
      timestamps = timestamps.filter(ts => now - ts < rateLimitOptions.intervalMs!);
      
      if (timestamps.length >= rateLimitOptions.requestsPerInterval) {
        const timeToWait = (timestamps[0] + rateLimitOptions.intervalMs!) - now;
        logger.warn(`Rate limit for ${expertNameForOptions} reached. Waiting for ${timeToWait}ms.`, { traceId: context.traceId, requests: timestamps.length, limit: rateLimitOptions.requestsPerInterval });
        if (timeToWait > 0) {
          await new Promise(resolve => setTimeout(resolve, timeToWait));
        }
        timestamps = (this.rateLimitTimestamps.get(expertNameForOptions) || []).filter(ts => Date.now() - ts < rateLimitOptions.intervalMs!);
      }
      timestamps.push(Date.now());
      this.rateLimitTimestamps.set(expertNameForOptions, timestamps.slice(-rateLimitOptions.requestsPerInterval));
    }

    const { maxAttempts, delayMs: initialDelayMs, backoffFactor } = retryOptions;
    

    // Get cache manager instance with options from chain options
    let cacheManager: CacheManagerInstance;
    const cacheConfig = options?.cache;

    if (cacheConfig?.type === 'redis') {
      cacheManager = RedisCacheManager.getInstance(cacheConfig as RedisCacheOptions);
    } else {
      // Default to in-memory cache if type is 'memory', undefined, or options are not provided
      cacheManager = InMemoryCacheManager.getInstance(cacheConfig as InMemoryCacheOptions);
    }
    
    // Check if we should skip cache
    const skipCache = options?.skipCache === true;
    
    // Generate cache key
    // const expertName = expert.getName(); // Already defined as expertNameForOptions
    const currentExpertParams = expert.getParameters();
    // Use processedInput for cache key generation if filtering occurred, otherwise original input
    const cacheKeyInput = (expert.getRequiredContextKeys && expert.getRequiredContextKeys()?.chainInput) ? processedInput : input;
    const cacheKey = cacheManager.generateCacheKey(expertNameForOptions, cacheKeyInput, currentExpertParams); // Use expertNameForOptions
    
    // Check cache first if not skipping
    if (!skipCache && cacheManager) { // Ensure cacheManager is initialized
      const cachedOutput = await cacheManager.get(cacheKey); // Await for Redis
      if (cachedOutput) {
        logger.debug(`Using cached result for expert: ${expertNameForOptions}`, { // Use expertNameForOptions
          spanName,
          traceId: context.traceId,
          cacheKey
        });
        
        // Create a span for the cached result
        const cacheSpan = trace.span({
          name: `${spanName}-cached`,
          input: { // Log the input that would have gone to the expert (potentially filtered)
            type: processedInput.type,
            query: processedInput.query,
            dataKeys: processedInput.data ? Object.keys(processedInput.data) : undefined,
            expertOutputKeys: processedInput.expertOutput ? Object.keys(processedInput.expertOutput) : undefined,
          },
          metadata: {
            expertName: expertNameForOptions, // Use expertNameForOptions
            expertType: expert.getType(),
            cached: true,
            cacheKey,
            inputType: input.type,
            tags: [`expert:${expertNameForOptions}`, `expert-type:${expert.getType()}`, "cache-hit"], // Use expertNameForOptions
          },
        });
        
        // End span with cached output
        cacheSpan.score({
          name: 'cache-hit',
          value: 1, // 1 for hit, 0 for miss (can be added to the main span on miss)
          comment: 'Result was retrieved from cache.'
        });
        cacheSpan.end({
          output: cachedOutput,
          metadata: { fromCache: true }
        });
        
        return cachedOutput;
      }
    }

    let attempts = 0;
    let currentDelayMs = initialDelayMs!; // Assert non-null as it has a default
    let lastError: any = null;

    // Define initial metadata for the span
    const initialSpanMetadata = {
      expertName: expertNameForOptions, // Use expertNameForOptions
      expertType: expert.getType(),
      maxAttempts: retryOptions.maxAttempts ?? 3, // Ensure maxAttempts has a default
      cached: false,
      cacheKey,
      inputType: processedInput.type, // Reflect the input type being processed
      appliedExpertParameters: expertParameters && Object.keys(expertParameters).length > 0 ? expertParameters : undefined,
      currentExpertEffectiveParameters: currentExpertParams && Object.keys(currentExpertParams).length > 0 ? currentExpertParams : undefined,
      tags: [`expert:${expertNameForOptions}`, `expert-type:${expert.getType()}`, "cache-miss"], // Use expertNameForOptions
    };

    // Create a span for this expert's processing attempt(s)
    const span = trace.span({
      name: spanName,
      input: { // Log a summary of the input that is actually passed to the expert
        type: processedInput.type,
        query: processedInput.query,
        dataKeys: processedInput.data ? Object.keys(processedInput.data) : undefined,
        expertOutputKeys: processedInput.expertOutput ? Object.keys(processedInput.expertOutput) : undefined,
      },
      metadata: initialSpanMetadata,
    });

    while (attempts < (retryOptions.maxAttempts ?? 3)) { // Use default if undefined
      attempts++;
      try {
        logger.debug(`Executing expert process: ${expertNameForOptions} (Attempt ${attempts}/${retryOptions.maxAttempts ?? 3})`, { // Use expertNameForOptions
          spanName,
          traceId: context.traceId
        });
        
        const output = await expert.process(processedInput, contextForExpert, trace); // Use processed input and context
        
        // If successful, reset circuit breaker failures for this expert
        if (circuitState.failures > 0) {
            logger.info(`Expert ${expertNameForOptions} succeeded, resetting circuit breaker failures.`, { traceId: context.traceId, previousFailures: circuitState.failures }); // Use expertNameForOptions
            circuitState.failures = 0;
            circuitState.openUntil = 0; // Ensure circuit is closed
            this.circuitBreakerStates.set(expertNameForOptions, { ...circuitState });
        }
        
        logger.debug(`Expert process finished successfully: ${expertNameForOptions} (Attempt ${attempts})`, { // Use expertNameForOptions
          spanName,
          traceId: context.traceId
        });

        // Store result in cache if not skipping
        if (!skipCache && cacheManager) { // Ensure cacheManager is initialized
          await cacheManager.set(cacheKey, output); // Await for Redis
          logger.debug(`Cached result for expert: ${expertNameForOptions}`, { // Use expertNameForOptions
            spanName,
            traceId: context.traceId,
            cacheKey
          });
        }
 
        // Calculate and record scores if the expert implements it
        if (expert.calculateScores) {
          try {
            // Pass the current span and the overall trace to calculateScores
            await expert.calculateScores(output, span, trace);
            logger.debug(`Successfully calculated scores for expert: ${expertNameForOptions}`, { spanName, traceId: context.traceId }); // Use expertNameForOptions
          } catch (scoreError) {
            logger.warn(`Error calculating scores for expert ${expertNameForOptions}`, { spanName, traceId: context.traceId, error: scoreError instanceof Error ? scoreError.message : String(scoreError) }); // Use expertNameForOptions
            const metadataWithScoringError = {
              ...initialSpanMetadata,
              scoringError: scoreError instanceof Error ? scoreError.message : String(scoreError),
            };
            span.update({ metadata: metadataWithScoringError });
          }
        }

        // Asynchronous LLM-as-Judge Evaluation (fire and forget for now)
        // In a real scenario, you might want to manage these promises or use a queue
        // Also, decide if evaluation scores should be on the expert's span or a sub-observation.
        // For now, scores from evaluators will be on the expert's main span.
        const evaluationInput: EvaluationInput = {
          expertName: expertNameForOptions, // Use expertNameForOptions
          expertType: expert.getType(),
          expertParameters: currentExpertParams, // Effective parameters used by the expert
          chainInput: processedInput, // Input that was actually sent to the expert
          expertOutput: output,
          chainContext: contextForExpert, // Context that was actually sent to the expert
        };

        // Example: Run RelevanceEvaluator
        const relevanceEvaluator = new RelevanceEvaluator();
        relevanceEvaluator.evaluate(evaluationInput, span)
          .then(evalOutput => {
            logger.debug(`Relevance evaluation complete for ${expertNameForOptions}. Scores: ${JSON.stringify(evalOutput.scores)}`, { traceId: context.traceId }); // Use expertNameForOptions
            // Scores are already recorded on `span` by the evaluator's `evaluate` or `recordScores` method.
            // If evaluator directly scores the span, no further action here.
            // If it returns scores to be applied here:
            // evalOutput.scores.forEach(s => span.score({ name: s.name, value: s.value, comment: s.comment }));
          })
          .catch(evalError => {
            logger.error(`Error during relevance evaluation for ${expertNameForOptions}`, evalError as Error, { traceId: context.traceId }); // Use expertNameForOptions and cast evalError
            span.update({ metadata: { ...initialSpanMetadata, evaluationError: `RelevanceEvaluator: ${(evalError as Error).message}` } });
          });
        
        // End span successfully
        // Add a cache-miss score to the main span if it wasn't a cache hit
        // The 'cached' property in initialSpanMetadata is already false for this path.
        span.score({
            name: 'cache-hit',
            value: 0,
            comment: 'Result was processed (cache miss or cache skipped).'
        });
        span.end({
          output,
          metadata: {
            ...initialSpanMetadata, // This already contains cached: false
            attempts,
            processingStatus: "success",
            tags: initialSpanMetadata.tags,
            circuitStatus: 'closed',
          }
        });
        
        return output; // Success, exit loop and return output
      } catch (error) {
        lastError = error;
        circuitState.failures++;
        circuitState.lastAttempt = Date.now();
        logger.warn(`Expert process attempt ${attempts} failed: ${expertNameForOptions}`, { spanName, traceId: context.traceId, error: error instanceof Error ? error.message : String(error), failures: circuitState.failures }); // Use expertNameForOptions

        if (circuitState.failures >= (circuitBreakerOptions.failureThreshold ?? 5)) { // Use default if undefined
          circuitState.openUntil = Date.now() + (circuitBreakerOptions.resetTimeoutMs ?? 30000); // Use default if undefined
          logger.error(`Circuit for ${expertNameForOptions} is now open for ${circuitBreakerOptions.resetTimeoutMs ?? 30000}ms due to ${circuitState.failures} failures.`, error instanceof Error ? error : new Error(String(error)), { traceId: context.traceId }); // Use expertNameForOptions
        }
        this.circuitBreakerStates.set(expertNameForOptions, { ...circuitState });


        // Check if it's the last attempt
        if (attempts >= (retryOptions.maxAttempts ?? 3)) { // Use default if undefined
          logger.error(`Expert process failed after ${retryOptions.maxAttempts ?? 3} attempts: ${expertNameForOptions}`, lastError instanceof Error ? lastError : new Error(String(lastError)), { spanName, traceId: context.traceId }); // Use expertNameForOptions
          // End span with error after final attempt
          span.end({
            level: "ERROR",
            statusMessage: error instanceof Error ? error.message : "Expert processing failed after retries",
            output: {
              error: "Expert processing failed after retries",
              message: error instanceof Error ? error.message : "Unknown error",
              attempts,
            },
            metadata: {
              ...initialSpanMetadata, // Start with initial metadata
              tags: initialSpanMetadata.tags.concat(["error"]), // Add "error" tag
              cached: false, // This was a cache miss path
              attempts,
              processingStatus: "error"
            }
          });
          // Re-throw as a specific ExpertError
          throw new ExpertError(
            error instanceof Error ? error.message : "Unknown error during expert processing",
            expertNameForOptions, // Use expertNameForOptions
            { originalError: error, attempts, isCircuitBreakerError: circuitState.openUntil > Date.now() }
          );
        }

        // Retry if the circuit is not open
        const isRetriable = circuitState.openUntil <= Date.now();

        if (!isRetriable) {
           logger.error(`Non-retriable error (circuit open) for expert ${expertNameForOptions}`, lastError instanceof Error ? lastError : new Error(String(lastError)), { spanName, traceId: context.traceId }); // Use expertNameForOptions
           span.end({
             level: "ERROR",
             statusMessage: "Non-retriable error or circuit open",
             output: { error: "Non-retriable error or circuit open", message: error instanceof Error ? error.message : "Unknown error" },
             metadata: {
              ...initialSpanMetadata,
              tags: initialSpanMetadata.tags.concat(["non-retriable-error", "circuit-open"]),
              cached: false,
              attempts,
              processingStatus: "error",
              circuitStatus: 'open',
             }
            });
           throw new ExpertError(error instanceof Error ? error.message : "Non-retriable error (circuit open)", expertNameForOptions, { originalError: error, isCircuitBreakerError: true }); // Use expertNameForOptions
        }
        
        // Wait before retrying
        logger.info(`Retrying expert ${expertNameForOptions} in ${currentDelayMs}ms... (Attempt ${attempts + 1}/${retryOptions.maxAttempts ?? 3})`, { spanName, traceId: context.traceId }); // Use expertNameForOptions
        await new Promise(resolve => setTimeout(resolve, currentDelayMs));

        // Increase delay for next attempt (exponential backoff)
        currentDelayMs *= (retryOptions.backoffFactor ?? 2); // Use default if undefined
      }
    }

    // This part should theoretically not be reached due to the throw in the loop,
    // but included for completeness and type safety.
    logger.error(`Expert process loop completed without success or final error throw: ${expertNameForOptions}`, undefined, { spanName, traceId: context.traceId }); // Use expertNameForOptions
    span.end({
      level: "ERROR",
      statusMessage: "Expert processing failed unexpectedly after loop",
      output: { error: "Unexpected loop exit" },
      metadata: {
        ...initialSpanMetadata,
        tags: initialSpanMetadata.tags.concat(["unexpected-error"]),
        cached: false, // This was a cache miss path
        attempts: attempts,
        processingStatus: "error",
        circuitStatus: circuitState.openUntil > Date.now() ? 'open' : 'closed',
      }
    });
    throw new ExpertError("Expert processing failed unexpectedly after retries", expertNameForOptions, { originalError: lastError, attempts, isCircuitBreakerError: circuitState.openUntil > Date.now() }); // Use expertNameForOptions
  }
}