# Vector Search Playground

**Spec ID:** 000002
**Status:** completed
**Created:** 2026-02-14
**Git Hash:** 0457419

## Context

The extension currently has a full dynamic operation generation pipeline but provides no visibility into intermediate results. Users need a playground to test and tweak vector search settings (minSimilarityScore, maxDocuments) and see how each step works.

## Tasks

### P0 - Core Implementation

- [x] **T1: Add `searchRootFieldsOnly` method to `DynamicOperationGenerator`**
  - New public method that runs only steps 3-4 (vector search) and returns raw search results with scores
  - Accepts `inputVector`, `minSimilarityScore`, `maxDocuments`
  - Returns `FilteredSearchResult[]` directly

- [x] **T2: Add `determineOperationType` public method to `DynamicOperationGenerator`**
  - New public method that runs steps 5-6 only
  - Accepts search results and input text
  - Returns the operation type string

- [x] **T3: Add `selectRootField` public method to `DynamicOperationGenerator`**
  - New public method that runs steps 7-8 only
  - Accepts search results, operation type, and input text
  - Returns the selected field document

- [x] **T4: Add `runPlaygroundSearch` method to `EmbeddingManager`**
  - Orchestrates T1-T3 from the VS Code extension side
  - Embeds the query, calls each step, returns structured results for the webview
  - Returns: `{ searchResults, operationType, selectedField }`

- [x] **T5: Create `open-search-playground.ts` command**
  - New webview panel command following the existing `open-explorer-panel.ts` pattern
  - Singleton panel, nonce-based CSP, message protocol
  - UI: linear top-to-bottom layout with input field, search results table, operation type, selected field

- [x] **T6: Register command in `extension.ts` and `package.json`**
  - Command: `graphql-workbench.openSearchPlayground`
  - Title: "GraphQL Workbench: Open Search Playground"
  - Register in extension.ts with embeddingManager dependency

### P1 - UI Polish

- [x] **T7: Webview UI implementation**
  - Input area: text input + embedding table selector + "Search" button
  - Section 1: Vector Search Results - table showing document name, type, parent type, similarity score, content preview
  - Section 2: Operation Type - displays Query/Mutation/Subscription classification
  - Section 3: Root Field Selection - shows selected field name, content, return type, arguments
  - Loading states for each section (progressive: search → type → field)
  - Current settings display (minSimilarityScore, maxDocuments from extension config)

## Success Criteria

- [x] User can open the playground from command palette
- [x] User can enter a query and see vector search results with similarity scores
- [x] User can see which operation type the LLM chose
- [x] User can see which root field was selected
- [x] Settings (minSimilarityScore, maxDocuments) from extension config are reflected
- [x] Each section loads progressively as each step completes

## Implementation Summary

### Files Modified
- `packages/graphql-embedding-operation/src/dynamic-generator.ts` — Added 3 public playground methods (`searchRootFieldsOnly`, `determineOperationType`, `selectRootField`) for step-by-step pipeline execution
- `packages/graphql-workbench/src/services/embedding-manager.ts` — Added `runPlaygroundSearch()` with progressive `onProgress` callback and playground types (`PlaygroundResult`, `PlaygroundStep`, etc.)
- `packages/graphql-workbench/src/extension.ts` — Registered `openSearchPlayground` command
- `packages/graphql-workbench/package.json` — Added `graphql-workbench.openSearchPlayground` command entry

### Files Created
- `packages/graphql-workbench/src/commands/open-search-playground.ts` — Webview panel with linear top-to-bottom UI: input area, vector search results table, operation type badge, root field card. Uses singleton pattern, nonce CSP, progressive loading via message protocol.

### Architecture
The playground decomposes the 14-step `generateDynamicOperation` pipeline into individually callable steps. The `EmbeddingManager` orchestrates them and streams intermediate results to the webview via an `onProgress` callback, enabling each UI section to render as soon as its step completes.
