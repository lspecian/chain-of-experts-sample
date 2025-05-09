import { addDocuments } from './chromaClient';
import { logger } from '../utils/logger';

// Sample documents about various topics
const sampleDocuments = [
  {
    text: "The Chain of Experts pattern is an architectural approach where multiple specialized components (experts) process data sequentially. Each expert performs a specific task and passes its output to the next expert in the chain. This pattern is particularly useful for complex workflows that require different types of processing or analysis at different stages.",
    metadata: {
      title: "Chain of Experts Pattern",
      category: "Software Architecture",
      source: "Internal Documentation"
    }
  },
  {
    text: "Vector databases are specialized database systems designed to store, index, and query high-dimensional vectors efficiently. They are commonly used in machine learning applications for similarity search, recommendation systems, and natural language processing. Popular vector databases include Pinecone, Weaviate, Milvus, and ChromaDB.",
    metadata: {
      title: "Vector Databases Overview",
      category: "Database Technology",
      source: "Tech Documentation"
    }
  },
  {
    text: "Langfuse is an open-source observability platform designed specifically for LLM applications. It provides tracing, monitoring, and evaluation capabilities for large language model applications. With Langfuse, developers can track prompts, completions, and metrics to optimize their LLM-powered systems.",
    metadata: {
      title: "Langfuse Observability",
      category: "Monitoring",
      source: "Langfuse Documentation"
    }
  },
  {
    text: "Prompt engineering is the process of designing and optimizing prompts for large language models to elicit desired responses. Effective prompt engineering involves understanding the model's capabilities, limitations, and the specific task requirements. Techniques include few-shot learning, chain-of-thought prompting, and structured output formatting.",
    metadata: {
      title: "Prompt Engineering Techniques",
      category: "AI",
      source: "Research Paper"
    }
  },
  {
    text: "TypeScript is a strongly typed programming language that builds on JavaScript. It adds static type definitions to JavaScript, providing better tooling, error checking, and developer experience. TypeScript code is transpiled to JavaScript, making it compatible with all JavaScript environments.",
    metadata: {
      title: "TypeScript Overview",
      category: "Programming Languages",
      source: "TypeScript Documentation"
    }
  },
  {
    text: "React is a JavaScript library for building user interfaces. It allows developers to create reusable UI components and manage application state efficiently. React uses a virtual DOM to optimize rendering performance and provides a declarative approach to building UIs.",
    metadata: {
      title: "React Framework",
      category: "Web Development",
      source: "React Documentation"
    }
  },
  {
    text: "Express.js is a minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications. It is designed for building web applications and APIs and has been called the de facto standard server framework for Node.js.",
    metadata: {
      title: "Express.js Framework",
      category: "Web Development",
      source: "Express Documentation"
    }
  },
  {
    text: "Terraform is an infrastructure as code tool that allows you to build, change, and version infrastructure safely and efficiently. It enables developers to define both cloud and on-prem resources in human-readable configuration files that can be versioned, reused, and shared.",
    metadata: {
      title: "Terraform IaC",
      category: "DevOps",
      source: "HashiCorp Documentation"
    }
  },
  {
    text: "Docker is a platform for developing, shipping, and running applications in containers. Containers are lightweight, portable, and self-sufficient environments that include everything needed to run an application. Docker simplifies deployment and ensures consistency across different environments.",
    metadata: {
      title: "Docker Containerization",
      category: "DevOps",
      source: "Docker Documentation"
    }
  },
  {
    text: "Kubernetes is an open-source container orchestration platform that automates the deployment, scaling, and management of containerized applications. It groups containers into logical units for easy management and discovery, and provides features like service discovery, load balancing, and self-healing.",
    metadata: {
      title: "Kubernetes Orchestration",
      category: "DevOps",
      source: "Kubernetes Documentation"
    }
  }
];

/**
 * Populate the vector database with sample documents
 */
async function populateDatabase() {
  try {
    logger.info('Starting to populate vector database with sample documents');
    
    const collectionName = 'sample_documents';
    const documents = sampleDocuments.map(doc => doc.text);
    const metadatas = sampleDocuments.map(doc => doc.metadata);
    const ids = sampleDocuments.map((_, index) => `doc_${index}`);
    
    await addDocuments(collectionName, documents, metadatas, ids);
    
    logger.info('Successfully populated vector database with sample documents');
  } catch (error) {
    logger.error('Failed to populate vector database', error instanceof Error ? error : undefined);
    throw error;
  }
}

// Execute if this script is run directly
if (require.main === module) {
  populateDatabase()
    .then(() => {
      logger.info('Database population completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Database population failed', error);
      process.exit(1);
    });
}

export { populateDatabase };