# Research: Vector Search Playground View

**Date:** 2026-02-14
**Topic:** Implementing a playground view for testing vector search and dynamic operation generation internals

## Executive Summary

The extension has a full pipeline for dynamic operation generation: embed user query → vector search for root fields → LLM determines operation type → LLM selects root field → BFS type discovery → LLM generates operation → validation loop. A playground view needs to expose each step's intermediate results.

## Key Findings

### Existing Infrastructure

1. **EmbeddingManager** (`services/embedding-manager.ts`) - orchestrates the full pipeline via `generateOperation()`
2. **DynamicOperationGenerator** (`graphql-embedding-operation/src/dynamic-generator.ts`) - the 14-step pipeline
3. **Explorer Panel** (`commands/open-explorer-panel.ts`) - existing webview pattern with singleton panel, nonce CSP, message protocol

### Pipeline Steps Relevant to Playground

| Step | Method | What to Expose |
|------|--------|---------------|
| 1-2 | `embeddingProvider.embed(query)` | User query embedding |
| 3-4 | `searchRootFields(vector, minSim, maxDocs)` | All search results with scores |
| 5-6 | LLM determines operation type | Query/Mutation/Subscription decision |
| 7 | Filter by operation type | Filtered results |
| 8 | LLM selects root field | Selected field + reasoning |

### Settings That Affect Results

- `graphqlWorkbench.minSimilarityScore` (default 0.4) - cosine similarity threshold
- `graphqlWorkbench.maxDocuments` (default 50) - max results

### Webview Patterns

- Singleton panels using `createWebviewPanel`
- Nonce-based CSP for scripts
- Message protocol: extension ↔ webview via `postMessage`/`onDidReceiveMessage`
- VS Code Webview UI Toolkit available

## Recommendations

1. Create a new webview panel command `graphql-workbench.openSearchPlayground`
2. Expose intermediate results from DynamicOperationGenerator by adding methods that return step-by-step results
3. Linear top-to-bottom UI: input → search results → operation type → root field selection
4. Reuse existing EmbeddingManager for vector search, add new methods to DynamicOperationGenerator for step-by-step execution
