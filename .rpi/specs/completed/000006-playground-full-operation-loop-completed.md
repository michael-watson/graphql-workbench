# Spec 000006: Playground Full Operation Loop with MCP Tool Calls

**Status:** implementing
**Created:** 2026-02-28
**Spec ID:** 000006

---

## Context

The Search Playground currently shows only the first 4 steps of dynamic operation generation:
1. Query Extraction
2. Vector Search Results
3. Operation Type Classification
4. Root Field Selection

The remaining steps (type discovery, LLM operation generation with MCP tool calls, validation loop) are not visible. The user wants the playground to reflect the entire operation generation loop including MCP tool call visibility.

## Tasks

### P0 - Core: Extend OperationLogger and hook tool/validation calls

- [x] Add optional `onToolCall(toolName, query)` to `OperationLogger` interface in `types.ts`
- [x] Add optional `onToolResult(toolName, resultLength)` to `OperationLogger` interface
- [x] Add optional `onValidationAttempt(attempt, maxAttempts, valid, errors, operation)` to `OperationLogger`
- [x] Hook `onToolCall`/`onToolResult` into `callLLMWithMcpTools` in `dynamic-generator.ts`
- [x] Hook `onValidationAttempt` into `validateAndRetry` in `dynamic-generator.ts`
- [x] Make `discoverRelatedTypes`, `generateOperationWithLLM`, `validateAndRetry` public

### P0 - Core: Extend playground pipeline in embedding-manager

- [x] Add `_playgroundOnProgress` field to `EmbeddingManager`
- [x] Update generator logger in `initializeDynamicGenerator` to forward tool calls to `_playgroundOnProgress`
- [x] Extend `PlaygroundStep.step` type with new step names
- [x] Extend `PlaygroundResult` with operation, variables, validationAttempts
- [x] Continue `runPlaygroundSearch` past `selectedField`: type discovery → generation → validation
- [x] Emit `relatedTypes`, `generatingOperation`, `toolCall`, `validationAttempt`, `operationComplete` steps

### P0 - Core: Add UI sections to playground

- [x] Related Types section
- [x] Operation Generation section (shows MCP tool calls as timeline)
- [x] Validation Loop section (shows each attempt with errors)
- [x] Generated Operation section (final result with copy button)
- [x] Handle all new step message types in JS

## Success Criteria

- Playground shows all stages of operation generation end-to-end
- MCP tool calls (Search/Introspect) are visible as they happen during generation
- Each validation attempt is shown with its errors and whether it passed
- Final generated operation is displayed in a code block with a copy button
- UI updates progressively as steps complete

## Implementation Summary

Will be filled in after implementation.
