# Spec 000004: LLM Entity/Keyword Extraction for Vector Search

**Spec ID:** 000004
**Status:** unimplemented
**Created:** 2026-02-28T00:00:00Z
**Branch:** feat-mcp-server

---

## Context

The dynamic operation generation system searches schema root fields using vector similarity. Currently, the user's raw natural language query is embedded directly and used for vector search. This spec modifies the search flow to first extract entities and keywords from the user's query using an LLM, then embed that condensed form instead of the raw query. This produces more precise embedding vectors because they contain only semantically meaningful terms, matching closer to how schema field names and descriptions are stored.

### Current Flow
```
User input → embed(rawQuery) → vector search → LLM steps
```

### New Flow
```
User input → LLM extract entities/keywords → embed(extractedTerms) → vector search → LLM steps
```

### Key Files
- `packages/graphql-workbench/src/services/embedding-manager.ts` — orchestrator (`runPlaygroundSearch`, lines 1135-1267)
- `packages/graphql-embedding-operation/src/dynamic-generator.ts` — `searchRootFieldsOnly` (lines 815-835)
- `packages/graphql-workbench/src/commands/open-search-playground.ts` — webview + message handler
- `packages/graphql-embedding-core/src/llm/` — LLM providers

---

## Tasks

### P0 — Core Extraction Logic

- [x] **T1:** Add `extractSearchTerms(query: string): Promise<string>` method to `EmbeddingManager`
  - Call `this.llmProvider.complete()` with a focused extraction prompt
  - Prompt: extract entities and keywords from the user sentence, preserve original order, return as space-separated string
  - Include few-shot examples in the prompt for reliability
  - Return raw query as fallback if LLM fails or llmProvider is not initialized

- [x] **T2:** Wire extraction into `runPlaygroundSearch` before embedding
  - Before: `const inputVector = await this.embeddingProvider.embed(query);`
  - After: extract first, then embed extracted string
  - Emit a new `onProgress` step `"extractedQuery"` with both original and extracted strings
  - Store extracted query for use in subsequent LLM calls (determineOperationType, selectRootField still receive original `query`)

### P0 — Type Updates

- [x] **T3:** Add `"extractedQuery"` to the `PlaygroundStep` type/union
  - Find where `PlaygroundStep` is defined (likely `embedding-manager.ts` or a types file)
  - Add step type with fields: `{ originalQuery: string; extractedQuery: string }`

### P1 — Playground UI

- [x] **T4:** Update the search playground webview to display the extraction step
  - In `open-search-playground.ts`, handle `step === "extractedQuery"` in the progress message handler
  - Show a new card/section: "Query Extraction" with original vs. extracted query side-by-side
  - Position it first in the results flow (before search results card)

### P2 — Configuration Option

- [x] **T5:** Add VS Code setting `graphqlWorkbench.useEntityExtraction` (boolean, default: `true`)
  - Read from config in `runPlaygroundSearch`
  - Skip extraction step if false (use raw query)
  - Add to `getConfig()` method in `embedding-manager.ts`

---

## LLM Extraction Prompt

```
You are a keyword and entity extractor. Extract the key entities, field names, and search terms from the user's GraphQL search query. Return ONLY the extracted terms as a space-separated string, preserving the original order they appear. Remove filler words (get, all, with, their, find, show, me, the, a, an, of, for, by, and, or). Do not add new words not in the original query. Do not explain.

Examples:
Input: "get all users with their recent posts and profile pictures"
Output: users recent posts profile pictures

Input: "find products by category with price range"
Output: products category price range

Input: "show me the order details for a specific customer"
Output: order details customer

Input: "create a new user account with email and password"
Output: user account email password

Now extract from:
Input: "{query}"
Output:
```

---

## Success Criteria

- [x] `extractSearchTerms()` calls LLM and returns extracted terms string
- [x] Extraction runs before embedding in `runPlaygroundSearch`
- [x] If LLM unavailable or extraction fails, falls back to raw query (no crash)
- [x] `onProgress` emits `extractedQuery` step with both original and extracted
- [x] Playground webview shows extraction card with original vs. extracted text
- [x] Setting `useEntityExtraction: false` bypasses extraction
- [x] tsc --noEmit passes in extension package
- [ ] Manual test: search "get all users with their posts" → extracted terms are embedded (requires runtime)

---

## Implementation Summary

Added LLM-based entity/keyword extraction as a pre-embedding step in the search playground pipeline.

**Files changed:**
- `packages/graphql-workbench/src/services/embedding-manager.ts`
  - Added `"extractedQuery"` to `PlaygroundStep` step union type
  - Added `useEntityExtraction: boolean` to `getConfig()` (reads `graphqlWorkbench.useEntityExtraction`)
  - Added private `extractSearchTerms(query)` method — calls `this.llmProvider.complete()` with a few-shot prompt, returns the raw query as fallback on error
  - Modified `runPlaygroundSearch()` — extracts terms before embedding, emits `extractedQuery` progress step

- `packages/graphql-workbench/src/commands/open-search-playground.ts`
  - Added `#extractionSection` / `#extractionContent` HTML section (inserted before vector search results)
  - Added CSS for `.extraction-card`, `.extraction-row`, `.extraction-label`, `.extraction-value`, `.extraction-original`, `.extraction-extracted`, `.extraction-note`
  - Added `extractedQuery` case in `handleStep()` — shows original query (struck-through) and extracted query (highlighted green) when they differ
  - Updated `searching` reset to show extraction spinner first, then show search results section on `extractedQuery` step

- `packages/graphql-workbench/package.json`
  - Added `graphqlWorkbench.useEntityExtraction` boolean setting (default: `true`)

**Architecture decision:** The LLM call uses `temperature: 0.0` and `maxTokens: 100` for deterministic, concise output. The original `query` is still passed to `determineOperationType` and `selectRootField` so the LLM reasoning uses natural language context. Only the embedding input is the extracted form.
