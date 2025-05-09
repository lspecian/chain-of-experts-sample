# Chain of Experts Application

This repository contains a TypeScript implementation of a "Chain of Experts" (CoE) LLM application featuring dynamic expert management, resilient processing with retries, multi-cloud deployment using Terragrunt/Terraform (AWS primary, GCP optional), and observability using Langfuse.

## Architecture

The application implements a Chain of Experts pattern where multiple specialized components (experts) process data sequentially. Key features include:

-   **Dynamic Expert Management**: A UI allows creating, configuring, and removing custom experts at runtime.
-   **Resilient Processing**: Includes retry logic with exponential backoff for handling transient errors during expert execution.
-   **Parallel Execution**: Supports running experts concurrently for tasks that allow parallel processing (e.g., processing multiple inputs independently).
-   **Modular LLM Interaction**: A dedicated module handles interactions with different LLM providers (OpenAI, Gemini).
-   **Vector Database Integration**: Uses ChromaDB for document retrieval (can be extended).
-   **Multi-Cloud Deployment**: Infrastructure managed by Terragrunt and Terraform modules for AWS (primary) and GCP (optional).
-   **Observability**: Integrated with Langfuse for detailed tracing and monitoring of chain executions and LLM calls.

The default chain includes:
1.  **Data Retrieval Expert**: Retrieves relevant documents.
2.  **LLM Summarization Expert**: Summarizes retrieved documents.

See the [Architecture Guide](docs/architecture.md) for more details.

## Prerequisites

- Node.js 20.x
- npm (or yarn)
- Docker and Docker Compose (for running ChromaDB locally)
- Terraform v1.5+
- Terragrunt v0.45+ (for cloud deployment)
- AWS CLI (configured with credentials)
- Google Cloud SDK (optional, configured if deploying to GCP)
- Langfuse account and API keys
- OpenAI API key (and/or Google API key if using Gemini)

## Local Development

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Create a `.env` file** in the project root with the required environment variables:
    ```dotenv
    # Langfuse Configuration
    LANGFUSE_SECRET_KEY=your_langfuse_secret_key
    LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
    LANGFUSE_BASEURL=https://cloud.langfuse.com # Or your self-hosted URL

    # LLM Provider Configuration
    DEFAULT_LLM_PROVIDER=openai # Options: openai, gemini

    # OpenAI Configuration
    OPENAI_API_KEY=your_openai_api_key
    OPENAI_MODEL=gpt-4o # Options: gpt-4o, gpt-4-turbo, gpt-3.5-turbo

    # Google Gemini Configuration (Optional)
    GOOGLE_API_KEY=your_gemini_api_key
    GEMINI_MODEL=gemini-1.5-pro # Options: gemini-1.5-pro, gemini-1.5-flash, gemini-1.0-pro

    # Optional: For local Terraform testing (if applicable)
    # AWS_ACCESS_KEY_ID=...
    # AWS_SECRET_ACCESS_KEY=...
    # AWS_REGION=...
    ```
4.  **Start the ChromaDB vector database:**
    ```bash
    npm run db:start
    ```
5.  **Initialize the vector database with sample documents:**
    ```bash
    npm run db:init
    ```
6.  **Run the development server:**
    ```bash
    npm run dev
    ```
    
    Alternatively, you can run all of the above with a single command:
    ```bash
    npm run start:all
    ```
7.  The API will be available at http://localhost:8080 (or the port specified in `config.ts`).

## Features

### Expert Management UI
The application includes a UI section (accessible via the sidebar) for managing experts:
- View currently registered experts and their configurations.
- Create new custom experts (Note: requires backend implementation for custom logic).
- Edit the description and parameters of custom experts.
- Delete custom experts (built-in experts are protected).

### Chain Visualization
A visual representation of the selected expert chain is displayed in the sidebar, showing the flow and status of each expert during processing.

### Retry Logic
The `ChainManager` automatically retries failed expert processing steps using exponential backoff (default 3 attempts) to handle transient errors.

## API Endpoints

### `GET /health`
Health check endpoint. Returns `{"status": "ok"}`.

### `GET /api/experts`
Returns a list of configurations for all available experts.
Response Example:
```json
{
  "experts": [
    {
      "name": "data-retrieval",
      "description": "Retrieves relevant documents based on a query",
      "parameters": {},
      "factory": "Function"
    },
    {
      "name": "llm-summarization",
      "description": "Summarizes documents using an LLM",
      "parameters": {},
      "factory": "Function"
    }
    // ... other experts
  ]
}
```

### `GET /api/experts/:name`
Returns the configuration for a specific expert.

### `POST /api/experts`
Registers a new custom expert (requires backend logic for the factory).
Request Body: `{ "name": "my-custom-expert", "description": "...", "parameters": {...} }`

### `PUT /api/experts/:name`
Updates the description and parameters of an existing custom expert.
Request Body: `{ "description": "...", "parameters": {...} }`

### `DELETE /api/experts/:name`
Deletes a custom expert (cannot delete built-in experts).

### `POST /api/process`
Processes input through the specified chain of experts. Handles retries internally. Supports sequential (default) and parallel execution modes.

**Request Body Example (Parallel):**
```json
{
  "input": { ... },
  "expertNames": ["expertA", "expertB"],
  "options": {
    "executionMode": "parallel"
  }
}
```

**Success Response (Parallel Example):**
```json
{
  "result": {
    "expertA": { /* output from expertA */ },
    "expertB": { /* output from expertB */ }
  },
  "success": true
}
```

**Request Body:**
```json
{
  "input": {
    "type": "query", 
    "query": "What is the Chain of Experts pattern?" 
    // Add other input fields as needed by experts
  },
  "expertNames": ["data-retrieval", "llm-summarization"], // Order matters
  "userId": "user-123", // Optional
  "sessionId": "session-456" // Optional
}
```

**Success Response (Example):**
```json
{
  "result": { // Output from the *last* expert in the chain
    "summary": "The Chain of Experts pattern involves sequential processing...",
    "summaryLength": 123,
    "tokenUsage": {
      "promptTokens": 50,
      "completionTokens": 73,
      "totalTokens": 123
    }
  },
  "success": true
}
```

**Error Response (Example):**
```json
{
  "result": null,
  "success": false,
  "error": "Error in expert 'llm-summarization': LLM failed to generate a summary."
}
```

## Vector Database

The application uses ChromaDB as a vector database for storing and retrieving documents based on semantic similarity. The DataRetrievalExpert queries this database to find documents relevant to the user's query.

### Database Structure

- **Collection**: `sample_documents` - Contains sample documents about various topics
- **Document Format**: Each document has text content and metadata (title, category, source)
- **Embedding Model**: OpenAI's text-embedding-ada-002 model is used for creating embeddings

### Managing the Vector Database

- **Start ChromaDB**: `npm run db:start` (runs ChromaDB in a Docker container)
- **Stop ChromaDB**: `npm run db:stop` (stops and removes the Docker container)
- **Initialize Database**: `npm run db:init` (checks if ChromaDB is running and populates it with sample documents)
- **Populate Database**: `npm run db:populate` (adds sample documents to the database)

### Adding Custom Documents

To add your own documents to the vector database, modify the `sampleDocuments` array in `src/vectordb/populateDb.ts` or create a new script that uses the `addDocuments` function from `src/vectordb/chromaClient.ts`.

## Testing

The project uses Jest for automated testing of the backend components.

- **Run all tests:**
  ```bash
  npm run test
  ```
- **Run tests with coverage:**
  ```bash
  npm run test -- --coverage
  ```
- **Run specific test file:**
  ```bash
  npm run test -- src/tests/experts/dataRetrievalExpert.spec.ts
  ```

Test files are located in the `src/tests` directory.

## Deployment

The application is deployed using Terragrunt, which orchestrates Terraform modules for AWS (primary) and GCP (optional). See the [Deployment Guide](docs/deployment.md) for detailed instructions on setting up the backend and running Terragrunt commands.

A GitHub Actions workflow in `.github/workflows/deploy.yml` is provided for automated CI/CD.

## Monitoring

The application is instrumented with Langfuse for LLM observability. See the [Monitoring Guide](docs/monitoring.md) for details on how to use the Langfuse dashboard and evaluators.

## License

MIT