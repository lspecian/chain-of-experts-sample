import { FactCheckingExpert, ClaimVerification } from '../../experts/factCheckingExpert';
import { ExpertOutput } from '../../experts/baseExpert';
import { ChainInput, ChainContext, RetrievalResult } from '../../chain/types';
import { AppContext } from '../../chain/context';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import { LLMProvider, LLMCompletionResponse } from '../../llm/types';
import { getLLMProviderFactory } from '../../llm/factory';

// Mocks
jest.mock('../../llm/factory');

const mockLLMProvider: jest.Mocked<LLMProvider> = {
  getName: jest.fn().mockReturnValue('mock-llm-provider'),
  getAvailableModels: jest.fn().mockReturnValue(['mock-model']),
  getDefaultModel: jest.fn().mockReturnValue('mock-model'),
  createCompletion: jest.fn(),
  createEmbedding: jest.fn(),
};

const mockGetLLMProviderFactory = getLLMProviderFactory as jest.Mock;
const mockFactoryInstance = {
  getProvider: jest.fn().mockReturnValue(mockLLMProvider),
  getDefaultProviderName: jest.fn().mockReturnValue('mock-llm-provider'),
  // Add other methods if needed by the expert's constructor
  registerProvider: jest.fn(),
  setDefaultProvider: jest.fn(),
  getRegisteredProviders: jest.fn(),
  initializeProviders: jest.fn(),
};
mockGetLLMProviderFactory.mockReturnValue(mockFactoryInstance);


const mockSpanInstance = {
  update: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  score: jest.fn().mockReturnThis(),
  event: jest.fn().mockReturnThis(),
  id: 'mock-span-id', client: {} as any, traceId: 'mock-trace-id', observationId: 'mock-span-id',
  span: null as any, name: 'mock-span-name', startTime: new Date(), parentObservationId: null,
  metadata: {}, input: null, output: null, level: 'DEFAULT', statusMessage: null, version: null, endTime: null,
  generation: jest.fn().mockImplementation(() => mockGenerationInstance),
  getTraceUrl: jest.fn().mockReturnValue('mock-trace-url/span'),
} as jest.Mocked<LangfuseSpanClient>;

const mockGenerationInstance = {
    update: jest.fn().mockReturnThis(), end: jest.fn().mockReturnThis(), score: jest.fn().mockReturnThis(),
    event: jest.fn().mockReturnThis(), id: 'mock-generation-id', client: {} as any, traceId: 'mock-trace-id',
    observationId: 'mock-generation-id', span: null as any, name: 'mock-generation-name', startTime: new Date(),
    parentObservationId: null, metadata: {}, input: null, output: null, level: 'DEFAULT',
    statusMessage: null, version: null, endTime: null, completionStartTime: new Date(), model: 'mock-model',
    modelParameters: {}, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30, unit: 'TOKENS' } as any,
    prompt: [], completion: null,
    generation: jest.fn().mockReturnThis(), 
    getTraceUrl: jest.fn().mockReturnValue('mock-trace-url/generation'),
} as jest.Mocked<LangfuseGenerationClient>;


const mockTraceClient: jest.Mocked<LangfuseTraceClient> = {
  span: jest.fn().mockReturnValue(mockSpanInstance),
  generation: jest.fn().mockReturnValue(mockGenerationInstance),
  score: jest.fn().mockReturnThis(), event: jest.fn().mockReturnThis(),
  shutdownAsync: jest.fn().mockResolvedValue(undefined),
} as any;

describe('FactCheckingExpert', () => {
  let expert: FactCheckingExpert;

  const sampleTextToCheck = "The sky is blue. Grass is green. Water is wet.";
  const sampleSourceDocuments: RetrievalResult['documents'] = [
    { id: 'doc1', content: 'The sky appears blue due to Rayleigh scattering. Green grass contains chlorophyll.', score: 0.9 },
    { id: 'doc2', content: 'Water is a liquid at standard temperature and pressure, and it feels wet.', score: 0.8 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    expert = new FactCheckingExpert(); // Relies on mocked factory
    (mockTraceClient.span as jest.Mock).mockReturnValue(mockSpanInstance);
    (mockTraceClient.generation as jest.Mock).mockReturnValue(mockGenerationInstance);
    mockSpanInstance.end.mockClear().mockReturnThis();
    mockGenerationInstance.end.mockClear().mockReturnThis();
    mockLLMProvider.createCompletion.mockClear();
  });

  it('should be created and initialize LLM provider', () => {
    expect(expert).toBeTruthy();
    expect(mockFactoryInstance.getProvider).toHaveBeenCalledWith('mock-llm-provider');
    expect(expert['llmProvider']).toBe(mockLLMProvider);
  });

  it('should return default parameters', () => {
    const params = expert['getDefaultParameters']();
    expect(params.temperature).toBe(0.2);
    expect(params.maxTokensPerClaim).toBe(200);
  });

  it('should process text and verify claims', async () => {
    mockLLMProvider.createCompletion
      .mockResolvedValueOnce({ content: 'supported. The sky is indeed blue due to scattering.', usage: {promptTokens:10, completionTokens:10, totalTokens:20} } as LLMCompletionResponse)
      .mockResolvedValueOnce({ content: 'supported. Grass contains chlorophyll making it green.', usage: {promptTokens:10, completionTokens:10, totalTokens:20} } as LLMCompletionResponse)
      .mockResolvedValueOnce({ content: 'supported. Water feels wet.', usage: {promptTokens:10, completionTokens:10, totalTokens:20} } as LLMCompletionResponse);

    const input: ChainInput = { 
      type: 'data', 
      expertOutput: { summary: sampleTextToCheck, documents: sampleSourceDocuments } as any 
    };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);

    expect(mockLLMProvider.createCompletion).toHaveBeenCalledTimes(3); // For 3 claims
    expect(output.verifiedClaims).toHaveLength(3);
    (output.verifiedClaims as ClaimVerification[]).forEach(v => {
      expect(v.isSupported).toBe(true);
    });
    expect(output.metrics?.numClaimsChecked).toBe(3);
    expect(mockSpanInstance.end).toHaveBeenCalled();
  });

  it('should handle no text to check', async () => {
    const input: ChainInput = { type: 'data', expertOutput: { documents: sampleSourceDocuments } as any };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);
    expect(output.error).toBe('No text provided for fact-checking.');
    expect(output.verifiedClaims).toEqual([]);
  });
  
  it('should handle LLM provider not being initialized', async () => {
    mockFactoryInstance.getProvider.mockReturnValueOnce(undefined); // Simulate LLM init failure
    const localExpert = new FactCheckingExpert();
    const input: ChainInput = { type: 'data', expertOutput: { summary: sampleTextToCheck } as any };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await localExpert.process(input, context, mockTraceClient);
    expect(output.error).toBe('LLM provider not initialized for FactCheckingExpert.');
  });

  describe('calculateScores', () => {
    it('should score fact-checking results', async () => {
      const verifiedClaims: ClaimVerification[] = [
        { claim: 'c1', isSupported: true },
        { claim: 'c2', isSupported: false },
        { claim: 'c3', isSupported: 'uncertain' },
      ];
      const metrics = { processingTimeMs: 150 };
      await expert.calculateScores({ verifiedClaims, metrics } as ExpertOutput, mockSpanInstance, mockTraceClient);

      expect(mockSpanInstance.score).toHaveBeenCalledWith({ name: 'fact_check_supported_ratio', value: expect.any(Number), comment: expect.any(String) });
      expect(mockSpanInstance.score).toHaveBeenCalledWith({ name: 'fact_check_contradicted_ratio', value: expect.any(Number), comment: expect.any(String) });
      expect(mockSpanInstance.score).toHaveBeenCalledWith({ name: 'fact_check_total_claims', value: 3 });
      expect(mockSpanInstance.score).toHaveBeenCalledWith({ name: 'fact_check_uncertain_claims', value: 1 });
      expect(mockSpanInstance.score).toHaveBeenCalledWith({ name: 'fact_checking_processing_time_ms', value: 150 });
    });
  });
});