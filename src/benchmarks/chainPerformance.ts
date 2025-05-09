import Benchmark from 'benchmark';
import { ChainManager } from '../chain/chainManager';
import { IExpert, ExpertParameters } from '../experts/baseExpert';
import { AppContext } from '../chain/context'; // Changed from ChainContext
import { ChainInput, ChainOptions, ExpertOutput, ChainContext, IntermediateResult } from '../chain/types'; // Added ChainContext interface
// import { LLMProviderFactory } from '../llm/factory'; // Not needed directly for options
// import { LLMProviderName } from '../llm/types'; // Not an export, use string
import { Langfuse, LangfuseTraceClient } from 'langfuse'; // For mocking

// --- Mock Langfuse ---
const mockLangfuseInstance = {
  trace: (obj: any) => ({
    span: (spanObj: any) => ({
      end: () => {},
      score: () => {},
      update: () => {},
      getTraceId: () => 'mock-trace-id',
      getSessionId: () => 'mock-session-id',
    }),
    update: () => {},
    getTraceId: () => 'mock-trace-id',
    getSessionId: () => 'mock-session-id',
  }),
  shutdownAsync: async () => {},
} as unknown as Langfuse;

const mockTraceClient = mockLangfuseInstance.trace({ name: 'benchmark-trace' }) as LangfuseTraceClient;


// --- Mock ExpertRegistry ---
const mockExpertsMap = new Map<string, IExpert>();
const ExpertRegistry = {
  getExpert: (name: string): IExpert => {
    const expert = mockExpertsMap.get(name);
    if (!expert) throw new Error(`MockExpert ${name} not found in mock registry. Available: ${Array.from(mockExpertsMap.keys()).join(', ')}`);
    return expert;
  },
  registerExpert: (expert: IExpert): void => {
    mockExpertsMap.set(expert.getName(), expert);
  },
  getAllExperts: (): IExpert[] => Array.from(mockExpertsMap.values()),
  isExpertRegistered: (name: string): boolean => mockExpertsMap.has(name),
};


// --- Mock Experts for testing ---
class MockExpert implements IExpert {
  constructor(private name: string, private delay: number = 50) {}

  getName(): string {
    return this.name;
  }

  getType(): string {
    return `${this.name}Type`;
  }

  getParameters(): ExpertParameters {
    return { delay: this.delay };
  }

  setParameters(parameters: ExpertParameters): void {
    if (typeof parameters.delay === 'number') {
      this.delay = parameters.delay;
    }
  }

  // Updated signature to include trace and match IExpert
  async process(input: ChainInput, context: ChainContext, trace?: LangfuseTraceClient): Promise<ExpertOutput> {
    await new Promise(resolve => setTimeout(resolve, this.delay));
    // console.log(`MockExpert ${this.name} processed query: ${input.query} with delay ${this.delay}ms`);
    return {
      expertName: this.name,
      data: { message: `Mock output from ${this.name} for query: ${input.query}` },
      cost: 0.001, // Mock cost
      tokenUsage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
  }
}

const suite = new Benchmark.Suite('ChainPerformance');

// --- Configuration ---
const defaultChainOptions: ChainOptions = { // Use ChainOptions directly
  // llmProviderFactory: new LLMProviderFactory(), // Removed, factory constructor is private and not part of options
  // defaultLLM: 'openai', // Changed from LLMProviderName.OPENAI
  cache: { enabled: false, type: 'memory' }, // Caching disabled by default for baseline
  // maxRetries: 1, // This would be part of defaultExpertOptions
  // maxConcurrency: 5, // This is a direct ChainOption
  defaultExpertOptions: {
    retryOptions: { maxAttempts: 1 }
  },
  maxConcurrency: 5,
  executionMode: 'sequential',
};

const sampleInput: ChainInput = {
  type: 'benchmark_query', // Added type
  query: 'What is the capital of France?',
  // other necessary input fields
};

// Instantiate AppContext with required parameters
const sampleContext = new AppContext(sampleInput, 'benchmark-user', 'benchmark-session');
sampleContext.state.set('initial_state_key', 'initial_state_value');


// --- Register Mock Experts ---
const expert1 = new MockExpert('ExpertA', 50);
const expert2 = new MockExpert('ExpertB', 75);
const expertC = new MockExpert('ExpertC', 60);
const expertD = new MockExpert('ExpertD', 60);
const expertParallelSetup = new MockExpert('ExpertParallelSetup', 10);
const expertParallelJoin = new MockExpert('ExpertParallelJoin', 10);

ExpertRegistry.registerExpert(expert1);
ExpertRegistry.registerExpert(expert2);
ExpertRegistry.registerExpert(expertC);
ExpertRegistry.registerExpert(expertD);
ExpertRegistry.registerExpert(expertParallelSetup);
ExpertRegistry.registerExpert(expertParallelJoin);

// --- Benchmark Cases ---

// Scenario 1: Single Expert Execution
const chainManagerSingle = new ChainManager(['ExpertA']); // Pass expert names

suite.add('Single Expert Execution', {
  defer: true,
  fn: async (deferred: any) => {
    // Pass options to process method
    const currentContext = new AppContext(sampleInput, 'user1', 'session1');
    currentContext.state.set('initial_state_key', 'initial_state_value');
    await chainManagerSingle.process(sampleInput, currentContext, 'user1', 'session1', defaultChainOptions);
    deferred.resolve();
  },
});

// Scenario 2: Simple Sequential Chain Execution (2 Experts)
const chainManagerSequential = new ChainManager(['ExpertA', 'ExpertB']); // Pass expert names

suite.add('Sequential Chain (2 Experts)', {
  defer: true,
  fn: async (deferred: any) => {
    const currentContext = new AppContext(sampleInput, 'user1', 'session1');
    currentContext.state.set('initial_state_key', 'initial_state_value');
    await chainManagerSequential.process(sampleInput, currentContext, 'user1', 'session1', defaultChainOptions);
    deferred.resolve();
  },
});

// Scenario 3: Simple Parallel Chain Execution (2 Experts)
// ChainManager handles parallel execution based on its internal logic if experts are independent
// and options.executionMode is 'parallel' and maxConcurrency allows.
const chainManagerParallelExperts = new ChainManager(['ExpertC', 'ExpertD']);

suite.add('Parallel Chain (2 Independent Experts)', {
  defer: true,
  fn: async (deferred: any) => {
    const currentContext = new AppContext(sampleInput, 'user1', 'session1');
    currentContext.state.set('initial_state_key', 'initial_state_value');
    await chainManagerParallelExperts.process(
      sampleInput,
      currentContext,
      'user1',
      'session1',
      { ...defaultChainOptions, executionMode: 'parallel', maxConcurrency: 2 }
    );
    deferred.resolve();
  },
});


// Scenario 4: Sequential Chain with In-Memory Caching Enabled
const chainManagerSequentialCached = new ChainManager(['ExpertA', 'ExpertB']);
const cachedOptions: ChainOptions = {
  ...defaultChainOptions,
  cache: { enabled: true, type: 'memory', ttl: 3600 }
};

suite.add('Sequential Chain (2 Experts) with Memory Cache', {
  defer: true,
  setup: () => {
    // Cache clearing might be needed if benchmark.js doesn't isolate runs enough
    // or if the cache instance is shared and not reset.
    // For InMemoryCacheManager, a new instance per ChainManager or a clear method would be needed.
    // Assuming for now that each .process call with caching will behave as expected for the test.
  },
  fn: async (deferred: any) => {
    const currentContextRun1 = new AppContext(sampleInput, 'user1', 'session1');
    currentContextRun1.state.set('initial_state_key', 'initial_state_value');
    // First run will populate the cache
    await chainManagerSequentialCached.process(sampleInput, currentContextRun1, 'user1', 'session1', cachedOptions);

    const currentContextRun2 = new AppContext(sampleInput, 'user1', 'session1');
    currentContextRun2.state.set('initial_state_key', 'initial_state_value');
    // Subsequent runs should hit cache
    await chainManagerSequentialCached.process(sampleInput, currentContextRun2, 'user1', 'session1', cachedOptions);
    deferred.resolve();
  },
});


// --- Suite Event Handlers ---
suite
  .on('cycle', (event: Benchmark.Event) => {
    console.log(String(event.target));
    if ((event.target as any).error) { // Cast to any to access error property
      console.error('Error in benchmark:', (event.target as any).error);
    }
  })
  .on('start', () => {
    console.log('Starting benchmark suite: Chain Performance...');
  })
  .on('complete', function(this: Benchmark.Suite) {
    console.log('Benchmark suite complete.');
    console.log('Fastest is ' + this.filter('fastest').map('name'));

    // Further analysis could be done here, e.g., comparing cached vs. non-cached
    // Convert suite to array to use find
    const benchmarksArray = Array.from(this as any) as any[]; // Cast to any array
    const cachedRun: any = benchmarksArray.find(bench => bench.name === 'Sequential Chain (2 Experts) with Memory Cache');
    const nonCachedRun: any = benchmarksArray.find(bench => bench.name === 'Sequential Chain (2 Experts)');

    if (cachedRun && nonCachedRun && typeof cachedRun.hz === 'number' && typeof nonCachedRun.hz === 'number') { // Check for hz property and type
        const improvement = ((nonCachedRun.hz - cachedRun.hz) / nonCachedRun.hz) * 100;
        console.log(`Caching improvement for Sequential Chain: ${improvement.toFixed(2)}% faster`);
    } else {
        console.log('Could not compare cached vs non-cached runs (hz property missing, not a number, or runs not found).');
        if (cachedRun) console.log('Cached run details (name, hz, stats):', { name: cachedRun.name, hz: cachedRun.hz, stats: cachedRun.stats });
        if (nonCachedRun) console.log('Non-cached run details (name, hz, stats):', { name: nonCachedRun.name, hz: nonCachedRun.hz, stats: nonCachedRun.stats });
    }
  })
  .on('error', (event: Benchmark.Event) => {
    console.error('Error in benchmark suite:', (event.target as any).error); // Cast to any
  });

// --- Run the Suite ---
console.log('To run the benchmarks, ensure you have "benchmark" and "@types/benchmark" installed.');
console.log('You might need to compile this TypeScript file and then run the JavaScript output with Node.js.');
console.log('Example: tsc src/benchmarks/chainPerformance.ts --outDir dist/benchmarks && node dist/benchmarks/chainPerformance.js');
console.log('\nStarting benchmarks...\n');

// To actually run, you would typically execute the compiled JS file.
// For direct execution via ts-node or similar, this would be:
// suite.run({ async: true }); // Running in async mode

// For now, let's export it so it can be run from another script if needed.
export default suite;

// If this file is run directly (e.g., node dist/benchmarks/chainPerformance.js)
if (require.main === module) {
  suite.run({ async: true });
}