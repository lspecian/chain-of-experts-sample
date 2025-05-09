import { DocumentFilteringExpert } from '../../experts/documentFilteringExpert';
import { ExpertOutput } from '../../experts/baseExpert'; // Import ExpertOutput
import { ChainInput, ChainContext, RetrievalResult } from '../../chain/types';
import { AppContext } from '../../chain/context';
import { LangfuseTraceClient, LangfuseSpanClient } from 'langfuse';

// Mock Langfuse clients
const mockSpanInstance = {
  update: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  score: jest.fn().mockReturnThis(),
  event: jest.fn().mockReturnThis(),
  id: 'mock-span-id',
  client: {} as any, 
  traceId: 'mock-trace-id',
  observationId: 'mock-span-id',
  span: null as any,
  name: 'mock-span-name',
  startTime: new Date(),
  parentObservationId: null,
  metadata: {},
  input: null,
  output: null,
  level: 'DEFAULT',
  statusMessage: null,
  version: null,
  endTime: null,
  generation: jest.fn(), 
  getTraceUrl: jest.fn().mockReturnValue('mock-trace-url/span'),
} as jest.Mocked<LangfuseSpanClient>;

const mockTraceClient: jest.Mocked<LangfuseTraceClient> = {
  span: jest.fn().mockReturnValue(mockSpanInstance),
  generation: jest.fn().mockReturnThis(), // Not used by this expert directly
  score: jest.fn().mockReturnThis(),
  event: jest.fn().mockReturnThis(),
  shutdownAsync: jest.fn().mockResolvedValue(undefined),
} as any;


describe('DocumentFilteringExpert', () => {
  let expert: DocumentFilteringExpert;

  const sampleDocuments: RetrievalResult['documents'] = [
    { id: 'doc1', content: 'High relevance content A', score: 0.9 },
    { id: 'doc2', content: 'Medium relevance content B', score: 0.7 },
    { id: 'doc3', content: 'Low relevance content C', score: 0.4 },
    { id: 'doc4', content: 'High relevance content D', score: 0.95 },
    { id: 'doc5', content: 'Medium relevance content E', score: 0.6 },
    { id: 'doc6', content: 'No score content F', score: undefined as any }, // Test undefined score
  ];

  beforeEach(() => {
    expert = new DocumentFilteringExpert();
    jest.clearAllMocks();
    (mockTraceClient.span as jest.Mock).mockReturnValue(mockSpanInstance);
    mockSpanInstance.update.mockClear().mockReturnThis();
    mockSpanInstance.end.mockClear().mockReturnThis();
    mockSpanInstance.score.mockClear().mockReturnThis();
  });

  it('should be created', () => {
    expect(expert).toBeTruthy();
  });

  it('should have a name and type', () => {
    expect(expert.getName()).toBe('document-filtering');
    expect(expert.getType()).toBe('filtering');
  });

  it('should return default parameters', () => {
    const defaultParams = expert['getDefaultParameters']();
    expect(defaultParams).toEqual({
      minRelevanceScore: 0.5,
      maxOutputDocuments: 5,
      sortBy: 'relevance',
    });
  });

  it('should validate parameters correctly', () => {
    expect(expert.validateParameters({ minRelevanceScore: 0.6 })).toBe(true);
    expect(expert.validateParameters({ maxOutputDocuments: 3 })).toBe(true);
    expect(expert.validateParameters({ sortBy: 'recency' })).toBe(true);
    expect(expert.validateParameters({ minRelevanceScore: -0.1 })).toBe(false);
    expect(expert.validateParameters({ minRelevanceScore: 1.1 })).toBe(false);
    expect(expert.validateParameters({ maxOutputDocuments: 0 })).toBe(false);
    expect(expert.validateParameters({ sortBy: 'invalidSort' })).toBe(false);
  });

  it('should filter documents based on minRelevanceScore', async () => {
    expert.setParameters({ minRelevanceScore: 0.7 });
    const input: ChainInput = { type: 'data', expertOutput: { documents: sampleDocuments } as RetrievalResult };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);
    
    expect(output.documents).toHaveLength(3); // doc1, doc2, doc4 (doc6 has undefined score, passes if minRelevanceScore is not strictly applied to undefined)
    expect((output.documents as any[]).every(doc => doc.score === undefined || doc.score >= 0.7)).toBe(true);
    expect(mockSpanInstance.end).toHaveBeenCalled();
  });

  it('should limit documents by maxOutputDocuments after sorting by relevance', async () => {
    expert.setParameters({ maxOutputDocuments: 2, sortBy: 'relevance', minRelevanceScore: 0 }); // minRelevanceScore 0 to include all initially
    const input: ChainInput = { type: 'data', expertOutput: { documents: sampleDocuments } as RetrievalResult };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);

    expect(output.documents).toHaveLength(2);
    expect((output.documents as any[])[0].id).toBe('doc4'); // Highest score
    expect((output.documents as any[])[1].id).toBe('doc1'); // Second highest
  });
  
  it('should handle empty input documents', async () => {
    const emptyRetrievalResult: RetrievalResult = { documents: [], relevanceScore: 0 };
    const input: ChainInput = { type: 'data', expertOutput: emptyRetrievalResult };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);

    expect(output.documents).toHaveLength(0);
    expect(output.metrics?.numInputDocuments).toBe(0);
    expect(output.metrics?.numOutputDocuments).toBe(0);
  });

  it('should handle input.data.documents if expertOutput is not present', async () => {
    expert.setParameters({ minRelevanceScore: 0.7 });
    const input: ChainInput = { type: 'data', data: { documents: sampleDocuments } };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);
    
    expect(output.documents).toHaveLength(3);
    expect((output.documents as any[]).every(doc => doc.score === undefined || doc.score >= 0.7)).toBe(true);
  });
  
  it('should correctly apply default minRelevanceScore if document score is undefined', async () => {
    // Default minRelevanceScore is 0.5
    const docsWithUndefined = [
        { id: 'doc1', content: 'Content A', score: 0.8 },
        { id: 'doc2', content: 'Content B', score: undefined as any }, // Should pass default 0.5
        { id: 'doc3', content: 'Content C', score: 0.4 }, // Should be filtered
    ];
    const input: ChainInput = { type: 'data', expertOutput: { documents: docsWithUndefined } as RetrievalResult };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const output = await expert.process(input, context, mockTraceClient);
    expect(output.documents).toHaveLength(2); // doc1 and doc2
    expect((output.documents as any[]).find(d => d.id === 'doc1')).toBeTruthy();
    expect((output.documents as any[]).find(d => d.id === 'doc2')).toBeTruthy();
  });


  describe('calculateScores', () => {
    it('should calculate reduction percentage and processing time', async () => {
      const outputMetrics = {
        numInputDocuments: 10,
        numOutputDocuments: 3,
        processingTimeMs: 120
      };
      await expert.calculateScores({ metrics: outputMetrics } as ExpertOutput, mockSpanInstance, mockTraceClient);
      
      expect(mockSpanInstance.score).toHaveBeenCalledWith({
        name: 'document_reduction_percentage',
        value: 70.00, // (10-3)/10 * 100
        comment: 'Percentage of documents filtered out. Input: 10, Output: 3'
      });
      expect(mockSpanInstance.score).toHaveBeenCalledWith({
        name: 'filtering_processing_time_ms',
        value: 120,
        comment: 'Time taken for document filtering in milliseconds.'
      });
    });
    
    it('should handle zero input documents for reduction percentage', async () => {
      const outputMetrics = {
        numInputDocuments: 0,
        numOutputDocuments: 0,
        processingTimeMs: 10
      };
      await expert.calculateScores({ metrics: outputMetrics } as ExpertOutput, mockSpanInstance, mockTraceClient);
      expect(mockSpanInstance.score).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'document_reduction_percentage', value: 0 })
      );
    });
  });
});