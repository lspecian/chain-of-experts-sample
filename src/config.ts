import { logger } from './utils/logger';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

import { LLMProviderConfig, ExpertLLMConfig, ExtendedLLMConfig } from './llm/types';

// --- Configuration Interface ---
interface AppConfig {
  server: {
    port: number;
  };
  langfuse: {
    secretKey: string;
    publicKey: string;
    baseUrl: string;
  };
  llm: ExtendedLLMConfig;
  // Legacy config - will be deprecated
  openai: {
    apiKey: string;
  };
}

// --- Environment/Secret Loading ---

// Function to get secret from AWS Secrets Manager
async function getSecretFromAWS(secretName: string): Promise<string | undefined> {
  // Only attempt if running in AWS environment (e.g., check AWS_REGION)
  if (!process.env.AWS_REGION) {
    logger.debug(`AWS Region not set, skipping Secrets Manager fetch for ${secretName}`);
    return undefined;
  }
  
  // Use default credential provider chain (environment vars, shared config, EC2/ECS role)
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION }); 
  const command = new GetSecretValueCommand({ SecretId: secretName });

  try {
    logger.debug(`Attempting to fetch secret: ${secretName} from AWS Secrets Manager`);
    const response = await client.send(command);
    if (response.SecretString) {
      logger.info(`Successfully fetched secret: ${secretName} from AWS Secrets Manager`);
      return response.SecretString;
    } else if (response.SecretBinary) {
      // Handle binary secrets if necessary
      logger.warn(`Secret ${secretName} is binary, cannot use directly.`);
      return undefined;
    }
    logger.warn(`Secret ${secretName} fetched but has no SecretString.`);
    return undefined;
  } catch (error: any) {
    // Log specific errors, but don't fail if secret isn't found (allow fallback)
    if (error.name === 'ResourceNotFoundException') {
      logger.warn(`Secret ${secretName} not found in AWS Secrets Manager.`);
    } else {
      logger.error(`Error fetching secret ${secretName} from AWS Secrets Manager`, error);
    }
    return undefined;
  }
}

// Asynchronous function to load and validate configuration
async function loadConfig(): Promise<AppConfig> {
  logger.info("Loading application configuration...");

  // Determine Secret ARNs/Names (these could come from env vars themselves)
  // Using placeholders based on Task 17.4 structure
  const langfuseSecretName = process.env.LANGFUSE_SECRET_NAME || `${process.env.PROJECT_NAME || 'coe'}/${process.env.SERVICE_NAME || 'app'}/${process.env.ENVIRONMENT || 'dev'}/langfuse-keys`;
  const openaiSecretName = process.env.OPENAI_SECRET_NAME || `${process.env.PROJECT_NAME || 'coe'}/${process.env.SERVICE_NAME || 'app'}/${process.env.ENVIRONMENT || 'dev'}/openai-key`;
  const geminiSecretName = process.env.GEMINI_SECRET_NAME || `${process.env.PROJECT_NAME || 'coe'}/${process.env.SERVICE_NAME || 'app'}/${process.env.ENVIRONMENT || 'dev'}/gemini-key`;

  // Fetch secrets concurrently
  const [langfuseSecretJson, openaiSecretValue, geminiSecretValue] = await Promise.all([
    getSecretFromAWS(langfuseSecretName),
    getSecretFromAWS(openaiSecretName),
    getSecretFromAWS(geminiSecretName)
  ]);

  let langfuseSecrets = { secretKey: undefined, publicKey: undefined };
  if (langfuseSecretJson) {
    try {
      const parsed = JSON.parse(langfuseSecretJson);
      langfuseSecrets = {
        secretKey: parsed.LANGFUSE_SECRET_KEY,
        publicKey: parsed.LANGFUSE_PUBLIC_KEY
      };
    } catch (e) {
      const errorObj = e instanceof Error ? e : undefined;
      logger.error(`Failed to parse Langfuse secret JSON from Secrets Manager: ${langfuseSecretName}`, errorObj);
    }
  }

  const loadedConfig: AppConfig = {
    server: {
      port: parseInt(process.env.PORT || '8080', 10),
    },
    langfuse: {
      // Prioritize Secrets Manager, then Env Vars, then empty string
      secretKey: langfuseSecrets.secretKey || process.env.LANGFUSE_SECRET_KEY || '',
      publicKey: langfuseSecrets.publicKey || process.env.LANGFUSE_PUBLIC_KEY || '',
      baseUrl: process.env.LANGFUSE_BASEURL || 'https://cloud.langfuse.com',
    },
    // Configure LLM providers
    llm: {
      providers: [
        {
          provider: 'openai',
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          apiKey: openaiSecretValue || process.env.OPENAI_API_KEY || '',
          organization: process.env.OPENAI_ORGANIZATION,
          baseUrl: process.env.OPENAI_BASE_URL
        },
        {
          provider: 'gemini',
          model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
          apiKey: geminiSecretValue || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || ''
        }
      ],
      defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 'openai',
      defaultSelectionStrategy: process.env.DEFAULT_LLM_STRATEGY || 'fallback-default',
      // Per-expert LLM configurations
      expertConfigs: [
        {
          expertName: 'llm-summarization',
          provider: process.env.SUMMARIZATION_PROVIDER || 'openai',
          model: process.env.SUMMARIZATION_MODEL || 'gpt-4o',
          fallbackProvider: 'gemini',
          fallbackModel: 'gemini-1.5-pro',
          selectionStrategy: process.env.SUMMARIZATION_STRATEGY || 'fallback-default',
          priority: 'quality'
        },
        {
          expertName: 'query-reformulation',
          provider: process.env.QUERY_REFORMULATION_PROVIDER || 'openai',
          model: process.env.QUERY_REFORMULATION_MODEL || 'gpt-4o',
          selectionStrategy: process.env.QUERY_REFORMULATION_STRATEGY || 'quality-based',
          priority: 'quality'
        },
        {
          expertName: 'fact-checking',
          provider: process.env.FACT_CHECKING_PROVIDER || 'gemini',
          model: process.env.FACT_CHECKING_MODEL || 'gemini-1.5-pro',
          selectionStrategy: process.env.FACT_CHECKING_STRATEGY || 'quality-based',
          priority: 'quality'
        },
        {
          expertName: 'response-formatting',
          provider: process.env.RESPONSE_FORMATTING_PROVIDER,
          model: process.env.RESPONSE_FORMATTING_MODEL,
          selectionStrategy: process.env.RESPONSE_FORMATTING_STRATEGY || 'cost-based',
          priority: 'speed'
        }
      ]
    },
    // Legacy config - will be deprecated
    openai: {
      // Prioritize Secrets Manager, then Env Vars, then empty string
      apiKey: openaiSecretValue || process.env.OPENAI_API_KEY || '',
    },
  };

  // --- Validation ---
  // Check for placeholder Langfuse keys
  if (loadedConfig.langfuse.secretKey === 'test-langfuse-secret-key' ||
      loadedConfig.langfuse.publicKey === 'test-langfuse-public-key') {
    logger.error(`Placeholder Langfuse API keys detected. Please replace with valid keys in .env file.`, undefined);
    throw new Error(`Placeholder Langfuse API keys detected. Please replace with valid keys in .env file.
To get valid API keys:
1. Sign up at https://cloud.langfuse.com
2. Create a project
3. Go to Settings > API Keys to get your secret and public keys
4. Replace the placeholder values in .env with your actual keys`);
  }

  const requiredVars = [
    { key: 'Langfuse Secret Key', value: loadedConfig.langfuse.secretKey },
    { key: 'Langfuse Public Key', value: loadedConfig.langfuse.publicKey },
    // At least one LLM provider must have an API key
    {
      key: 'LLM Provider API Key',
      value: loadedConfig.llm.providers.some(p => !!p.apiKey) ? 'present' : ''
    },
    // Add other absolutely required vars
  ];

  const missingVars = requiredVars.filter(v => !v.value);

  if (missingVars.length > 0) {
    const missingKeys = missingVars.map(v => v.key).join(', ');
    logger.error(`Missing required configuration values: ${missingKeys}. Check environment variables or Secrets Manager.`, undefined, { missingKeys });
    // Decide if the application should exit or continue with warnings/disabled features
    throw new Error(`Missing required configuration: ${missingKeys}`);
  } else {
    logger.info("Configuration loaded and validated successfully.");
  }

  return loadedConfig;
}

// --- Exported Config ---
// Export a promise that resolves with the loaded config
// Other modules will need to 'await configPromise' before using config
export const configPromise: Promise<AppConfig> = loadConfig();

// Optional: Export a getter function for simpler access after initialization
let loadedConfigInstance: AppConfig | null = null;
configPromise.then(cfg => loadedConfigInstance = cfg).catch(() => { /* Error handled in loadConfig */ });

export function getConfig(): AppConfig {
  if (!loadedConfigInstance) {
    // This should ideally not happen if modules await the promise, 
    // but provides a fallback or indicates an issue.
    throw new Error("Configuration not loaded yet. Ensure configPromise is awaited.");
  }
  return loadedConfigInstance;
}