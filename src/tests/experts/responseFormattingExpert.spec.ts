import { ResponseFormattingExpert } from '../../experts/responseFormattingExpert';
import { ExpertOutput } from '../../experts/baseExpert';
import { ChainInput, ChainContext } from '../../chain/types';
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
  registerProvider: jest.fn(),
  setDefaultProvider: jest.fn(),
  getRegisteredProviders: jest.fn(),
  initializeProviders: jest.fn(),
};
mockGetLLMProviderFactory.mockReturnValue(mockFactoryInstance);

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

const mockSpanInstance = {
  update: jest.fn().mockReturnThis(), end: jest.fn().mockReturnThis(), score: jest.fn().mockReturnThis(),
  event: jest.fn().mockReturnThis(), id: 'mock-span-id', client: {} as any, traceId: 'mock-trace-id',
  observationId: 'mock-span-id', span: null as any, name: 'mock-span-name', startTime: new Date(),
  parentObservationId: null, metadata: {}, input: null, output: null, level: 'DEFAULT',
  statusMessage: null, version: null, endTime: null,
  generation: jest.fn().mockReturnValue(mockGenerationInstance),
  getTraceUrl: jest.fn().mockReturnValue('mock-trace-url/span'),
} as jest.Mocked<LangfuseSpanClient>;

const mockTraceClient: jest.Mocked<LangfuseTraceClient> = {
  span: jest.fn().mockReturnValue(mockSpanInstance),
  generation: jest.fn().mockReturnValue(mockGenerationInstance), // Main trace can also create generations
  score: jest.fn().mockReturnThis(), event: jest.fn().mockReturnThis(),
  shutdownAsync: jest.fn().mockResolvedValue(undefined),
} as any;


describe('ResponseFormattingExpert', () => {
  let expert: ResponseFormattingExpert;
  const sampleTextToFormat = "This is a sample text. It has multiple sentences. It needs formatting.";

  beforeEach(() => {
    jest.clearAllMocks();
    expert = new ResponseFormattingExpert();
    (mockTraceClient.span as jest.Mock).mockReturnValue(mockSpanInstance);
    (mockSpanInstance.generation as jest.Mock).mockReturnValue(mockGenerationInstance); // Ensure span's generation returns the mock
    mockLLMProvider.createCompletion.mockClear();
  });

  it('should be created and initialize LLM provider', () => {
    expect(expert).toBeTruthy();
    expect(mockFactoryInstance.getProvider).toHaveBeenCalledWith('mock-llm-provider');
  });

  it('should return default parameters', () => {
    const params = expert['getDefaultParameters']();
    expect(params.targetFormat).toBe('paragraph');
    expect(params.style).toBe('concise');
  });

  it('should format text to bullet points', async () => {
    expert.setParameters({ targetFormat: 'bullet_points', style: 'professional' });
    mockLLMProvider.createCompletion.mockResolvedValueOnce({ 
      content: "- Point 1\n- Point 2", 
      usage: {promptTokens:10, completionTokens:10, totalTokens:20} 
    } as LLMCompletionResponse);

    const input: ChainInput = { type: 'data', expertOutput: { summary: sampleTextToFormat } };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);

    expect(mockLLMProvider.createCompletion).toHaveBeenCalledTimes(1);
    expect(output.formattedText).toBe("- Point 1\n- Point 2");
    expect(output.metrics?.targetFormat).toBe('bullet_points');
    expect(mockSpanInstance.end).toHaveBeenCalled();
    expect(mockGenerationInstance.end).toHaveBeenCalled();
  });

  it('should format text to JSON and attempt to parse/stringify', async () => {
    expert.setParameters({ targetFormat: 'json_object' });
    const mockJsonResponse = { key: "value", number: 123 };
    mockLLMProvider.createCompletion.mockResolvedValueOnce({ 
      content: JSON.stringify(mockJsonResponse), 
      usage: {promptTokens:10, completionTokens:10, totalTokens:20} 
    } as LLMCompletionResponse);

    const input: ChainInput = { type: 'data', data: { textToFormat: "Convert this: key is value, number is 123" } };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);
    
    expect(output.formattedText).toBe(JSON.stringify(mockJsonResponse, null, 2));
  });
  
  it('should handle invalid JSON output from LLM for json_object targetFormat', async () => {
    expert.setParameters({ targetFormat: 'json_object' });
    const invalidJsonString = "{ key: 'value', number: 123, trailing_comma: , }"; // Invalid JSON
    mockLLMProvider.createCompletion.mockResolvedValueOnce({ 
      content: invalidJsonString,
      usage: {promptTokens:10, completionTokens:10, totalTokens:20} 
    } as LLMCompletionResponse);

    const input: ChainInput = { type: 'data', data: { textToFormat: "Some text" } };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);
    
    expect(output.formattedText).toBe(invalidJsonString); // Should return raw invalid string
    // Optionally check for a warning log or an error field in the output if that's the desired behavior
  });


  it('should handle no text to format', async () => {
    const input: ChainInput = { type: 'data', data: {} }; // No textToFormat
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);
    expect(output.error).toBe('No text provided for formatting.');
    expect(output.formattedText).toBe('');
  });

  describe('calculateScores', () => {
    it('should score formatting processing time and length change', async () => {
      const expertOutput = {
        formattedText: "Formatted short.",
        originalText: "This was the original much longer text.",
        metrics: { processingTimeMs: 75 }
      } as ExpertOutput;
      await expert.calculateScores(expertOutput, mockSpanInstance, mockTraceClient);

      expect(mockSpanInstance.score).toHaveBeenCalledWith({ name: 'formatting_processing_time_ms', value: 75 });
      expect(mockSpanInstance.score).toHaveBeenCalledWith({ name: 'formatting_length_change_chars', value: "Formatted short.".length - "This was the original much longer text.".length });
    });
  });
});