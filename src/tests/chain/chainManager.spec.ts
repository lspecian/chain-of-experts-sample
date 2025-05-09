import { ChainManager } from '../../chain/chainManager';
import { ChainInput, ChainContext, ExpertOutput, ChainOptions } from '../../chain/types'; // Import ChainOptions
import { AppContext } from '../../chain/context';
import { ExpertRegistry } from '../../experts';
import { IExpert } from '../../experts/baseExpert';
import { LangfuseTraceClient } from 'langfuse';

// Mock the ExpertRegistry
jest.mock('../../experts', () => ({
  ExpertRegistry: {
    getExpert: jest.fn(),
  },
}));

// Define mocks for Langfuse methods
const mockSpanEnd = jest.fn();
const mockSpanUpdate = jest.fn();
const mockSpan = jest.fn(() => ({
  update: mockSpanUpdate,
  end: mockSpanEnd,
}));
const mockGenerationEnd = jest.fn();
const mockGenerationUpdate = jest.fn();
const mockGeneration = jest.fn(() => ({
  update: mockGenerationUpdate,
  end: mockGenerationEnd,
}));
const mockTraceUpdate = jest.fn();
const mockTraceEnd = jest.fn(); // Mock for the trace client's end method

// Mock the Langfuse module
jest.mock('langfuse', () => ({
  LangfuseTraceClient: jest.fn().mockImplementation(() => ({
    span: mockSpan,
    update: mockTraceUpdate,
    end: mockTraceEnd, // Include end in the mock implementation
    generation: mockGeneration,
  })),
}));

describe('ChainManager', () => {
  let mockExpert1: jest.Mocked<IExpert>;
  let mockExpert2: jest.Mocked<IExpert>;
  // Remove the declaration here, it's handled by the mock

  beforeEach(() => {
    mockExpert1 = {
      getName: jest.fn().mockReturnValue('expert1'),
      getType: jest.fn().mockReturnValue('type1'),
      process: jest.fn(),
      getMetadata: jest.fn().mockReturnValue({}),
      getParameters: jest.fn().mockReturnValue({}),
      setParameters: jest.fn(),
      validateParameters: jest.fn().mockReturnValue(true),
    };
    mockExpert2 = {
      getName: jest.fn().mockReturnValue('expert2'),
      getType: jest.fn().mockReturnValue('type2'),
      process: jest.fn(),
      getMetadata: jest.fn().mockReturnValue({}),
      getParameters: jest.fn().mockReturnValue({}),
      setParameters: jest.fn(),
      validateParameters: jest.fn().mockReturnValue(true),
    };
    (ExpertRegistry.getExpert as jest.Mock)
      .mockReturnValueOnce(mockExpert1)
      .mockReturnValueOnce(mockExpert2);

    // Clear mocks before each test
    mockSpan.mockClear().mockReturnThis();
    mockSpanUpdate.mockClear();
    mockSpanEnd.mockClear();
    mockGeneration.mockClear().mockReturnThis();
    mockGenerationUpdate.mockClear();
    mockGenerationEnd.mockClear();
    mockTraceUpdate.mockClear();
    mockTraceEnd.mockClear(); // Clear the trace client's end mock
    // Clear the constructor mock if needed
    (LangfuseTraceClient as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should process input through a chain of experts', async () => {
    const expertNames = ['expert1', 'expert2'];
    const input: ChainInput = { type: 'initial', data: 'start' };
    const userId = 'user1';
    const sessionId = 'session1';

    const expert1Output: ExpertOutput = { intermediate: 'step1' };
    const expert2Output: ExpertOutput = { final: 'result' };

    mockExpert1.process.mockResolvedValue(expert1Output);
    mockExpert2.process.mockResolvedValue(expert2Output);

    const chainManager = new ChainManager(expertNames);
    const result = await chainManager.process(input, new AppContext(input, userId, sessionId), userId, sessionId);

    expect(ExpertRegistry.getExpert).toHaveBeenCalledTimes(2);
    expect(ExpertRegistry.getExpert).toHaveBeenCalledWith('expert1');
    expect(ExpertRegistry.getExpert).toHaveBeenCalledWith('expert2');

    expect(mockExpert1.process).toHaveBeenCalledTimes(1);
    expect(mockExpert1.process).toHaveBeenCalledWith(input, expect.any(AppContext), expect.any(Object));

    expect(mockExpert2.process).toHaveBeenCalledTimes(1);
    // Expect the input to expert2 to include the output of expert1
    expect(mockExpert2.process).toHaveBeenCalledWith(
      { ...input, expertOutput: expert1Output },
      expect.any(AppContext),
      expect.any(Object)
    );

    expect(result).toEqual({
      result: expert2Output,
      success: true,
    });

    // Verify Langfuse tracing calls
    expect(LangfuseTraceClient).toHaveBeenCalledTimes(1);
    expect(mockSpan).toHaveBeenCalledTimes(2);
    expect(mockSpan).toHaveBeenCalledWith('expert1-processing');
    expect(mockSpan).toHaveBeenCalledWith('expert2-processing');
    expect(mockSpanEnd).toHaveBeenCalledTimes(2); // One for each span
  });

  it('should handle errors when an expert fails after exhausting retries', async () => {
    const expertNames = ['expert1', 'expert2'];
    const input: ChainInput = { type: 'initial', data: 'start' };
    const userId = 'user1';
    const sessionId = 'session1';

    const expert1Output: ExpertOutput = { intermediate: 'step1' };
    const errorMessage = 'Something went wrong in expert2';

    mockExpert1.process.mockResolvedValue(expert1Output);
    // Make expert2 fail consistently
    mockExpert2.process.mockRejectedValue(new Error(errorMessage));

    // Mock setTimeout for immediate retries in test
    jest.useFakeTimers();

    const chainManager = new ChainManager(expertNames);
    const result = await chainManager.process(input, new AppContext(input, userId, sessionId), userId, sessionId);

    // Advance timers to allow retries to execute
    jest.advanceTimersByTime(1000); // Advance time enough for delays

    expect(ExpertRegistry.getExpert).toHaveBeenCalledTimes(2);
    expect(mockExpert1.process).toHaveBeenCalledTimes(1);
    expect(mockExpert2.process).toHaveBeenCalledTimes(3); // 1 initial + 2 retries

    expect(result).toEqual({
      result: null,
      success: false,
      // The error message now comes from the ExpertError thrown after retries
      error: `Error in expert 'expert2': ${errorMessage}`,
    });

    // Verify Langfuse tracing calls for error
    expect(LangfuseTraceClient).toHaveBeenCalledTimes(1);
    expect(mockSpan).toHaveBeenCalledTimes(2); // One span per expert, covering all attempts
    expect(mockSpan).toHaveBeenCalledWith('expert1-processing');
    expect(mockSpan).toHaveBeenCalledWith('expert2-processing');
    // Check span end for the failing expert
    expect(mockSpanEnd).toHaveBeenCalledTimes(2); // Both spans should end
    // Check that the span for expert2 ended with error status
    // We can inspect the arguments passed to span.end if needed
    // Example: expect(mockSpanEnd).toHaveBeenLastCalledWith(expect.objectContaining({ level: 'ERROR' }));

    jest.useRealTimers(); // Restore real timers
  });

  it('should succeed if an expert succeeds within retry attempts', async () => {
    const expertNames = ['expert1', 'expert2'];
    const input: ChainInput = { type: 'initial', data: 'start' };
    const userId = 'user1';
    const sessionId = 'session1';

    const expert1Output: ExpertOutput = { intermediate: 'step1' };
    const expert2SuccessOutput: ExpertOutput = { final: 'result after retry' };
    const errorMessage = 'Temporary failure';

    mockExpert1.process.mockResolvedValue(expert1Output);
    // Make expert2 fail once, then succeed
    mockExpert2.process
      .mockRejectedValueOnce(new Error(errorMessage))
      .mockResolvedValue(expert2SuccessOutput);

    // Mock setTimeout for immediate retries in test
    jest.useFakeTimers();

    const chainManager = new ChainManager(expertNames);
    const result = await chainManager.process(input, new AppContext(input, userId, sessionId), userId, sessionId);

    // Advance timers
    jest.advanceTimersByTime(1000);

    expect(ExpertRegistry.getExpert).toHaveBeenCalledTimes(2);
    expect(mockExpert1.process).toHaveBeenCalledTimes(1);
    expect(mockExpert2.process).toHaveBeenCalledTimes(2); // 1 failure + 1 success

    expect(result).toEqual({
      result: expert2SuccessOutput,
      success: true,
    });

    // Verify Langfuse tracing calls
    expect(LangfuseTraceClient).toHaveBeenCalledTimes(1);
    expect(mockSpan).toHaveBeenCalledTimes(2);
    expect(mockSpanEnd).toHaveBeenCalledTimes(2); // Both spans should end successfully

    jest.useRealTimers(); // Restore real timers
  });

  it('should return an error if no experts are provided', async () => {
    const expertNames: string[] = [];
    const input: ChainInput = { type: 'initial', data: 'start' };
    const userId = 'user1';
    const sessionId = 'session1';

    const chainManager = new ChainManager(expertNames);
    const result = await chainManager.process(input, new AppContext(input, userId, sessionId), userId, sessionId);

    expect(ExpertRegistry.getExpert).not.toHaveBeenCalled();
    expect(result).toEqual({
      result: null,
      success: false,
      error: 'No experts provided in the chain.',
    });

    // Verify Langfuse tracing is not called for invalid input
    expect(LangfuseTraceClient).not.toHaveBeenCalled();
  });

  it('should handle cases where an expert name is not found in the registry', async () => {
    const expertNames = ['expert1', 'nonexistent-expert', 'expert2'];
    const input: ChainInput = { type: 'initial', data: 'start' };
    const userId = 'user1';
    const sessionId = 'session1';

    (ExpertRegistry.getExpert as jest.Mock)
      .mockReturnValueOnce(mockExpert1)
      .mockImplementationOnce((name: string) => {
        if (name === 'nonexistent-expert') {
          throw new Error(`Expert '${name}' not found`);
        }
        return mockExpert2; // This part won't be reached in this test case
      });

    const chainManager = new ChainManager(expertNames);
    const result = await chainManager.process(input, new AppContext(input, userId, sessionId), userId, sessionId);

    expect(ExpertRegistry.getExpert).toHaveBeenCalledTimes(2); // Called for expert1 and nonexistent-expert
    expect(ExpertRegistry.getExpert).toHaveBeenCalledWith('expert1');
    expect(ExpertRegistry.getExpert).toHaveBeenCalledWith('nonexistent-expert');
    expect(mockExpert1.process).toHaveBeenCalledTimes(1); // expert1 should still run

    expect(result).toEqual({
      result: null,
      success: false,
      error: "Error in expert 'nonexistent-expert': Expert 'nonexistent-expert' not found",
    });

    // Verify Langfuse tracing calls
    expect(LangfuseTraceClient).toHaveBeenCalledTimes(1);
    expect(mockSpan).toHaveBeenCalledTimes(2); // Span for expert1 and nonexistent-expert
    expect(mockSpan).toHaveBeenCalledWith('expert1-processing');
    expect(mockSpan).toHaveBeenCalledWith('nonexistent-expert-processing');
    expect(mockSpanUpdate).toHaveBeenCalledTimes(1); // Only for the failing span
    expect(mockSpanUpdate).toHaveBeenCalledWith({ status: 'ERROR', statusMessage: "Expert 'nonexistent-expert' not found" });
    expect(mockSpanEnd).toHaveBeenCalledTimes(2); // Spans should still be ended
  });

  // --- Parallel Execution Tests ---

  it('should process input in parallel when mode is "parallel"', async () => {
    const expertNames = ['expert1', 'expert2'];
    const input: ChainInput = { type: 'initial', data: 'parallel start' };
    const userId = 'user-parallel';
    const sessionId = 'session-parallel';
    const options: ChainOptions = { executionMode: 'parallel' };

    const expert1Output: ExpertOutput = { result1: 'output1' };
    const expert2Output: ExpertOutput = { result2: 'output2' };

    // Reset mocks for parallel execution
    (ExpertRegistry.getExpert as jest.Mock)
      .mockReturnValueOnce(mockExpert1)
      .mockReturnValueOnce(mockExpert2);
    mockExpert1.process.mockResolvedValue(expert1Output);
    mockExpert2.process.mockResolvedValue(expert2Output);

    const chainManager = new ChainManager(expertNames);
    const result = await chainManager.process(input, new AppContext(input, userId, sessionId), userId, sessionId, options);

    expect(ExpertRegistry.getExpert).toHaveBeenCalledTimes(2);
    expect(mockExpert1.process).toHaveBeenCalledTimes(1);
    expect(mockExpert1.process).toHaveBeenCalledWith(input, expect.any(AppContext), expect.any(Object)); // Initial input
    expect(mockExpert2.process).toHaveBeenCalledTimes(1);
    expect(mockExpert2.process).toHaveBeenCalledWith(input, expect.any(AppContext), expect.any(Object)); // Initial input

    expect(result).toEqual({
      result: {
        expert1: expert1Output,
        expert2: expert2Output,
      },
      success: true, // TODO: Define success criteria for parallel
    });

    // Verify Langfuse tracing calls
    expect(LangfuseTraceClient).toHaveBeenCalledTimes(1);
    expect(mockSpan).toHaveBeenCalledTimes(2);
    expect(mockSpan).toHaveBeenCalledWith('expert1-processing');
    expect(mockSpan).toHaveBeenCalledWith('expert2-processing');
    expect(mockSpanEnd).toHaveBeenCalledTimes(2);
  });

  it('should handle errors for individual experts in parallel mode', async () => {
    const expertNames = ['expert1', 'expert2', 'expert3'];
    const input: ChainInput = { type: 'initial', data: 'parallel error test' };
    const userId = 'user-parallel-err';
    const sessionId = 'session-parallel-err';
    const options: ChainOptions = { executionMode: 'parallel' };

    const expert1Output: ExpertOutput = { result1: 'output1' };
    const expert3Output: ExpertOutput = { result3: 'output3' };
    const errorMsg = "Expert 2 failed";

    const mockExpert3 = { ...mockExpert1, getName: jest.fn().mockReturnValue('expert3'), process: jest.fn().mockResolvedValue(expert3Output) };
    (ExpertRegistry.getExpert as jest.Mock)
      .mockReturnValueOnce(mockExpert1)
      .mockReturnValueOnce(mockExpert2)
      .mockReturnValueOnce(mockExpert3);

    mockExpert1.process.mockResolvedValue(expert1Output);
    mockExpert2.process.mockRejectedValue(new Error(errorMsg)); // Expert 2 fails

    // Mock timers for retry logic within processWithExpert
    jest.useFakeTimers();

    const chainManager = new ChainManager(expertNames);
    const result = await chainManager.process(input, new AppContext(input, userId, sessionId), userId, sessionId, options);

    jest.advanceTimersByTime(1000); // Allow retries for expert2

    expect(ExpertRegistry.getExpert).toHaveBeenCalledTimes(3);
    expect(mockExpert1.process).toHaveBeenCalledTimes(1);
    expect(mockExpert2.process).toHaveBeenCalledTimes(3); // Failed + retries
    expect(mockExpert3.process).toHaveBeenCalledTimes(1);

    expect(result).toEqual({
      result: {
        expert1: expert1Output,
        expert2: { error: errorMsg }, // Error captured
        expert3: expert3Output,
      },
      success: true, // TODO: Should success be false if any expert fails? Current logic keeps it true.
    });

    // Verify Langfuse tracing calls
    expect(LangfuseTraceClient).toHaveBeenCalledTimes(1);
    expect(mockSpan).toHaveBeenCalledTimes(3);
    expect(mockSpan).toHaveBeenCalledWith('expert1-processing');
    expect(mockSpan).toHaveBeenCalledWith('expert2-processing');
    expect(mockSpan).toHaveBeenCalledWith('expert3-processing');
    expect(mockSpanEnd).toHaveBeenCalledTimes(3); // All spans should end (one with error)

    jest.useRealTimers();
  });
});