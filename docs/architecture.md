# Architecture Guide

This document describes the architecture of the Chain of Experts (CoE) application, its deployment infrastructure, and observability setup.

## 1. Chain of Experts Pattern (Application Level)

The core application implements the Chain of Experts pattern at the application logic level, rather than modifying the internal structure of an LLM like architectural CoE.

-   **Concept:** Multiple specialized components ("experts") process data sequentially. Each expert receives input (which may include the output of the previous expert) and produces an output that can be used by the next expert in the chain.
-   **Orchestration:** The [`ChainManager`](../src/chain/chainManager.ts:1) class orchestrates the flow, executing registered experts either **sequentially** (default) or in **parallel**, based on request options. It includes **retry logic** with exponential backoff to handle transient errors during individual expert processing in both modes.
-   **Context:** A [`ChainContext`](../src/chain/types.ts:1) object (implemented by [`AppContext`](../src/chain/context.ts:1)) is passed through the chain, allowing experts to access initial input and potentially read/write shared state (using the `context.state` map).
-   **Experts:** Experts implement the [`IExpert`](../src/experts/baseExpert.ts:8) interface. The [`ExpertRegistry`](../src/experts/index.ts:1) manages available experts, supporting dynamic registration and removal via API endpoints and the **Expert Manager UI**. Default experts include:
    -   [`DataRetrievalExpert`](../src/experts/expert1.ts:1): Retrieves documents based on a query.
    -   [`LLMSummarizationExpert`](../src/experts/expert2.ts:1): Summarizes input documents using a configured LLM provider.
-   **Extensibility:** New experts can be created by extending [`BaseExpert`](../src/experts/baseExpert.ts:14) and registered dynamically. The chain sequence is defined dynamically when processing requests via the API.

## 2. Application Architecture (TypeScript/Node.js)

The application is built using TypeScript and Node.js with Express for the API layer.

-   **`src/`**: Root directory for application source code.
    -   **`server.ts`**: Entry point, sets up the Express server and API endpoints (`/health`, `/api/experts` (GET, POST, PUT, DELETE), `/api/process` which accepts `executionMode`).
    -   **`config.ts`**: Handles configuration loading from environment variables and/or AWS Secrets Manager. Exports `configPromise` and `getConfig()`.
    -   **`chain/`**: Core CoE logic.
        -   `types.ts`: Defines core interfaces (`ChainInput`, `ChainOutput`, `ChainContext`, `RetryOptions`, `ExecutionMode`, `ChainOptions`, etc.).
        -   `chainManager.ts`: Implements the `ChainManager` class for orchestrating sequential and parallel expert execution, including retry logic and Langfuse tracing.
        -   `context.ts`: Implements the `AppContext` class for managing shared state.
        -   `errors.ts`: Defines custom error classes (`ChainError`, `ExpertError`, etc.).
    -   **`experts/`**: Expert implementations.
        -   `baseExpert.ts`: Defines the `IExpert` interface and `BaseExpert` abstract class.
        -   `expert1.ts`: `DataRetrievalExpert` implementation.
        -   `expert2.ts`: `LLMSummarizationExpert` implementation (uses LLM module).
        -   `index.ts`: Implements the `ExpertRegistry` for dynamic expert management.
    -   **`llm/`**: Module for LLM interactions.
        -   `types.ts`: Defines `LLMProvider` interface and common request/response types.
        -   `factory.ts`: Implements `LLMProviderFactory` singleton.
        -   `openai.ts`, `gemini.ts`: Concrete provider implementations.
    -   **`utils/`**: Utility functions (e.g., `logger.ts`).
-   **`frontend/`**: React frontend application.
    -   `App.tsx`: Main application component with chat interface.
    -   `components/`: Contains UI components like `ExpertManager.tsx` and `ChainVisualizer.tsx`.
-   **`package.json`**: Project dependencies and scripts (located at project root).
-   **`tsconfig.json`**: TypeScript compiler configuration (located at project root).
-   **`Dockerfile`**: Multi-stage Dockerfile for building the application container.
-   **`.dockerignore`**: Specifies files to exclude from the Docker build context.

## 3. Infrastructure Architecture (Terragrunt + Terraform Modules)

Infrastructure is defined using Terraform modules and orchestrated using Terragrunt for better organization and DRY principles, supporting multi-cloud deployment (AWS primary, GCP optional).

-   **`infra/`**: Root directory for infrastructure as code.
    -   **`terraform/`**: Contains Terraform configurations.
        -   **`main.tf`, `variables.tf`**: Define base Terraform provider requirements and global variables used by Terragrunt's root configuration.
        -   **`environments/`**: Environment-specific configurations for dev and prod.
        -   **`modules/`**: Contains reusable Terraform modules for specific cloud resources.
            -   **`aws_vpc/`**: Creates AWS VPC, subnets, NAT gateways, etc.
            -   **`aws_alb/`**: Creates AWS Application Load Balancer, listeners, target groups.
            -   **`aws_ecs_service/`**: Creates ECR repo, ECS cluster, task definition, service, IAM roles, etc.
            -   **`gcp_cloud_run/`**: Creates GCP Artifact Registry, Secret Manager secrets, Cloud Run service, IAM bindings, etc.
        -   **`providers/`**: Provider-specific configurations for AWS and GCP.
    -   **`terragrunt/`**: Contains Terragrunt configurations.
        -   `terragrunt.hcl`: Root configuration defining remote state backend (S3), common variables (e.g., project name, regions, tags), and provider generation.
        -   `aws/`: Contains AWS-specific configurations.
            -   `dev/`, `prod/`: Environment-specific directories.
                -   `terragrunt.hcl`: Defines environment-specific input variables (e.g., VPC CIDRs, instance counts).
                -   `vpc/`, `alb/`, `ecs/`: Component directories, each containing a `terragrunt.hcl` that includes the environment config, defines dependencies (e.g., ECS depends on ALB and VPC), specifies the Terraform module source (`../../../terraform/modules/...`), and provides component-specific inputs.
        -   `gcp/`: Contains GCP-specific configurations (similar structure for `dev`/`prod` and `cloud-run` component).

## 4. Observability Architecture (Langfuse)

Langfuse is integrated for end-to-end observability of the CoE application.

-   **Instrumentation:** The Langfuse TypeScript SDK is used within the `ChainManager` and potentially within individual experts.
-   **Data Captured:**
    -   **Traces:** Represent the full execution of a `/api/process` request. Tagged with `chain-of-experts`.
    -   **Spans:** Represent individual expert processing steps (e.g., `expert-1-data-retrieval-processing`). Include input, output, duration, metadata, and error/retry information.
    -   **Generations:** Represent LLM calls within experts (e.g., `llm-summarization-generation`). Include model, parameters, prompt, completion, token usage, cost, duration, metadata.
    -   **Scores:** Can be attached manually (e.g., via a feedback API) or automatically (via LLM-as-a-Judge) to traces or observations to track quality.
-   **Monitoring:** Dashboards (Task #13) and automated evaluations (Task #14) are configured within the Langfuse UI to provide insights into performance, cost, and quality.
-   **Standards:** Langfuse aligns with OpenTelemetry, allowing potential integration with broader observability ecosystems.