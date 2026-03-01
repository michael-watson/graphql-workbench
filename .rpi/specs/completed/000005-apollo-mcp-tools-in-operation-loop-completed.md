# Spec 000005: Apollo MCP Server Tools in Operation Generation/Validation Loop

**Spec ID:** 000005
**Status:** unimplemented
**Created:** 2026-02-28T00:00:00Z
**Branch:** feat-mcp-server

---

## Context

The operation generation/validation loop in `DynamicOperationGenerator` currently uses:
- Local vector store for schema search
- LLM (via `llmProvider.complete()`) for operation generation and error fixing
- Local GraphQL parsing/validation against an optional in-memory schema

The user wants to add the locally running Apollo MCP Server to this loop:
1. **LLM tool calling**: Make `Search` and `Introspect` tools available to the LLM during `generateOperationWithLLM()` and `fixOperationErrors()`. When the LLM uses a tool, that round-trip does NOT count as a validation iteration.
2. **Direct MCP validation**: Replace (or augment) local validation with a direct call to the MCP server's `validate` tool, bypassing the LLM.

### Architecture

The MCP server uses `streamable_http` transport (`http://127.0.0.1:{port}/mcp`), accepts JSON-RPC 2.0 POST requests.

The `DynamicOperationGenerator` lives in `packages/graphql-embedding-operation` (no VS Code deps). The MCP URL is known by `EmbeddingManager` in `packages/graphql-workbench` via `McpManager`.

### Tool Calling Strategy

Since `LLMProvider.complete()` doesn't support tools, we:
1. Add `completeWithTools()` method to `AnthropicProvider` (native Anthropic tool use API)
2. Add a `LLMToolProvider` optional interface that `AnthropicProvider` implements
3. `DynamicOperationGenerator` detects if the provider supports tools and uses them when MCP URL is available
4. Other providers (Ollama, OpenAI) fall back to the existing `complete()` approach

---

## Key Files

- `packages/graphql-embedding-operation/src/dynamic-generator.ts` — core loop
- `packages/graphql-embedding-operation/src/types.ts` — DynamicOperationOptions
- `packages/graphql-embedding-core/src/llm/types.ts` — LLMProvider interface
- `packages/graphql-embedding-core/src/llm/providers/anthropic.ts` — Anthropic provider
- `packages/graphql-workbench/src/services/embedding-manager.ts` — orchestrator
- `packages/graphql-workbench/src/extension.ts` — service wiring

---

## Tasks

### P0 — MCP Client

- [x] **T1:** Create `packages/graphql-embedding-operation/src/mcp-client.ts`
  - `export class McpClient { constructor(serverUrl: string) }`
  - `private async callJsonRpc(method: string, params: Record<string, unknown>): Promise<unknown>` — POST to serverUrl with JSON-RPC 2.0, handle both `application/json` and `text/event-stream` response types (parse first SSE `data:` line for streaming responses)
  - `async search(query: string): Promise<string>` — calls `tools/call` with name `"Search"`, returns text content
  - `async introspect(query: string): Promise<string>` — calls `tools/call` with name `"Introspect"`, returns text content
  - `async validate(operation: string): Promise<{ valid: boolean; errors: string[] }>` — calls `tools/call` with name `"Validate"`, parses response for errors list
  - `async listTools(): Promise<string[]>` — calls `tools/list`, returns tool names (used for capability detection)
  - All methods: catch errors and return safe defaults (empty string / valid=true if server unreachable)

### P0 — LLM Tool Provider Interface

- [x] **T2:** Add `LLMToolProvider` interface to `packages/graphql-embedding-core/src/llm/types.ts`
  ```typescript
  export interface McpToolDefinition {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }
  export interface LLMToolProvider {
    supportsTools: true;
    completeWithTools(
      messages: ChatMessage[],
      tools: McpToolDefinition[],
      onToolCall: (name: string, args: Record<string, unknown>) => Promise<string>,
      options?: LLMCompletionOptions
    ): Promise<string>;
  }
  ```

### P0 — Anthropic Tool Calling

- [x] **T3:** Implement `LLMToolProvider` on `AnthropicProvider` in `packages/graphql-embedding-core/src/llm/providers/anthropic.ts`
  - Add `supportsTools: true as const` property
  - Add Anthropic tool types: `AnthropicTool`, `AnthropicToolUseBlock`, `AnthropicToolResultBlock`, `AnthropicToolRequest` (extends existing request with `tools`)
  - Add `AnthropicToolResponse` type: content can include `{ type: "tool_use", id, name, input }` blocks
  - Implement `completeWithTools()`:
    1. Convert tools to Anthropic format (name, description, input_schema)
    2. POST with tools in request body
    3. If `stop_reason === "tool_use"`: extract all tool_use blocks, call `onToolCall` for each, append tool_result message (with `tool_use_id`), loop back
    4. If `stop_reason === "end_turn"`: extract text from content, return it
    5. Extract system messages same way as `complete()`
    6. Max internal tool turns: 10 (safety limit, not exposed as validation iteration)

### P0 — Generator Integration

- [x] **T4:** Update `DynamicOperationOptions` in `types.ts` — add `mcpServerUrl?: string`

- [x] **T5:** Update `DynamicOperationGenerator` constructor to store `mcpServerUrl` and lazy-init `McpClient`:
  - `private readonly mcpServerUrl?: string`
  - `private mcpClient?: McpClient` (created lazily when first needed)
  - `private getMcpClient(): McpClient | undefined` — returns client if URL is set

- [x] **T6:** Add `callLLMWithMcpTools(messages, systemPrompt?, options?)` private method
  - Checks `(this.llmProvider as unknown as LLMToolProvider).supportsTools === true`
  - If yes AND `this.getMcpClient()` is defined: calls `completeWithTools()` with Search + Introspect tool defs, `onToolCall` dispatches to `mcpClient.search()` or `mcpClient.introspect()`
  - If no: falls back to `this.llmProvider.complete(messages, options)` (handles system message extraction manually for the fallback path)
  - Tool definitions:
    - `Search`: "Search the GraphQL schema for relevant types, fields, and documents by keyword", input: `{ query: string }`
    - `Introspect`: "Introspect a specific GraphQL type or field name to get its full schema definition", input: `{ query: string }`

- [x] **T7:** Modify `generateOperationWithLLM()` to use `callLLMWithMcpTools()` instead of `this.llmProvider.complete()`

- [x] **T8:** Modify `fixOperationErrors()` to use `callLLMWithMcpTools()` instead of `this.llmProvider.complete()`

- [x] **T9:** Add `validateWithMcp(operation: string): Promise<ValidationResult | null>` private method
  - Returns `null` if MCP client unavailable
  - Calls `mcpClient.validate(operation)` directly (no LLM)
  - Logs: `[MCP] Validating operation via Apollo MCP Server...`

- [x] **T10:** Modify `validateAndRetry()` to use MCP validation when available:
  - Before local `validateOperation()`, try `validateWithMcp()` first
  - If MCP returns result: use it (skip local validation for that attempt)
  - If MCP unavailable: fall back to local `validateOperation()`
  - Log which validation path was used

### P1 — EmbeddingManager Wiring

- [x] **T11:** Add `setMcpServerUrlProvider(provider: (tableName: string) => string | undefined): void` to `EmbeddingManager`
  - Stores callback as `private getMcpServerUrl?: (tableName: string) => string | undefined`
  - When `initializeDynamicGenerator()` creates the generator, pass `getMcpServerUrl?.(this.currentTableName ?? '')`
  - Since generator is created lazily, the URL is resolved at init time

### P1 — Extension Wiring

- [x] **T12:** In `packages/graphql-workbench/src/extension.ts`, wire McpManager to EmbeddingManager:
  ```typescript
  embeddingManager.setMcpServerUrlProvider((tableName) => {
    const designName = tableName.replace(/_embeddings$/, '');
    for (const design of designManager.getAllDesigns()) {
      if (design.name === designName) {
        return mcpManager.getServerUrl(design.configPath);
      }
    }
    return undefined;
  });
  ```
  - Find `getAllDesigns()` or equivalent on DesignManager; if not available, use `designManager.getDesigns()` or equivalent
  - Register this after all three managers are created

---

## MCP JSON-RPC Protocol

### Request format (POST to `http://127.0.0.1:{port}/mcp`)
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "tools/call",
  "params": {
    "name": "Search",
    "arguments": { "query": "user posts" }
  }
}
```

### Response (application/json)
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "content": [{ "type": "text", "text": "..." }]
  }
}
```

### Response (text/event-stream)
```
data: {"jsonrpc":"2.0","id":"1","result":{"content":[{"type":"text","text":"..."}]}}

```

---

## Success Criteria

- [x] `McpClient` can call Search, Introspect, and Validate tools via JSON-RPC
- [x] `AnthropicProvider.completeWithTools()` handles Anthropic tool_use/tool_result cycle
- [x] `generateOperationWithLLM()` and `fixOperationErrors()` route through `callLLMWithMcpTools()`
- [x] Tool calls within a single LLM turn do NOT increment the `attempts` counter
- [x] `validateAndRetry()` uses MCP validate when available (direct, no LLM)
- [x] Falls back gracefully when MCP server is not running
- [x] `DynamicOperationOptions.mcpServerUrl` passes through to generator
- [x] EmbeddingManager wires in MCP URL from table name
- [x] Extension wires McpManager → EmbeddingManager
- [x] `tsc --noEmit` passes in all packages
- [x] Build succeeds

---

## Implementation Summary

_(To be filled in after implementation)_

## Implementation Summary

Integrated the locally running Apollo MCP Server into the GraphQL operation generation/validation loop.

**New files:**
- `packages/graphql-embedding-operation/src/mcp-client.ts` — `McpClient` class (JSON-RPC 2.0 over HTTP, handles JSON + SSE responses, graceful fallback)

**Modified files:**
- `packages/graphql-embedding-core/src/llm/types.ts` — Added `McpToolDefinition` and `LLMToolProvider` interfaces
- `packages/graphql-embedding-core/src/llm/providers/anthropic.ts` — `AnthropicProvider` implements `LLMToolProvider`; new `completeWithTools()` with 10-turn safety limit
- `packages/graphql-embedding-operation/src/types.ts` — Added `mcpServerUrl?: string` to `DynamicOperationOptions`
- `packages/graphql-embedding-operation/src/dynamic-generator.ts` — `callLLMWithMcpTools()`, `validateWithMcp()`, updated `validateAndRetry()`, `generateOperationWithLLM()`, `fixOperationErrors()`
- `packages/graphql-workbench/src/services/embedding-manager.ts` — `setMcpServerUrlProvider()` + passes URL to generator
- `packages/graphql-workbench/src/extension.ts` — Wires McpManager → EmbeddingManager URL lookup
