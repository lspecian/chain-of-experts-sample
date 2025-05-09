import { DataRetrievalExpert } from '../../experts/expert1';
import { ChainInput, ChainContext } from '../../chain/types';
import { AppContext } from '../../chain/context';
import { getChromaClient } from '../../vectordb/chromaClient';

// Mock the ChromaDB client
jest.mock('../../vectordb/chromaClient', () => ({
  getChromaClient: jest.fn(),
}));

describe('DataRetrievalExpert', () => {
  let expert: DataRetrievalExpert;
  let mockChromaClient: any;

  beforeEach(() => {
    expert = new DataRetrievalExpert();
    mockChromaClient = {
      collection: jest.fn().mockReturnThis(),
      query: jest.fn(),
    };
    (getChromaClient as jest.Mock).mockReturnValue(mockChromaClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should retrieve documents based on a query', async () => {
    const mockDocuments = {
      ids: [['doc1', 'doc2']],
      documents: [['Document 1 content', 'Document 2 content']],
      metadatas: [[{ title: 'Doc 1', source: 'a' }, { title: 'Doc 2', source: 'b' }]],
      distances: [[0.1, 0.2]],
    };
    mockChromaClient.query.mockResolvedValue(mockDocuments);

    const input: ChainInput = { type: 'query', query: 'test query' };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn() };

    const output = await expert.process(input, context, mockTrace);

    expect(getChromaClient).toHaveBeenCalled();
    expect(mockChromaClient.collection).toHaveBeenCalledWith('documents');
    expect(mockChromaClient.query).toHaveBeenCalledWith({
      queryTexts: ['test query'],
      nResults: 10, // We request more results than needed to filter by threshold
    });
    expect(output).toEqual({
      documents: [
        { id: 'doc1', content: 'Document 1 content', metadata: { title: 'Doc 1', source: 'a' }, score: 0.9 },
        { id: 'doc2', content: 'Document 2 content', metadata: { title: 'Doc 2', source: 'b' }, score: 0.8 },
      ],
      relevanceScore: expect.any(Number),
      retrievalTime: expect.any(String),
      metrics: {
        processingTimeMs: expect.any(Number),
        numDocumentsRetrieved: 2,
        avgSimilarityScore: expect.any(Number)
      }
    });
    expect(mockTrace.span).toHaveBeenCalledWith('data-retrieval-processing');
    expect(mockTrace.update).toHaveBeenCalled();
    expect(mockTrace.end).toHaveBeenCalled();
  });

  it('should return an empty documents array if no documents are found', async () => {
    const mockDocuments = {
      ids: [[]],
      documents: [[]],
      metadatas: [[]],
      distances: [[]],
    };
    mockChromaClient.query.mockResolvedValue(mockDocuments);

    const input: ChainInput = { type: 'query', query: 'nonexistent query' };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn() };

    const output = await expert.process(input, context, mockTrace);

    expect(getChromaClient).toHaveBeenCalled();
    expect(mockChromaClient.collection).toHaveBeenCalledWith('documents');
    expect(mockChromaClient.query).toHaveBeenCalledWith({
      queryTexts: ['nonexistent query'],
      nResults: 10,
    });
    expect(output).toEqual({
      documents: [],
      relevanceScore: 0,
      retrievalTime: expect.any(String),
      metrics: {
        processingTimeMs: expect.any(Number),
        numDocumentsRetrieved: 0,
        avgSimilarityScore: 0
      }
    });
    expect(mockTrace.span).toHaveBeenCalledWith('data-retrieval-processing');
    expect(mockTrace.update).toHaveBeenCalled();
    expect(mockTrace.end).toHaveBeenCalled();
  });

  it('should handle input without a query', async () => {
    const input: ChainInput = { type: 'other' };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn() };

    const output = await expert.process(input, context, mockTrace);

    expect(getChromaClient).not.toHaveBeenCalled(); // ChromaDB should not be called without a query
    expect(output).toEqual({ documents: [] });
    expect(mockTrace.span).toHaveBeenCalledWith('data-retrieval-processing');
    expect(mockTrace.end).toHaveBeenCalled();
  });

  it('should handle ChromaDB connection errors gracefully', async () => {
    (getChromaClient as jest.Mock).mockImplementation(() => {
      throw new Error('ChromaDB connection failed after 3 attempts');
    });

    const input: ChainInput = { type: 'query', query: 'test query' };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn() };

    await expect(expert.process(input, context, mockTrace)).rejects.toThrow('ChromaDB connection failed');

    expect(getChromaClient).toHaveBeenCalled();
    expect(mockChromaClient.collection).not.toHaveBeenCalled();
    expect(mockChromaClient.query).not.toHaveBeenCalled();
    expect(mockTrace.span).toHaveBeenCalledWith('data-retrieval-processing');
    expect(mockTrace.update).toHaveBeenCalledWith({
      status: 'ERROR',
      metadata: expect.objectContaining({
        error: expect.any(String)
      })
    });
    expect(mockTrace.end).toHaveBeenCalled();
  });
});