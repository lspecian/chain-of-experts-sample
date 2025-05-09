import { LLMSummarizationExpert } from '../../experts/expert2';
import { ChainInput, ChainContext } from '../../chain/types';
import { AppContext } from '../../chain/context';
import { getLLMProviderFactory } from '../../llm';
import { LLMProvider } from '../../llm/types';

// Mock the LLM provider factory
const mockLLMProvider = {
  createCompletion: jest.fn(),
  getName: jest.fn().mockReturnValue('mock-provider'),
  getDefaultModel: jest.fn().mockReturnValue('mock-model'),
  getAvailableModels: jest.fn().mockReturnValue(['mock-model']),
  createEmbedding: jest.fn(), // Add missing method
};
const mockLLMProviderFactory = {
  getProvider: jest.fn().mockReturnValue(mockLLMProvider),
  getDefaultProvider: jest.fn().mockReturnValue(mockLLMProvider), // Keep for potential fallback test
  getDefaultProviderName: jest.fn().mockReturnValue('openai'), // Mock default name
};
jest.mock('../../llm', () => ({
  getLLMProviderFactory: jest.fn(() => mockLLMProviderFactory),
}));

describe('LLMSummarizationExpert', () => {
  let expert: LLMSummarizationExpert;
  // No need for separate mockLLMProvider variable now

  beforeEach(() => {
    expert = new LLMSummarizationExpert(); // Use default constructor
    // Clear mocks before each test
    mockLLMProviderFactory.getProvider.mockClear().mockReturnValue(mockLLMProvider);
    mockLLMProviderFactory.getDefaultProvider.mockClear().mockReturnValue(mockLLMProvider);
    mockLLMProvider.createCompletion.mockClear();
    mockLLMProvider.createEmbedding.mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should summarize input documents using the LLM', async () => {
    const mockInputDocuments = {
      documents: [
        { id: 'doc1', content: 'This is the content of document 1.' },
        { id: 'doc2', content: 'This is the content of document 2.' },
      ],
    };
    const mockLLMResponse = {
      content: 'This is the summary.',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    mockLLMProvider.createCompletion.mockResolvedValue(mockLLMResponse);

    const input: ChainInput = { type: 'summarize', expertOutput: mockInputDocuments };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn(), generation: jest.fn().mockReturnThis() };

    const output = await expert.process(input, context, mockTrace);

    expect(getLLMProviderFactory).toHaveBeenCalled();
    expect(mockLLMProviderFactory.getProvider).toHaveBeenCalledWith('openai'); // Default provider
    expect(mockLLMProvider.createCompletion).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.any(Array),
      model: 'gpt-4o', // Default model
    }));
    expect(output).toEqual({
      summary: 'This is the summary.',
      summaryLength: 19, // Add summaryLength
      provider: 'openai', // Add provider
      model: 'gpt-4o', // Add model
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    });
    expect(mockTrace.span).toHaveBeenCalledWith('llm-summarization-processing');
    expect(mockTrace.generation).toHaveBeenCalledWith('llm-summarization-generation');
    expect(mockTrace.end).toHaveBeenCalled();
  });

  it('should return an empty summary if no documents are provided', async () => {
    const mockInputDocuments = { documents: [] };
    const input: ChainInput = { type: 'summarize', expertOutput: mockInputDocuments };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn(), generation: jest.fn().mockReturnThis() };

    const output = await expert.process(input, context, mockTrace);

    expect(getLLMProviderFactory).not.toHaveBeenCalled(); // Factory should not be called
    expect(mockLLMProvider.createCompletion).not.toHaveBeenCalled(); // LLM should not be called
    expect(output).toEqual({ summary: 'No documents provided for summarization.', skipped: true }); // Check for skipped flag
    expect(mockTrace.span).toHaveBeenCalledWith('llm-summarization-processing');
    expect(mockTrace.generation).not.toHaveBeenCalled();
    expect(mockTrace.end).toHaveBeenCalled();
  });

  it('should handle LLM generation errors gracefully and attempt fallback', async () => {
    const mockError = new Error('LLM failed to generate');
    const mockFallbackResponse = {
      content: 'Fallback summary.',
      usage: { promptTokens: 12, completionTokens: 6, totalTokens: 18 },
    };

    // Mock the initial provider (gemini) to fail
    const mockGeminiProvider = { ...mockLLMProvider, createCompletion: jest.fn().mockRejectedValue(mockError) };
    // Mock the fallback provider (openai) to succeed
    const mockOpenAIProvider = { ...mockLLMProvider, createCompletion: jest.fn().mockResolvedValue(mockFallbackResponse) };

    mockLLMProviderFactory.getProvider
      .mockImplementation((name: string) => {
        if (name === 'gemini') return mockGeminiProvider;
        if (name === 'openai') return mockOpenAIProvider;
        return undefined;
      });

    // Explicitly request gemini to trigger fallback
    const input: ChainInput = {
      type: 'summarize',
      expertOutput: { documents: [{ id: 'doc1', content: 'This is the content of document 1.' }] },
      llmProvider: 'gemini',
      llmModel: 'gemini-1.5-pro',
    };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn(), generation: jest.fn().mockReturnThis() };

    const output = await expert.process(input, context, mockTrace);

    expect(getLLMProviderFactory).toHaveBeenCalledTimes(1);
    expect(mockLLMProviderFactory.getProvider).toHaveBeenCalledWith('gemini');
    expect(mockLLMProviderFactory.getProvider).toHaveBeenCalledWith('openai'); // Fallback call
    expect(mockGeminiProvider.createCompletion).toHaveBeenCalledTimes(1);
    expect(mockOpenAIProvider.createCompletion).toHaveBeenCalledTimes(1);

    // Check the output from the fallback provider
    expect(output).toEqual({
      summary: 'Fallback summary.',
      summaryLength: 17,
      tokenUsage: { promptTokens: 12, completionTokens: 6, totalTokens: 18 },
      provider: 'openai', // Should be the fallback provider
      model: 'gpt-4o', // Should be the fallback model
      fallback: true,
      originalProvider: 'gemini',
    });

    expect(mockTrace.span).toHaveBeenCalledWith('llm-summarization-processing');
    expect(mockTrace.generation).toHaveBeenCalledWith('llm-summarization-generation');
    // Check that generation ended successfully after fallback
    expect(mockTrace.end).toHaveBeenCalledTimes(1); // Only the generation end
    // Check the arguments passed to the generation's end method (if needed, requires more complex mocking)
    // For now, we rely on the overall test outcome and the fact that end was called.
  });

  it('should throw error if fallback provider also fails', async () => {
    const mockError1 = new Error('LLM failed to generate');
    const mockError2 = new Error('Fallback LLM failed');

    // Mock both providers to fail
    const mockGeminiProvider = { ...mockLLMProvider, createCompletion: jest.fn().mockRejectedValue(mockError1) };
    const mockOpenAIProvider = { ...mockLLMProvider, createCompletion: jest.fn().mockRejectedValue(mockError2) };

    mockLLMProviderFactory.getProvider
      .mockImplementation((name: string) => {
        if (name === 'gemini') return mockGeminiProvider;
        if (name === 'openai') return mockOpenAIProvider;
        return undefined;
      });

    const input: ChainInput = {
      type: 'summarize',
      expertOutput: { documents: [{ id: 'doc1', content: 'Doc 1' }] },
      llmProvider: 'gemini',
    };
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn(), generation: jest.fn().mockReturnThis() };

    await expect(expert.process(input, context, mockTrace)).rejects.toThrow('Fallback LLM failed');

    expect(mockGeminiProvider.createCompletion).toHaveBeenCalledTimes(1);
    expect(mockOpenAIProvider.createCompletion).toHaveBeenCalledTimes(1);
    expect(mockTrace.generation).toHaveBeenCalledTimes(1);
    // Check that generation ended with error after fallback failure
    // Check the arguments passed to the generation's end method (if needed)
  });

  it('should handle cases where expertOutput is missing or not in expected format', async () => {
    const input: ChainInput = { type: 'summarize' }; // Missing expertOutput
    const context: ChainContext = new AppContext(input, 'user1', 'session1');
    const mockTrace: any = { span: jest.fn().mockReturnThis(), update: jest.fn(), end: jest.fn(), generation: jest.fn().mockReturnThis() };

    const output = await expert.process(input, context, mockTrace);

    expect(getLLMProviderFactory).not.toHaveBeenCalled();
    expect(output).toEqual({ summary: 'No documents provided for summarization.', skipped: true });
    expect(mockTrace.span).toHaveBeenCalledWith('llm-summarization-processing');
    expect(mockTrace.generation).not.toHaveBeenCalled();
    expect(mockTrace.end).toHaveBeenCalled();
  });
});