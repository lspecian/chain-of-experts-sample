# Multi-Provider LLM Support

This document explains how to configure and use multiple LLM providers in the Chain of Experts system.

## Overview

The system now supports multiple LLM providers (OpenAI, Google Gemini, etc.) with a flexible abstraction layer that allows:

- Configuring different providers for different experts
- Implementing provider selection strategies (fallback, cost-based, quality-based)
- Setting per-expert LLM configurations
- Tracking provider-specific metrics

## Configuration

### Environment Variables

You can configure LLM providers using environment variables in your `.env` file:

```bash
# API Keys
OPENAI_API_KEY=your_openai_api_key_here
GOOGLE_API_KEY=your_google_api_key_here

# Default LLM Configuration
OPENAI_MODEL=gpt-4o
GEMINI_MODEL=gemini-1.5-pro
DEFAULT_LLM_PROVIDER=openai
DEFAULT_LLM_STRATEGY=fallback-default

# Per-Expert LLM Configuration
SUMMARIZATION_PROVIDER=openai
SUMMARIZATION_MODEL=gpt-4o
SUMMARIZATION_STRATEGY=fallback-default

QUERY_REFORMULATION_PROVIDER=openai
QUERY_REFORMULATION_MODEL=gpt-4o
QUERY_REFORMULATION_STRATEGY=quality-based

FACT_CHECKING_PROVIDER=gemini
FACT_CHECKING_MODEL=gemini-1.5-pro
FACT_CHECKING_STRATEGY=quality-based

RESPONSE_FORMATTING_PROVIDER=
RESPONSE_FORMATTING_MODEL=
RESPONSE_FORMATTING_STRATEGY=cost-based
```

### Provider Selection Strategies

The system supports several provider selection strategies:

1. **Default Strategy (`default`)**: Uses the preferred provider if specified, otherwise uses the first available provider.

2. **Fallback Strategy (`fallback-default`)**: Tries the primary provider first, then falls back to other providers if the primary fails.

3. **Cost-Based Strategy (`cost-based`)**: Selects the cheapest provider that meets the requirements.

4. **Quality-Based Strategy (`quality-based`)**: Selects the highest quality provider for the specific task.

## Adding a New Provider

To add a new LLM provider to the system:

1. Create a new provider implementation file in `src/llm/` (e.g., `anthropic.ts`)
2. Implement the `LLMProvider` interface
3. Update the factory to register the new provider
4. Add the provider to the configuration

Example provider implementation:

```typescript
import { LLMProvider, LLMCompletionRequest, LLMCompletionResponse, LLMEmbeddingRequest, LLMEmbeddingResponse, LLMProviderConfig } from './types';
import { logger } from '../utils/logger';

export class NewProvider implements LLMProvider {
  private client: any;
  private config: LLMProviderConfig;
  private availableModels: string[] = ['model-1', 'model-2'];
  private defaultModel = 'model-1';

  constructor(config: LLMProviderConfig) {
    this.config = config;
    // Initialize client
    this.client = new SomeClient({
      apiKey: config.apiKey || process.env.NEW_PROVIDER_API_KEY
    });
    
    logger.info(`Initialized NewProvider with model: ${this.getDefaultModel()}`);
  }

  getName(): string {
    return 'new-provider';
  }

  getAvailableModels(): string[] {
    return this.availableModels;
  }

  getDefaultModel(): string {
    return this.config.model || this.defaultModel;
  }

  async createCompletion(request: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    // Implement completion logic
  }

  async createEmbedding(request: LLMEmbeddingRequest): Promise<LLMEmbeddingResponse> {
    // Implement embedding logic
  }
}
```

Then update the factory:

```typescript
// In src/llm/factory.ts
import { NewProvider } from './new-provider';

// In the registerProvider method
switch (providerName) {
  case 'openai':
    provider = new OpenAIProvider(config);
    break;
  case 'gemini':
    provider = new GeminiProvider(config);
    break;
  case 'new-provider':
    provider = new NewProvider(config);
    break;
  default:
    logger.error(`Unknown provider type: ${providerName}`);
    throw new Error(`Unknown provider type: ${providerName}`);
}
```

## Using in Experts

Experts can now use the provider selection strategies to choose the appropriate LLM provider:

```typescript
// Create a provider selection context
const selectionContext: ProviderSelectionContext = {
  expertName: this.name,
  taskType: 'summarization',
  priority: 'quality',
  preferredProvider: 'openai',
  preferredModel: 'gpt-4o'
};

// Select provider using the specified strategy
const llmProvider = await selectProvider('fallback-default', selectionContext);

// Use the provider
const response = await llmProvider.createCompletion(request);
```

## Provider Comparison

| Provider | Strengths | Weaknesses | Best For |
|----------|-----------|------------|----------|
| OpenAI   | High quality, extensive capabilities | Higher cost | Complex reasoning, summarization |
| Gemini   | Cost-effective, good factual knowledge | Less consistent | Fact-checking, embeddings |

## Cost Considerations

Different providers have different pricing models:

- OpenAI GPT-4o: ~$0.03 per 1K tokens
- OpenAI GPT-3.5-Turbo: ~$0.01 per 1K tokens
- Gemini 1.5 Pro: ~$0.0035 per 1K tokens
- Gemini 1.5 Flash: ~$0.0025 per 1K tokens

The cost-based strategy automatically selects the most cost-effective provider for the task.

## Monitoring and Analytics

The system tracks provider-specific metrics in Langfuse:

- Provider name
- Model used
- Token usage
- Estimated cost
- Fallback usage
- Selection strategy

You can view these metrics in the Langfuse dashboard to analyze provider performance and cost.