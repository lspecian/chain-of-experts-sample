import { QueryReformulationExpert } from '../../experts/queryReformulationExpert';
import { ChainInput, ChainContext } from '../../chain/types';
import { AppContext } from '../../chain/context';
import { LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';

// Define mocks for span and generation clients that trace client would return
const mockSpanInstance = {
  update: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  score: jest.fn().mockReturnThis(),
  event: jest.fn().mockReturnThis(),
  id: 'mock-span-id',
  // Add properties required by LangfuseSpanClient based on TS error
  client: {} as any, // Mock Langfuse client instance
  traceId: 'mock-trace-id',
  observationId: 'mock-span-id', // Often the same as 'id'
  span: null as any, // 'span' property, type unknown, using null
  name: 'mock-span-name', // Common property
  startTime: new Date(), // Common property
  // Add other common properties to be safe, though not explicitly in error
  parentObservationId: null,
  metadata: {},
  input: null,
  output: null,
  level: 'DEFAULT',
  statusMessage: null,
  version: null,
  endTime: null,
  generation: jest.fn().mockImplementation(() => mockGenerationInstance), // Allow span to create a generation
  getTraceUrl: jest.fn().mockReturnValue('mock-trace-url/span'),
} as jest.Mocked<LangfuseSpanClient>;

const mockGenerationInstance = {
  update: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  score: jest.fn().mockReturnThis(),
  event: jest.fn().mockReturnThis(),
  id: 'mock-generation-id',
  // Add properties required by LangfuseGenerationClient
  client: {} as any,
  traceId: 'mock-trace-id',
  observationId: 'mock-generation-id',
  span: null as any,
  name: 'mock-generation-name',
  startTime: new Date(),
  parentObservationId: null,
  metadata: {},
  input: null,
  output: null,
  level: 'DEFAULT',
  statusMessage: null,
  version: null,
  endTime: null,
  // Generation-specific
  completionStartTime: new Date(),
  model: 'mock-model',
  modelParameters: {},
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, unit: 'TOKENS' } as any,
  prompt: [],
  completion: null,
  generation: jest.fn().mockImplementation(() => mockGenerationInstance), // Allow generation to create a nested generation (though less common)
  getTraceUrl: jest.fn().mockReturnValue('mock-trace-url/generation'),
} as jest.Mocked<LangfuseGenerationClient>;


// Mock LangfuseTraceClient
const mockTraceClient: jest.Mocked<LangfuseTraceClient> = {
  span: jest.fn().mockReturnValue(mockSpanInstance),
  generation: jest.fn().mockReturnValue(mockGenerationInstance),
  score: jest.fn().mockReturnThis(),
  event: jest.fn().mockReturnThis(),
  shutdownAsync: jest.fn().mockResolvedValue(undefined),
} as any;


describe('QueryReformulationExpert', () => {
  let expert: QueryReformulationExpert;

  beforeEach(() => {
    expert = new QueryReformulationExpert();
    // Reset mocks before each test
    jest.clearAllMocks();

    // Clear and re-setup mock instances for span and generation
    mockSpanInstance.update.mockClear().mockReturnThis();
    mockSpanInstance.end.mockClear().mockReturnThis();
    mockSpanInstance.score.mockClear().mockReturnThis();
    mockSpanInstance.event.mockClear().mockReturnThis();

    mockGenerationInstance.update.mockClear().mockReturnThis();
    mockGenerationInstance.end.mockClear().mockReturnThis();
    mockGenerationInstance.score.mockClear().mockReturnThis();
    mockGenerationInstance.event.mockClear().mockReturnThis();
    
    // Ensure traceClient's methods return the (cleared) instances
    (mockTraceClient.span as jest.Mock).mockReturnValue(mockSpanInstance);
    (mockTraceClient.generation as jest.Mock).mockReturnValue(mockGenerationInstance);
    (mockTraceClient.score as jest.Mock).mockClear().mockReturnThis();
    (mockTraceClient.event as jest.Mock).mockClear().mockReturnThis();
  });

  it('should be created', () => {
    expect(expert).toBeTruthy();
  });

  it('should have a name and type', () => {
    expect(expert.getName()).toBe('query-reformulation');
    expect(expert.getType()).toBe('reformulation');
  });

  it('should return default parameters', () => {
    const defaultParams = expert['getDefaultParameters'](); // Access protected method for testing
    expect(defaultParams).toEqual({
      reformulationModel: 'default-model-for-reformulation',
      temperature: 0.5,
      maxTokens: 150,
    });
  });

  it('should validate parameters correctly', () => {
    expect(expert.validateParameters({ reformulationModel: 'test' })).toBe(true);
    expect(expert.validateParameters({ temperature: 0.7 })).toBe(true);
    expect(expert.validateParameters({ maxTokens: 100 })).toBe(true);
    expect(expert.validateParameters({ reformulationModel: 123 })).toBe(false);
    expect(expert.validateParameters({ temperature: 'high' })).toBe(false);
    expect(expert.validateParameters({ temperature: 2 })).toBe(false);
    expect(expert.validateParameters({ maxTokens: -5 })).toBe(false);
    expect(expert.validateParameters({ unknownParam: 'test' })).toBe(true); // Unknown params are allowed by default
  });
  
  it('should set and get parameters', () => {
    const params = { reformulationModel: 'new-model', temperature: 0.8 };
    expert.setParameters(params);
    const retrievedParams = expert.getParameters();
    expect(retrievedParams.reformulationModel).toBe('new-model');
    expect(retrievedParams.temperature).toBe(0.8);
    // Default maxTokens should still be there
    expect(retrievedParams.maxTokens).toBe(150); 
  });

  it('should process a query and return a reformulated query (simple prefix for now)', async () => {
    const input: ChainInput = { type: 'query', query: 'test query' };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    
    const output = await expert.process(input, context, mockTraceClient);

    expect(output.originalQuery).toBe('test query');
    expect(output.reformulatedQuery).toBe('Reformulated: test query'); // Based on current placeholder logic
    expect(output.metrics?.processingTimeMs).toBeGreaterThanOrEqual(0);
    expect(mockTraceClient.span).toHaveBeenCalledWith(expect.objectContaining({
      name: 'query-reformulation-overall-processing',
      input: { query: 'test query', params: expert.getParameters() },
    }));
    expect(mockSpanInstance.end).toHaveBeenCalled();
  });

  it('should handle an empty query input', async () => {
    const input: ChainInput = { type: 'query', query: '' };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');

    const output = await expert.process(input, context, mockTraceClient);

    expect(output.originalQuery).toBe('');
    expect(output.reformulatedQuery).toBe('');
    expect(output.error).toBe('No query provided');
    // Span should still be created and ended, possibly with error state
    expect(mockTraceClient.span).toHaveBeenCalled();
    expect(mockSpanInstance.end).toHaveBeenCalled();
  });
  
  it('should handle input with no query field', async () => {
    const input: ChainInput = { type: 'data', data: { some: 'data' } }; // No query field
    const context: ChainContext = new AppContext(input, 'user1', 'session1');

    const output = await expert.process(input, context, mockTraceClient);
    expect(output.originalQuery).toBeUndefined();
    expect(output.reformulatedQuery).toBe('');
    expect(output.error).toBe('No query provided');
    expect(mockTraceClient.span).toHaveBeenCalled();
    expect(mockSpanInstance.end).toHaveBeenCalled();
  });

  // Add more tests later for actual LLM integration, error handling from LLM, caching, etc.

  describe('calculateScores', () => {
    it('should score when query is reformulated', async () => {
      const output = {
        originalQuery: 'original',
        reformulatedQuery: 'reformulated',
        metrics: { processingTimeMs: 100 }
      };
      // Pass mockSpanInstance as the langfuseObject because calculateScores is called on the span in production
      await expert.calculateScores(output, mockSpanInstance, mockTraceClient);
      expect(mockSpanInstance.score).toHaveBeenCalledWith({
        name: 'query_changed_by_reformulation',
        value: 1,
        comment: 'Query was successfully reformulated.'
      });
      expect(mockSpanInstance.score).toHaveBeenCalledWith({
        name: 'reformulation_processing_time_ms',
        value: 100,
        comment: 'Time taken for query reformulation in milliseconds.'
      });
    });

    it('should score when query is not changed', async () => {
      const output = {
        originalQuery: 'original',
        reformulatedQuery: 'original', // Not changed
        metrics: { processingTimeMs: 50 }
      };
      await expert.calculateScores(output, mockSpanInstance, mockTraceClient);
      expect(mockSpanInstance.score).toHaveBeenCalledWith({
        name: 'query_unchanged_by_reformulation',
        value: 1,
        comment: 'Query was not changed by reformulation (might be optimal or simple prefix used).'
      });
       expect(mockSpanInstance.score).toHaveBeenCalledWith({
        name: 'reformulation_processing_time_ms',
        value: 50,
        comment: 'Time taken for query reformulation in milliseconds.'
      });
    });
    
    it('should not score query_changed if error occurred', async () => {
      const output = {
        originalQuery: 'original',
        reformulatedQuery: 'original',
        error: 'Some error',
        metrics: { processingTimeMs: 50 }
      };
      await expert.calculateScores(output, mockSpanInstance, mockTraceClient);
      expect(mockSpanInstance.score).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'query_changed_by_reformulation' })
      );
      expect(mockSpanInstance.score).not.toHaveBeenCalledWith(
        expect.objectContaining({ name: 'query_unchanged_by_reformulation' })
      );
       expect(mockSpanInstance.score).toHaveBeenCalledWith({ // Still score time
        name: 'reformulation_processing_time_ms',
        value: 50,
        comment: 'Time taken for query reformulation in milliseconds.'
      });
    });
  });
});