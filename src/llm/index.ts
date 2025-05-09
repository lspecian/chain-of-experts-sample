/**
 * LLM provider module exports
 */

// Export types
export * from './types';

// Export providers
export { OpenAIProvider } from './openai';
export { GeminiProvider } from './gemini';

// Export factory
export { getLLMProviderFactory, LLMProviderFactory } from './factory';

// Export provider selection strategies
export {
  ProviderSelectionStrategy,
  ProviderSelectionContext,
  DefaultProviderStrategy,
  FallbackProviderStrategy,
  CostBasedProviderStrategy,
  QualityBasedProviderStrategy,
  ProviderStrategyFactory,
  getProviderStrategyFactory,
  selectProvider
} from './providerStrategy';

// Convenience function to get a provider
import { getLLMProviderFactory } from './factory';
import { LLMProvider, LLMProviderConfig } from './types';

/**
 * Get or create an LLM provider
 * @param nameOrConfig Provider name or configuration
 * @returns The LLM provider
 */
export function getLLMProvider(nameOrConfig?: string | LLMProviderConfig): LLMProvider {
  const factory = getLLMProviderFactory();
  
  if (!nameOrConfig) {
    // Get the default provider
    const provider = factory.getProvider();
    if (!provider) {
      throw new Error('No default LLM provider registered');
    }
    return provider;
  }
  
  if (typeof nameOrConfig === 'string') {
    // Get provider by name
    const provider = factory.getProvider(nameOrConfig);
    if (!provider) {
      throw new Error(`LLM provider not found: ${nameOrConfig}`);
    }
    return provider;
  } else {
    // Register and get provider by config
    return factory.registerProvider(nameOrConfig);
  }
}