import { ChainInput, ChainContext } from './types';
import { v4 as uuidv4 } from 'uuid';

// Implementation of the ChainContext interface
export class AppContext implements ChainContext {
  // Read-only properties
  public readonly initialInput: ChainInput;
  public readonly userId: string;
  public readonly sessionId: string;
  public readonly traceId: string; // Consider linking to Langfuse trace ID

  // Mutable state using a Map
  public state: Map<string, any>;

  // Optional history tracking
  // public history: Array<{ expertName: string; input: any; output: any; timestamp: Date }>;

  constructor(initialInput: ChainInput, userId?: string, sessionId?: string) {
    this.initialInput = Object.freeze({ ...initialInput }); // Shallow freeze initial input
    this.userId = userId || `user-${uuidv4()}`;
    this.sessionId = sessionId || `session-${uuidv4()}`;
    this.traceId = uuidv4(); // Generate a unique ID for this context/trace
    this.state = new Map<string, any>();
    // this.history = [];
  }

  // --- State Management Methods ---

  get<T>(key: string): T | undefined {
    return this.state.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    // For immutability, you would create a new Map here instead of mutating
    // Example (without immer): this.state = new Map(this.state).set(key, value);
    this.state.set(key, value);
  }

  has(key: string): boolean {
    return this.state.has(key);
  }

  delete(key: string): boolean {
    // For immutability:
    // const newState = new Map(this.state);
    // const deleted = newState.delete(key);
    // this.state = newState;
    // return deleted;
    return this.state.delete(key);
  }

  clear(): void {
    // For immutability: this.state = new Map();
    this.state.clear();
  }

  // --- Optional History Methods ---
  // addHistory(record: { expertName: string; input: any; output: any; timestamp: Date }): void {
  //   // For immutability: this.history = [...this.history, record];
  //   this.history.push(record);
  // }
}