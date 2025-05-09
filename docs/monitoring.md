# Monitoring Guide

This guide explains how to monitor the Chain of Experts application using Langfuse.

## Langfuse Overview

Langfuse is an open-source LLM observability platform used in this project to trace requests, monitor performance, evaluate quality, and debug issues within the Chain of Experts application.

The application code ([`src/chain/chainManager.ts`](src/chain/chainManager.ts:1), [`src/experts/*.ts`](src/experts/expert1.ts:1)) is instrumented using the Langfuse TypeScript SDK to send telemetry data (traces, spans, generations, scores) to your configured Langfuse instance.

## Accessing Langfuse

1.  Log in to your Langfuse UI (either the cloud version or your self-hosted instance).
2.  Select the project you created for this application (e.g., "Chain of Experts - Prod").

## Key Monitoring Features

### 1. Traces

Traces provide an end-to-end view of a single request processed by the Chain of Experts.

-   **Finding Traces:** Navigate to the "Traces" section. You can filter traces by name (e.g., "chain-of-experts"), user ID, session ID, tags, or time range.
-   **Trace View:** Clicking on a trace shows:
    -   Overall trace metadata (name, user, session, tags, duration, cost).
    -   Input and final output of the entire chain.
    -   A hierarchical view (timeline or tree) of the "Observations" within the trace.
-   **Observations:** These represent individual steps:
    -   **Spans:** Represent non-LLM operations or the overall processing attempt(s) for an expert. Show input, final output (if successful), duration, metadata (including retry attempts if applicable), and error status/message if applicable.
    -   **Generations:** Represent LLM calls (like the summarization in `LLMSummarizationExpert`). Show input (prompt/messages), output (completion), model parameters, token usage, calculated cost, duration, metadata.

Use the trace view to understand the flow, identify bottlenecks (long durations), and debug errors. When retries occur for an expert, the corresponding span will cover the duration of all attempts. The final status and output of the span reflect the outcome after the last attempt. Check the span's metadata for the number of attempts made.

### 2. Dashboards

Dashboards provide an aggregated view of performance and quality over time. Task #13 outlines a recommended "Chain of Experts Monitoring" dashboard.

-   **Accessing:** Navigate to the "Dashboards" section and select the relevant dashboard.
-   **Widgets (Examples):**
    -   **Latency:** Track average trace duration and individual expert latency. Identify slow steps.
    -   **Cost:** Monitor daily/monthly LLM costs based on token usage.
    -   **Token Usage:** Analyze prompt/completion token counts per expert.
    -   **Error Rates:** Track the percentage of failed traces or specific expert errors.
    -   **Quality Scores:** Monitor user feedback scores or automated evaluation scores (LLM-as-a-Judge).

Use dashboards to understand overall trends, identify systemic issues, and track the impact of changes.

### 3. Scores & Evaluations

Langfuse allows attaching scores to traces or observations for quality assessment.

-   **Viewing Scores:** Navigate to the "Scores" section or view scores attached to specific traces/observations in the Trace view.
-   **Score Types:**
    -   **User Feedback:** Captured via the `/api/feedback` endpoint (if implemented fully). Shows user satisfaction.
    -   **Automated Evaluations (LLM-as-a-Judge):** Configured via the Langfuse UI (Task #14). Provides automated scores for metrics like relevance, quality, hallucination, etc., for specific steps or the whole chain.

Use scores to quantitatively track the quality and effectiveness of the application and identify areas for improvement in prompts or expert logic.

## Troubleshooting Example

**Problem:** Users report inaccurate summaries.

1.  **Langfuse Dashboard:** Check the "Summary Quality" evaluation score widget on the dashboard. Is there a downward trend?
2.  **Langfuse Traces:** Filter traces for recent requests. Find examples of traces with low summary quality scores.
3.  **Trace View:** Open a problematic trace. Examine the "llm-summarization-generation" observation:
    -   What was the input (`input.documents`)? Was the retrieved data relevant (check the preceding "data-retrieval-processing" span)?
    -   What was the exact output (`output.summary`)?
    -   What explanation did the LLM-as-a-Judge evaluator provide for the low score?
4.  **Analysis:** Based on the trace, determine if the issue is:
    -   Poor input documents from the retrieval expert.
    -   A bad prompt sent to the summarization LLM.
    -   The LLM itself generating a poor summary despite good input/prompt.
    -   An issue with the evaluation prompt itself.
5.  **Action:** Refine the relevant expert's logic, prompt, or the evaluator configuration based on the findings. Deploy the change and monitor the dashboard/scores.