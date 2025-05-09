import {
  LLMProvider,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMEmbeddingRequest,
  LLMEmbeddingResponse
} from './types';
import { logger } from '../utils/logger';

interface QueuedRequest {
  request: LLMCompletionRequest;
  resolve: (response: LLMCompletionResponse) => void;
  reject: (error: any) => void;
  timestamp: number;
}

export interface RequestBatcherOptions {
  batchSize?: number; // Max number of requests in a batch
  batchTimeoutMs?: number; // Max time to wait before processing a batch
}

const DEFAULT_BATCHER_OPTIONS: Required<RequestBatcherOptions> = {
  batchSize: 10,
  batchTimeoutMs: 100, // Process batch quickly if not full
};

export class RequestBatcher implements LLMProvider { // Implement LLMProvider
  private provider: LLMProvider;
  private queue: QueuedRequest[] = [];
  private options: Required<RequestBatcherOptions>;
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(provider: LLMProvider, options?: RequestBatcherOptions) {
    this.provider = provider;
    this.options = { ...DEFAULT_BATCHER_OPTIONS, ...options };
    logger.info('RequestBatcher initialized', { provider: provider.getName(), options: this.options });
  }

  public async createCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    return new Promise<LLMCompletionResponse>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        request,
        resolve,
        reject,
        timestamp: Date.now(),
      };
      this.queue.push(queuedRequest);
      logger.debug('Request added to batcher queue', { queueSize: this.queue.length, model: request.model });

      if (this.queue.length >= this.options.batchSize) {
        logger.info('Batch size reached, processing queue.', { batchSize: this.options.batchSize });
        this.processQueue();
      } else if (!this.timeoutId) {
        this.timeoutId = setTimeout(() => {
          logger.info('Batch timeout reached, processing queue.', { timeout: this.options.batchTimeoutMs });
          this.processQueue();
        }, this.options.batchTimeoutMs);
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    if (this.queue.length === 0) {
      return;
    }

    const batchToProcess = [...this.queue];
    this.queue = []; // Clear queue for new incoming requests

    logger.info(`Processing batch of ${batchToProcess.length} requests. Provider: ${this.provider.getName()}`);

    // Process requests. For OpenAI chat completions, true API batching isn't available.
    // We process them concurrently client-side.
    // This relies on the underlying HTTP client (in OpenAI's library) and the API server
    // being able to handle concurrent requests. Rate limits are a concern here.
    const processingPromises = batchToProcess.map(async (queuedRequest) => {
      try {
        const response = await this.provider.createCompletion(queuedRequest.request);
        queuedRequest.resolve(response);
      } catch (error) {
        logger.error('Error processing request in batch', error instanceof Error ? error : undefined, { model: queuedRequest.request.model });
        queuedRequest.reject(error);
      }
    });

    await Promise.allSettled(processingPromises);
    logger.info(`Finished processing batch of ${batchToProcess.length} requests.`);
  }

  public getQueueSize(): number {
    return this.queue.length;
  }

  // Call this to ensure any pending requests are flushed, e.g., on application shutdown
  public async flush(): Promise<void> {
    logger.info('Flushing request batcher queue.', { queueSize: this.queue.length });
    await this.processQueue();
  }

  // Implement other LLMProvider methods by delegating to the wrapped provider
  public getName(): string {
    return `${this.provider.getName()}-batched`;
  }

  public getAvailableModels(): string[] {
    return this.provider.getAvailableModels();
  }

  public getDefaultModel(): string {
    return this.provider.getDefaultModel();
  }

  // Embedding requests are often already batch-friendly at the API level,
  // so we might not need to batch them further here, or could implement a separate batcher if beneficial.
  // For now, delegate directly.
  public async createEmbedding(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResponse> {
    logger.debug('RequestBatcher: Delegating createEmbedding call', { model: request.model });
    return this.provider.createEmbedding(request);
  }
}