import { LLMProvider, LLMProviderConfig } from './types';
import { OpenAIProvider } from './openai';
import { GeminiProvider } from './gemini';
import { logger } from '../utils/logger';

/**
 * Factory for creating LLM providers
 */
export class LLMProviderFactory {
  private static instance: LLMProviderFactory;
  private providers: Map<string, LLMProvider> = new Map();
  private defaultProvider: string = 'openai';

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get the singleton instance of the factory
   */
  public static getInstance(): LLMProviderFactory {
    if (!LLMProviderFactory.instance) {
      LLMProviderFactory.instance = new LLMProviderFactory();
    }
    return LLMProviderFactory.instance;
  }

  /**
   * Register a provider with the factory
   * @param config The provider configuration
   * @returns The registered provider
   */
  public registerProvider(config: LLMProviderConfig): LLMProvider {
    const providerName = config.provider.toLowerCase();
    
    // Check if provider already exists
    if (this.providers.has(providerName)) {
      logger.info(`Provider ${providerName} already registered, returning existing instance`);
      return this.providers.get(providerName)!;
    }
    
    // Create the provider based on the type
    let provider: LLMProvider;
    
    switch (providerName) {
      case 'openai':
        provider = new OpenAIProvider(config);
        break;
      case 'gemini':
        provider = new GeminiProvider(config);
        break;
      default:
        logger.error(`Unknown provider type: ${providerName}`);
        throw new Error(`Unknown provider type: ${providerName}`);
    }
    
    // Register the provider
    this.providers.set(providerName, provider);
    logger.info(`Registered provider: ${providerName}`);
    
    return provider;
  }

  /**
   * Get a provider by name
   * @param name The name of the provider
   * @returns The provider, or undefined if not found
   */
  public getProvider(name?: string): LLMProvider | undefined {
    const providerName = (name || this.defaultProvider).toLowerCase();
    return this.providers.get(providerName);
  }

  /**
   * Set the default provider
   * @param name The name of the provider
   */
  public setDefaultProvider(name: string): void {
    if (!this.providers.has(name.toLowerCase())) {
      logger.warn(`Provider ${name} not registered, cannot set as default`);
      return;
    }
    
    this.defaultProvider = name.toLowerCase();
    logger.info(`Set default provider to: ${this.defaultProvider}`);
  }

  /**
   * Get all registered providers
   * @returns Array of provider names
   */
  public getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Get the default provider name
   * @returns The default provider name
   */
  public getDefaultProviderName(): string {
    return this.defaultProvider;
  }

  /**
   * Initialize providers from configuration
   * @param configs Array of provider configurations
   */
  public initializeProviders(configs: LLMProviderConfig[]): void {
    for (const config of configs) {
      this.registerProvider(config);
    }
    
    // Set the first provider as default if none is registered
    if (this.providers.size > 0 && !this.providers.has(this.defaultProvider)) {
      this.defaultProvider = Array.from(this.providers.keys())[0];
      logger.info(`Set default provider to first registered provider: ${this.defaultProvider}`);
    }
  }
}

/**
 * Get the LLM provider factory instance
 * @returns The LLM provider factory
 */
export function getLLMProviderFactory(): LLMProviderFactory {
  return LLMProviderFactory.getInstance();
}