import { LLMProvider, LLMProviderConfig } from './types';
import { getLLMProviderFactory } from './factory';
import { logger } from '../utils/logger';

/**
 * Interface for provider selection strategies
 */
export interface ProviderSelectionStrategy {
  /**
   * Select a provider based on the strategy
   * @param providers Available providers
   * @param context Context for selection (e.g., expert name, task type)
   * @returns The selected provider
   */
  selectProvider(providers: LLMProvider[], context?: ProviderSelectionContext): Promise<LLMProvider>;
  
  /**
   * Get the name of the strategy
   */
  getName(): string;
}

/**
 * Context for provider selection
 */
export interface ProviderSelectionContext {
  expertName?: string;
  taskType?: string;
  priority?: 'speed' | 'quality' | 'cost' | 'balanced';
  maxCost?: number;
  requiredCapabilities?: string[];
  preferredProvider?: string;
  preferredModel?: string;
  [key: string]: any;
}

/**
 * Default strategy that uses the preferred provider or the first available
 */
export class DefaultProviderStrategy implements ProviderSelectionStrategy {
  getName(): string {
    return 'default';
  }
  
  async selectProvider(providers: LLMProvider[], context?: ProviderSelectionContext): Promise<LLMProvider> {
    if (!providers || providers.length === 0) {
      throw new Error('No providers available for selection');
    }
    
    // If preferred provider is specified, try to use it
    if (context?.preferredProvider) {
      const preferred = providers.find(p => p.getName().toLowerCase() === context.preferredProvider?.toLowerCase());
      if (preferred) {
        logger.info(`DefaultProviderStrategy: Selected preferred provider: ${preferred.getName()}`);
        return preferred;
      }
      logger.warn(`DefaultProviderStrategy: Preferred provider ${context.preferredProvider} not found, using first available`);
    }
    
    // Otherwise, use the first provider
    logger.info(`DefaultProviderStrategy: Selected first available provider: ${providers[0].getName()}`);
    return providers[0];
  }
}

/**
 * Fallback strategy that tries providers in order until one succeeds
 */
export class FallbackProviderStrategy implements ProviderSelectionStrategy {
  private primaryStrategy: ProviderSelectionStrategy;
  
  constructor(primaryStrategy?: ProviderSelectionStrategy) {
    this.primaryStrategy = primaryStrategy || new DefaultProviderStrategy();
  }
  
  getName(): string {
    return `fallback-${this.primaryStrategy.getName()}`;
  }
  
  async selectProvider(providers: LLMProvider[], context?: ProviderSelectionContext): Promise<LLMProvider> {
    if (!providers || providers.length === 0) {
      throw new Error('No providers available for selection');
    }
    
    // Create a wrapper that tries each provider in order
    const fallbackProvider: LLMProvider = {
      getName: () => `fallback-provider`,
      
      getAvailableModels: () => {
        // Combine models from all providers
        const allModels = new Set<string>();
        providers.forEach(p => p.getAvailableModels().forEach(m => allModels.add(m)));
        return Array.from(allModels);
      },
      
      getDefaultModel: () => {
        // Try to get primary provider first
        try {
          const primary = this.primaryStrategy.selectProvider(providers, context);
          return (primary as any).getDefaultModel();
        } catch (e) {
          // If primary selection fails, use the first provider's default model
          return providers[0].getDefaultModel();
        }
      },
      
      createCompletion: async (request) => {
        // Try each provider in order
        let lastError: any;
        
        // First try the primary provider based on the strategy
        try {
          const primaryProvider = await this.primaryStrategy.selectProvider(providers, context);
          logger.info(`FallbackProviderStrategy: Trying primary provider: ${primaryProvider.getName()}`);
          return await primaryProvider.createCompletion(request);
        } catch (error) {
          lastError = error;
          logger.warn(`FallbackProviderStrategy: Primary provider failed, trying fallbacks`, error instanceof Error ? error : undefined);
        }
        
        // If primary fails, try each remaining provider
        for (const provider of providers) {
          try {
            logger.info(`FallbackProviderStrategy: Trying fallback provider: ${provider.getName()}`);
            return await provider.createCompletion(request);
          } catch (error) {
            lastError = error;
            logger.warn(`FallbackProviderStrategy: Provider ${provider.getName()} failed`, error instanceof Error ? error : undefined);
          }
        }
        
        // If all providers fail, throw the last error
        throw lastError || new Error('All providers failed');
      },
      
      createEmbedding: async (request) => {
        // Try each provider in order
        let lastError: any;
        
        // First try the primary provider based on the strategy
        try {
          const primaryProvider = await this.primaryStrategy.selectProvider(providers, context);
          logger.info(`FallbackProviderStrategy: Trying primary provider: ${primaryProvider.getName()}`);
          return await primaryProvider.createEmbedding(request);
        } catch (error) {
          lastError = error;
          logger.warn(`FallbackProviderStrategy: Primary provider failed, trying fallbacks`, error instanceof Error ? error : undefined);
        }
        
        // If primary fails, try each remaining provider
        for (const provider of providers) {
          try {
            logger.info(`FallbackProviderStrategy: Trying fallback provider: ${provider.getName()}`);
            return await provider.createEmbedding(request);
          } catch (error) {
            lastError = error;
            logger.warn(`FallbackProviderStrategy: Provider ${provider.getName()} failed`, error instanceof Error ? error : undefined);
          }
        }
        
        // If all providers fail, throw the last error
        throw lastError || new Error('All providers failed');
      }
    };
    
    return fallbackProvider;
  }
}

/**
 * Cost-based strategy that selects the cheapest provider that meets requirements
 */
export class CostBasedProviderStrategy implements ProviderSelectionStrategy {
  // Provider cost estimates (per 1K tokens)
  private providerCosts: Record<string, number> = {
    'openai': 0.01,    // Example cost for gpt-3.5-turbo
    'gemini': 0.0035,  // Example cost for gemini-1.5-pro
    // Add more providers as needed
  };
  
  // Model-specific costs that override provider defaults
  private modelCosts: Record<string, number> = {
    'gpt-4o': 0.03,
    'gpt-4-turbo': 0.03,
    'gpt-4': 0.06,
    'gpt-3.5-turbo': 0.01,
    'gemini-1.5-pro': 0.0035,
    'gemini-1.5-flash': 0.0025,
    // Add more models as needed
  };
  
  getName(): string {
    return 'cost-based';
  }
  
  async selectProvider(providers: LLMProvider[], context?: ProviderSelectionContext): Promise<LLMProvider> {
    if (!providers || providers.length === 0) {
      throw new Error('No providers available for selection');
    }
    
    // If preferred provider is specified and max cost is not a concern, try to use it
    if (context?.preferredProvider && !context?.maxCost) {
      const preferred = providers.find(p => p.getName().toLowerCase() === context.preferredProvider?.toLowerCase());
      if (preferred) {
        logger.info(`CostBasedProviderStrategy: Selected preferred provider: ${preferred.getName()}`);
        return preferred;
      }
    }
    
    // Calculate estimated cost for each provider
    const providerCosts = providers.map(provider => {
      const providerName = provider.getName();
      const modelName = context?.preferredModel || provider.getDefaultModel();
      
      // Get cost from model-specific cost if available, otherwise use provider default
      const cost = this.modelCosts[modelName] || this.providerCosts[providerName] || 0.05; // Default to high cost if unknown
      
      return {
        provider,
        cost,
        modelName
      };
    });
    
    // Sort by cost (ascending)
    providerCosts.sort((a, b) => a.cost - b.cost);
    
    // Filter by max cost if specified
    const affordableProviders = context?.maxCost 
      ? providerCosts.filter(p => p.cost <= context.maxCost!)
      : providerCosts;
    
    if (affordableProviders.length === 0) {
      logger.warn(`CostBasedProviderStrategy: No providers found within max cost ${context?.maxCost}`);
      // Fall back to the cheapest provider
      logger.info(`CostBasedProviderStrategy: Selected cheapest provider: ${providerCosts[0].provider.getName()} (${providerCosts[0].cost})`);
      return providerCosts[0].provider;
    }
    
    logger.info(`CostBasedProviderStrategy: Selected provider: ${affordableProviders[0].provider.getName()} (${affordableProviders[0].cost})`);
    return affordableProviders[0].provider;
  }
}

/**
 * Quality-based strategy that selects the highest quality provider for the task
 */
export class QualityBasedProviderStrategy implements ProviderSelectionStrategy {
  // Provider quality ratings (0-10)
  private providerQuality: Record<string, number> = {
    'openai': 9,    // Example quality rating
    'gemini': 8,    // Example quality rating
    // Add more providers as needed
  };
  
  // Model-specific quality ratings that override provider defaults
  private modelQuality: Record<string, number> = {
    'gpt-4o': 9.5,
    'gpt-4-turbo': 9.2,
    'gpt-4': 9.0,
    'gpt-3.5-turbo': 7.5,
    'gemini-1.5-pro': 8.5,
    'gemini-1.5-flash': 7.0,
    // Add more models as needed
  };
  
  // Task-specific provider preferences
  private taskProviderPreferences: Record<string, string[]> = {
    'summarization': ['openai', 'gemini'],
    'query-reformulation': ['openai', 'gemini'],
    'fact-checking': ['gemini', 'openai'],
    // Add more task types as needed
  };
  
  getName(): string {
    return 'quality-based';
  }
  
  async selectProvider(providers: LLMProvider[], context?: ProviderSelectionContext): Promise<LLMProvider> {
    if (!providers || providers.length === 0) {
      throw new Error('No providers available for selection');
    }
    
    // If preferred provider is specified, try to use it
    if (context?.preferredProvider) {
      const preferred = providers.find(p => p.getName().toLowerCase() === context.preferredProvider?.toLowerCase());
      if (preferred) {
        logger.info(`QualityBasedProviderStrategy: Selected preferred provider: ${preferred.getName()}`);
        return preferred;
      }
    }
    
    // Get task-specific provider preferences
    const taskPreferences = context?.taskType ? this.taskProviderPreferences[context.taskType] : null;
    
    // Calculate quality score for each provider
    const providerScores = providers.map(provider => {
      const providerName = provider.getName();
      const modelName = context?.preferredModel || provider.getDefaultModel();
      
      // Get quality from model-specific rating if available, otherwise use provider default
      let quality = this.modelQuality[modelName] || this.providerQuality[providerName] || 5; // Default to medium quality if unknown
      
      // Boost score if this provider is preferred for the task type
      if (taskPreferences && taskPreferences.includes(providerName)) {
        const preferenceIndex = taskPreferences.indexOf(providerName);
        quality += (taskPreferences.length - preferenceIndex) * 0.5; // Boost based on preference order
      }
      
      return {
        provider,
        quality,
        modelName
      };
    });
    
    // Sort by quality (descending)
    providerScores.sort((a, b) => b.quality - a.quality);
    
    logger.info(`QualityBasedProviderStrategy: Selected highest quality provider: ${providerScores[0].provider.getName()} (${providerScores[0].quality})`);
    return providerScores[0].provider;
  }
}

/**
 * Factory for creating provider selection strategies
 */
export class ProviderStrategyFactory {
  private static instance: ProviderStrategyFactory;
  private strategies: Map<string, ProviderSelectionStrategy> = new Map();
  
  private constructor() {
    // Register default strategies
    this.registerStrategy(new DefaultProviderStrategy());
    this.registerStrategy(new FallbackProviderStrategy());
    this.registerStrategy(new CostBasedProviderStrategy());
    this.registerStrategy(new QualityBasedProviderStrategy());
  }
  
  /**
   * Get the singleton instance of the factory
   */
  public static getInstance(): ProviderStrategyFactory {
    if (!ProviderStrategyFactory.instance) {
      ProviderStrategyFactory.instance = new ProviderStrategyFactory();
    }
    return ProviderStrategyFactory.instance;
  }
  
  /**
   * Register a strategy with the factory
   * @param strategy The strategy to register
   */
  public registerStrategy(strategy: ProviderSelectionStrategy): void {
    this.strategies.set(strategy.getName(), strategy);
    logger.info(`Registered provider selection strategy: ${strategy.getName()}`);
  }
  
  /**
   * Get a strategy by name
   * @param name The name of the strategy
   * @returns The strategy, or undefined if not found
   */
  public getStrategy(name?: string): ProviderSelectionStrategy {
    if (!name) {
      return this.strategies.get('default')!;
    }
    
    const strategy = this.strategies.get(name);
    if (!strategy) {
      logger.warn(`Strategy ${name} not found, using default`);
      return this.strategies.get('default')!;
    }
    
    return strategy;
  }
  
  /**
   * Get all registered strategies
   * @returns Array of strategy names
   */
  public getRegisteredStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
}

/**
 * Get the provider strategy factory instance
 * @returns The provider strategy factory
 */
export function getProviderStrategyFactory(): ProviderStrategyFactory {
  return ProviderStrategyFactory.getInstance();
}

/**
 * Select a provider using the specified strategy
 * @param strategyName The name of the strategy to use
 * @param context Context for selection
 * @returns The selected provider
 */
export async function selectProvider(strategyName?: string, context?: ProviderSelectionContext): Promise<LLMProvider> {
  const factory = getLLMProviderFactory();
  const strategyFactory = getProviderStrategyFactory();
  
  // Get all registered providers
  const providerNames = factory.getRegisteredProviders();
  const providers = providerNames.map(name => factory.getProvider(name)!);
  
  // Get the strategy
  const strategy = strategyFactory.getStrategy(strategyName);
  
  // Select provider using the strategy
  return strategy.selectProvider(providers, context);
}