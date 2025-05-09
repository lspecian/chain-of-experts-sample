import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import './App.css';
import ExpertManager from './components/ExpertManager';
import ChainVisualizer from './components/ChainVisualizer';
import FeedbackPanel from './components/FeedbackPanel';
import ExpertParameterConfig from './components/ExpertParameterConfig';
import ChainResultsViewer from './components/ChainResultsViewer';
import { ExpertDashboard } from './components/ExpertManagement'; // Added import

// Define types for API interaction
interface ChainApiInput {
  input: {
    type: string;
    query?: string;
  };
  expertNames: string[];
  userId?: string;
  sessionId?: string;
  skipCache?: boolean;
  expertParameters?: Record<string, Record<string, string | number | boolean | undefined>>;
  options?: Record<string, unknown>;
}

type ApiResult = unknown | null;

// Define intermediate result type
interface IntermediateResult {
  expertName: string;
  expertType: string;
  expertIndex: number;
  input: unknown;
  output: unknown;
  timestamp: string;
}

// Define streaming event types
// Note: These types are temporarily unused while we use the regular endpoint
// They will be used again when we implement a proper streaming solution
/*
interface StreamInitEvent {
  type: 'init';
  traceId: string;
  experts: string[];
}

interface StreamIntermediateEvent {
  type: 'intermediate';
  result: IntermediateResult;
}

interface StreamFinalEvent {
  type: 'final';
  result: ApiResult;
  success: boolean;
  traceId: string;
  durationMs: number;
}

interface StreamErrorEvent {
  type: 'error';
  error: string;
  message: string;
  success: boolean;
}

type StreamEvent = StreamInitEvent | StreamIntermediateEvent | StreamFinalEvent | StreamErrorEvent;
*/

// Define token usage type
interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  provider?: string;
  model?: string;
}

interface ChainApiOutput {
  result: ApiResult;
  intermediateResults?: IntermediateResult[];
  traceId?: string;
  success: boolean;
  error?: string;
  durationMs?: number;
  tokenUsage?: TokenUsage;
}

// Define message types for the chat interface
interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  timestamp: string;
  resultData?: unknown; // Add resultData field for storing Chain of Experts results
}

function App() {
  // State for form inputs
  const [query, setQuery] = useState<string>('');
  const [selectedExperts, setSelectedExperts] = useState<string[]>(['data-retrieval', 'llm-summarization']);
  const [userId, setUserId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');

  // State for chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      content: 'Welcome to Chain of Experts! How can I help you today?',
      role: 'system',
      timestamp: new Date().toISOString()
    }
  ]);

  useEffect(() => {
    const handleAddMessage = (event: CustomEvent<ChatMessage>) => {
      setMessages(prev => [...prev, event.detail]);
    };

    window.addEventListener('add-message', handleAddMessage as EventListener);

    return () => {
      window.removeEventListener('add-message', handleAddMessage as EventListener);
    };
  }, []);
  
  // API Response State
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [result, setResult] = useState<ApiResult>(null); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [currentTraceId, setCurrentTraceId] = useState<string | undefined>(undefined);
  
  // Chain Processing State
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'completed' | 'error'>('idle');
  const [activeExpert, setActiveExpert] = useState<string | undefined>(undefined);
  const [useStreaming, setUseStreaming] = useState<boolean>(true);
  const [expertDetails, setExpertDetails] = useState<Record<string, {
    description?: string;
    input?: unknown;
    output?: unknown;
  }>>({});
  
  // UI State
  const [sidebarVisible, setSidebarVisible] = useState<boolean>(window.innerWidth > 768);
  const [darkMode, setDarkMode] = useState<boolean>(true);
  
  // Effect to handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarVisible(false);
      }
    };
    
    // Set initial state
    handleResize();
    
    // Add event listener
    window.addEventListener('resize', handleResize);
    
    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  const [showExpertManager, setShowExpertManager] = useState<boolean>(false);
  const [showExpertDashboard, setShowExpertDashboard] = useState<boolean>(false); // Added state for dashboard
  const [showChainVisualizer, setShowChainVisualizer] = useState<boolean>(true);
  const [streamingProgress, setStreamingProgress] = useState<number>(0);
  const [skipCache, setSkipCache] = useState<boolean>(false);
  const [expertParameters, setExpertParameters] = useState<Record<string, Record<string, string | number | boolean | undefined>>>({});

  // Available experts - will be fetched from API
  const [availableExperts, setAvailableExperts] = useState<string[]>(['data-retrieval', 'llm-summarization']);

  // Effect to set dark mode
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [darkMode]);
  
  // Fetch available experts from API
  useEffect(() => {
    const fetchExperts = async () => {
      try {
        const response = await fetch('/api/experts');
        if (response.ok) {
          const data = await response.json();
          if (data.experts && Array.isArray(data.experts)) {
            // Extract just the expert names for the checkboxes
            const expertNames = data.experts.map((expert: { name: string }) => expert.name);
            setAvailableExperts(expertNames);
          }
        }
      } catch (error) {
        console.error('Error fetching experts:', error);
      }
    };
    
    fetchExperts();
  }, []);

  const handleExpertChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.target;
    setSelectedExperts(prev =>
      checked ? [...prev, value] : prev.filter(expert => expert !== value)
    );
  };

  // Handle request errors
  const handleRequestError = (
    err: unknown,
    initialExpertDetails: Record<string, { description?: string; input?: unknown; output?: unknown }>
  ) => {
    // --- Error Path ---
    setProcessingStatus('error');
    
    // Update expert details to show error state potentially
    const errorExpertDetails = { ...initialExpertDetails };
    if (activeExpert && errorExpertDetails[activeExpert]) {
       // Mark the output of the failing expert with the error
       errorExpertDetails[activeExpert].output = { error: err instanceof Error ? err.message : "Processing failed" };
    }
    setExpertDetails(errorExpertDetails);

    if (err instanceof Error) {
      setError(err.message);
      
      // Add error message to chat
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: `Error: ${err.message}`,
        role: 'system',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    } else {
      setError('An unknown error occurred.');
      
      // Add generic error message to chat
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: "An unknown error occurred.",
        role: 'system',
        timestamp: new Date().toISOString()
      };
      
      setMessages(prev => [...prev, errorMessage]);
    }
    console.error("API call failed:", err);
  };

  // Handle streaming request
  const handleStreamingRequest = async (
    apiRequestBody: ChainApiInput
  ) => {
    try {
      // Since we can't use EventSource with POST, we'll use the regular endpoint
      // and simulate streaming behavior
      console.log('Using regular endpoint with streaming simulation');
      
      // Use the regular endpoint
      await handleRegularRequest(apiRequestBody, {}, apiRequestBody.input.query as string);
      
      // For now, we'll disable streaming and use the regular endpoint
      // This is a temporary fix until we implement a proper streaming solution
      // that works with POST requests
      
      // In a production environment, you might want to:
      // 1. Modify the backend to accept GET requests for streaming
      // 2. Use a library like fetch-event-source that supports POST for SSE
      // 3. Implement a WebSocket solution instead of SSE
    } catch (error) {
      console.error('Streaming error:', error);
      throw error;
    }
  };

  // Handle regular request
  const handleRegularRequest = async (
    apiRequestBody: ChainApiInput,
    initialExpertDetails: Record<string, { description?: string; input?: unknown; output?: unknown }>,
    currentQuery: string
  ) => {
    console.log("handleRegularRequest: Making API request to /api/process");
    
    let data: ChainApiOutput; // Declare data variable at the function scope
    
    try {
      console.log("handleRegularRequest: About to make fetch request to /api/process");
      console.log("handleRegularRequest: Request body:", JSON.stringify(apiRequestBody));
      
      let response;
      try {
        console.log("handleRegularRequest: Calling fetch...");
        response = await fetch('/api/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(apiRequestBody),
        });
        
        console.log("handleRegularRequest: Received response:", response.status, response.statusText);
      } catch (fetchError) {
        console.error("Fetch error:", fetchError);
        throw fetchError;
      }

      // Check if response is ok before trying to parse JSON
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Try to parse the JSON response with error handling
      try {
        const responseText = await response.text();
        console.log("Raw response text:", responseText);
        data = JSON.parse(responseText) as ChainApiOutput;
      } catch (jsonError) {
        console.error("JSON parsing error:", jsonError);
        throw new Error("Failed to parse API response as JSON. The server may be returning an invalid response.");
      }

      console.log("Parsed API response:", data);

      // Check if the parsed data indicates success
      if (!data.success) {
        throw new Error(data.error || "API returned unsuccessful response");
      }
    } catch (error) {
      console.error("Error in handleRegularRequest:", error);
      throw error;
    }

    setResult(data.result);
    
    // Store the trace ID for feedback
    if (data.traceId) {
      setCurrentTraceId(data.traceId);
      console.log("Trace ID for feedback:", data.traceId);
    }
    
    // --- Success Path ---
    setProcessingStatus('completed');
    setActiveExpert(undefined); // No expert is active after completion
      
    // Use actual intermediate results from the backend if available
    const finalExpertDetails = { ...initialExpertDetails }; // Start from initial state
    
    // Log the full response data to debug
    console.log("Full API response data:", data);
    console.log("intermediateResults property exists:", Object.prototype.hasOwnProperty.call(data, 'intermediateResults'));
    console.log("intermediateResults type:", data.intermediateResults ? typeof data.intermediateResults : 'undefined');
    console.log("intermediateResults length:", data.intermediateResults ? data.intermediateResults.length : 0);
    
    // Add a message to indicate whether we're using real or simulated results
    const usingRealResults = data.intermediateResults && data.intermediateResults.length > 0;
    const intermediateResultsCount = data.intermediateResults?.length || 0;
    
    // Add a user message to show if we're using real or simulated results
    const debugMessage: ChatMessage = {
      id: `debug-${Date.now()}`,
      content: usingRealResults
        ? `Using REAL intermediate results (count: ${intermediateResultsCount})`
        : "Using SIMULATED intermediate results",
      role: 'system',
      timestamp: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, debugMessage]);
    
    if (usingRealResults) {
      // Use actual intermediate results from the backend
      console.log("Using actual intermediate results:", data.intermediateResults);
      data.intermediateResults?.forEach((result) => {
        console.log("Processing intermediate result for expert:", result.expertName);
        finalExpertDetails[result.expertName] = {
          ...finalExpertDetails[result.expertName],
          description: `${result.expertType} expert`,
          input: result.input,
          output: result.output,
        };
      });
    } else {
      // Fallback to simulation if no intermediate results are available
      console.log("No intermediate results available, using simulation");
      console.log("Selected experts for simulation:", selectedExperts);
      let currentVisualInput: unknown = { query: currentQuery };
      selectedExperts.forEach((expertName, index) => {
        let currentVisualOutput: unknown;
        // Simulate output based on position
        if (index === selectedExperts.length - 1) {
          currentVisualOutput = data.result; // Last expert's output is the final result
          console.log(`Simulating final output for ${expertName}:`, currentVisualOutput);
        } else if (expertName === 'data-retrieval') {
          currentVisualOutput = { documents: ["Simulated document 1", "Simulated document 2"] };
          console.log(`Simulating data-retrieval output:`, currentVisualOutput);
        } else {
          currentVisualOutput = { intermediateResult: `Output from ${expertName}` };
          console.log(`Simulating generic output for ${expertName}:`, currentVisualOutput);
        }
        
        finalExpertDetails[expertName] = {
          ...finalExpertDetails[expertName],
          input: currentVisualInput,
          output: currentVisualOutput,
        };
        currentVisualInput = currentVisualOutput; // Output of one becomes input for the next (visually)
      });
    }
    
    setExpertDetails(finalExpertDetails);
    
    // Add assistant response to chat
    // Create a message with the ChainResultsViewer component
    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      content: 'Chain of Experts Result',
      role: 'assistant',
      timestamp: new Date().toISOString(),
      // Include the full result data with durationMs and tokenUsage
      resultData: {
        result: data.result,
        durationMs: data.durationMs,
        tokenUsage: data.tokenUsage,
        traceId: data.traceId,
        summary: typeof data.result === 'object' && data.result && 'summary' in data.result
          ? (data.result as { summary: string }).summary
          : undefined
      }
    };
    
    setMessages(prev => [...prev, assistantMessage]);
  };

  // Main send message handler
  const handleSendMessage = async (event?: FormEvent) => {
    // Add direct console.log statements
    console.log("HANDLE SEND MESSAGE CALLED");
    console.log("Query:", query);
    console.log("Selected experts:", selectedExperts);
    
    if (event) {
      event.preventDefault();
    }

    if (!query.trim()) {
      console.log("Query is empty, returning");
      return;
    }
    
    // Log every step of the process
    console.log("Step 1: Adding user message to chat");

    console.log("Step 1: Adding user message to chat");
    // Add user message to chat
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: query,
      role: 'user',
      timestamp: new Date().toISOString()
    };
    
    console.log("User message:", userMessage);
    setMessages(prev => [...prev, userMessage]);
    
    // Clear input
    const currentQuery = query;
    setQuery('');
    
    console.log("Step 2: Resetting state for new request");
    // Reset state for new request
    setLoading(true);
    setError(null);
    setResult(null);
    setCurrentTraceId(undefined);
    setProcessingStatus('processing');
    setActiveExpert(selectedExperts.length > 0 ? selectedExperts[0] : undefined);
    setStreamingProgress(0);
    
    // Initialize expert details for visualization
    const initialExpertDetails: Record<string, { description?: string; input?: unknown; output?: unknown }> = {};
    let visualInputForNext: unknown = { query: currentQuery };
    selectedExperts.forEach((expertName) => {
      initialExpertDetails[expertName] = {
        description: `Details for ${expertName}`,
        input: visualInputForNext,
        output: undefined
      };
      visualInputForNext = { intermediate_placeholder: `Output of ${expertName}` };
    });
    setExpertDetails(initialExpertDetails);

    try {
      console.log("Step 3: Preparing API request body");
      const apiRequestBody: ChainApiInput = {
        input: {
          type: 'query',
          query: currentQuery,
        },
        expertNames: selectedExperts,
        userId: userId || undefined,
        sessionId: sessionId || undefined,
        skipCache: skipCache,
        expertParameters: expertParameters
      };

      console.log("API request body:", apiRequestBody);

      if (useStreaming) {
        // Use streaming endpoint
        console.log("Step 4a: Using streaming endpoint");
        await handleStreamingRequest(apiRequestBody);
      } else {
        // Use regular endpoint
        console.log("Step 4b: Using regular endpoint");
        await handleRegularRequest(apiRequestBody, initialExpertDetails, currentQuery);
      }
    } catch (err: unknown) {
      handleRequestError(err, initialExpertDetails);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`chat-app ${darkMode ? 'dark' : 'light'}`}>
      {/* Sidebar */}
      {sidebarVisible && (
        <div className="sidebar">
          <button
            className="sidebar-close-btn"
            onClick={() => {
              console.log("Close button clicked");
              setSidebarVisible(false);
            }}
            aria-label="Close sidebar"
          >
            ×
          </button>
          <div className="sidebar-header">
            <h2>Chain of Experts</h2>
            <button 
              className="toggle-theme-btn"
              onClick={() => setDarkMode(!darkMode)}
              aria-label="Toggle dark mode"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
          
          <div className="sidebar-content">
            <div className="settings-section">
              <h3>Settings</h3>
              
              <div className="expert-selection">
                <div className="expert-header">
                  <h4>Select Experts:</h4>
                  <button
                    className="manage-experts-btn"
                    onClick={() => setShowExpertManager(!showExpertManager)}
                  >
                    {showExpertManager ? 'Hide Manager' : 'Manage Experts'}
                  </button>
                  <button className="manage-experts-btn" onClick={() => setShowExpertDashboard(!showExpertDashboard)}>
                    {showExpertDashboard ? 'Hide Dashboard' : 'Show Dashboard'}
                  </button>
                </div>
                
                {/* Chain Visualizer Toggle */}
                <div className="visualizer-toggle">
                  <button
                    className="toggle-visualizer-btn"
                    onClick={() => setShowChainVisualizer(!showChainVisualizer)}
                  >
                    {showChainVisualizer ? 'Hide Chain Visualizer' : 'Show Chain Visualizer'}
                  </button>
                </div>
                
                {/* Streaming Toggle */}
                <div className="streaming-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={useStreaming}
                      onChange={() => setUseStreaming(!useStreaming)}
                    />
                    <span className="toggle-text">Use Streaming</span>
                  </label>
                </div>
                
                {/* Cache Toggle */}
                <div className="cache-toggle">
                  <label className="toggle-label">
                    <input
                      type="checkbox"
                      checked={skipCache}
                      onChange={() => setSkipCache(!skipCache)}
                    />
                    <span className="toggle-text">Skip Cache</span>
                  </label>
                </div>
                
                {/* Expert Parameter Configuration */}
                <div className="expert-parameters-section">
                  <h4>Expert Parameters</h4>
                  {selectedExperts.map(expertName => (
                    <ExpertParameterConfig
                      key={expertName}
                      expertName={expertName}
                      parameters={expertParameters[expertName] || {}}
                      onParametersChange={(expertName, parameters) => {
                        setExpertParameters(prev => ({
                          ...prev,
                          [expertName]: parameters
                        }));
                      }}
                      darkMode={darkMode}
                    />
                  ))}
                </div>
                
                {showChainVisualizer && (
                  <ChainVisualizer
                    experts={selectedExperts}
                    activeExpert={activeExpert}
                    processingStatus={processingStatus}
                    expertDetails={expertDetails}
                    onExpertClick={(expertName) => {
                      setActiveExpert(expertName);
                    }}
                  />
                )}
                
                {showExpertManager && (
                  <ExpertManager />
                )}
                
                <div className="expert-checkboxes">
                  {availableExperts.map(expert => (
                    <div key={expert} className="expert-option">
                      <input
                        type="checkbox"
                        id={`expert-${expert}`}
                        value={expert}
                        checked={selectedExperts.includes(expert)}
                        onChange={handleExpertChange}
                      />
                      <label htmlFor={`expert-${expert}`}>{expert}</label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="form-group">
                <label htmlFor="userId">User ID (Optional):</label>
                <input
                  type="text"
                  id="userId"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="sessionId">Session ID (Optional):</label>
                <input
                  type="text"
                  id="sessionId"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Chat Area */}
      <div className="chat-container">
        {showExpertDashboard ? (
          <ExpertDashboard />
        ) : (
          <>
            <div className="chat-header">
              <button
                className="toggle-sidebar-btn"
                onClick={() => {
                  const newValue = !sidebarVisible;
                  console.log("Toggling sidebar:", newValue);
                  setSidebarVisible(newValue);
                }}
                aria-label="Toggle sidebar"
              >
                {sidebarVisible ? '◀' : '▶'}
              </button>
              <h2>Chain of Experts Chat</h2>
            </div>

            <div className="messages-container">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.role === 'user' ? 'user-message' :
                    message.role === 'assistant' ? 'assistant-message' : 'system-message'}`}
                >
                  <div className="message-content">
                    {message.role === 'assistant' && message.resultData ? (
                      <ChainResultsViewer
                        data={message.resultData}
                        darkMode={darkMode}
                      />
                    ) : (
                      message.content
                    )}
                  </div>
                  <div className="message-timestamp">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="message system-message">
                  {useStreaming && streamingProgress > 0 ? (
                    <div className="streaming-progress">
                      <div className="progress-bar">
                        <div
                          className="progress-bar-fill"
                          style={{ width: `${streamingProgress}%` }}
                        ></div>
                      </div>
                      <div className="progress-text">
                        Processing: {Math.round(streamingProgress)}%
                      </div>
                    </div>
                  ) : (
                    <div className="loading-indicator">
                      <div className="dot"></div>
                      <div className="dot"></div>
                      <div className="dot"></div>
                    </div>
                  )}
                </div>
              )}

              {/* Feedback Panel - Show only when processing is completed and we have a traceId */}
              {processingStatus === 'completed' && currentTraceId && (
                <div className="feedback-container">
                  <FeedbackPanel
                    traceId={currentTraceId}
                    darkMode={darkMode}
                    onFeedbackSubmitted={() => console.log("Feedback submitted for trace:", currentTraceId)}
                  />
                </div>
              )}
            </div>

            <div className="message-input-container">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type your message here..."
                disabled={loading}
                onKeyPress={(e) => {
                  console.log("Key pressed:", e.key);
                  if (e.key === 'Enter' && query.trim() && !loading) {
                    console.log("Enter key pressed, calling handleSendMessage");
                    handleSendMessage();
                  }
                }}
              />
              <button
                type="button"
                disabled={loading || !query.trim()}
                className="send-button"
                onClick={() => {
                  console.log("Send button clicked");
                  console.log("Query:", query);
                  console.log("Selected experts:", selectedExperts);
                  handleSendMessage();
                }}
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
