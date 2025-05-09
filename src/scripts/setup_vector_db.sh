#!/bin/bash

# Exit on error
set -e

echo "Setting up ChromaDB for the Chain of Experts application..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "Error: Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create data directory if it doesn't exist
mkdir -p ./src/vectordb/data

# Start ChromaDB using Docker Compose
echo "Starting ChromaDB..."
docker-compose up -d chromadb

# Wait for ChromaDB to start
echo "Waiting for ChromaDB to start..."
sleep 5

# Check if ChromaDB is running
echo "Checking if ChromaDB is running..."
if ! curl -s http://localhost:8000/api/v1/heartbeat > /dev/null; then
    echo "Error: ChromaDB is not running. Please check the Docker logs."
    echo "You can check the logs with: docker-compose logs chromadb"
    exit 1
fi

echo "ChromaDB is running successfully!"

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Warning: OPENAI_API_KEY environment variable is not set."
    echo "You need to set it to embed documents in ChromaDB."
    echo "You can set it with: export OPENAI_API_KEY=your_api_key"
    exit 1
fi

# Create sample documents directory
SAMPLE_DIR="./src/vectordb/sample_docs"
mkdir -p "$SAMPLE_DIR"

# Create sample documents if they don't exist
if [ ! -f "$SAMPLE_DIR/chain_of_experts.md" ]; then
    echo "Creating sample documents..."
    
    cat > "$SAMPLE_DIR/chain_of_experts.md" << EOL
# Chain of Experts Pattern

The Chain of Experts pattern is an architectural approach where multiple specialized components (experts) process data sequentially. Each expert performs a specific task and passes its output to the next expert in the chain.

## Key Characteristics

- **Specialization**: Each expert focuses on a specific task or domain.
- **Sequential Processing**: Data flows through the chain in a defined order.
- **Composability**: Experts can be added, removed, or reordered as needed.
- **Loose Coupling**: Experts communicate through well-defined interfaces.

## Use Cases

- Complex data processing pipelines
- Multi-stage AI/ML workflows
- Document processing and analysis
- Decision-making systems

## Benefits

- Improved modularity and maintainability
- Better separation of concerns
- Easier testing and debugging
- Flexibility to adapt to changing requirements
EOL

    cat > "$SAMPLE_DIR/vector_databases.md" << EOL
# Vector Databases

Vector databases are specialized database systems designed to store, index, and query high-dimensional vectors efficiently. They are commonly used in machine learning applications for similarity search, recommendation systems, and natural language processing.

## Popular Vector Databases

- **Pinecone**: Fully managed vector database service
- **Weaviate**: Open-source vector search engine
- **Milvus**: Open-source vector database for similarity search
- **ChromaDB**: Open-source embedding database

## Key Features

- **Vector Indexing**: Efficient algorithms for nearest neighbor search
- **Similarity Search**: Find vectors that are similar to a query vector
- **Metadata Filtering**: Filter results based on metadata
- **Scalability**: Handle large numbers of vectors and high query throughput

## Use Cases

- Semantic search
- Recommendation systems
- Image similarity
- Anomaly detection
- Natural language processing
EOL

    cat > "$SAMPLE_DIR/langfuse.md" << EOL
# Langfuse Observability

Langfuse is an open-source observability platform designed specifically for LLM applications. It provides tracing, monitoring, and evaluation capabilities for large language model applications.

## Key Features

- **Tracing**: Track prompts, completions, and metrics
- **Monitoring**: Monitor LLM usage, latency, and costs
- **Evaluation**: Evaluate LLM outputs with human feedback or automated scoring
- **Analytics**: Analyze LLM performance and usage patterns

## Benefits

- Improve LLM application quality
- Reduce costs by optimizing prompt usage
- Debug complex LLM workflows
- Track user feedback and model performance

## Integration

Langfuse can be integrated with various LLM providers, including:
- OpenAI
- Anthropic
- Google Gemini
- Mistral AI
- Open-source models
EOL

fi

# Embed sample documents in ChromaDB
echo "Embedding sample documents in ChromaDB..."
cd "$(dirname "$0")/../.."
npx ts-node src/vectordb/embed_documents.ts directory "$SAMPLE_DIR" documents 1000

echo "Vector database setup completed successfully!"
echo "You can now use the DataRetrievalExpert with real vector database integration."