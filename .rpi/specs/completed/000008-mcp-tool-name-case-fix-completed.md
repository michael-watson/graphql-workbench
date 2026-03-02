# Spec 000008: Fix MCP Tool Name Casing and Misleading Log Message

**Spec ID:** 000008
**Status:** completed
**Created:** 2026-03-01T00:00:00Z
**Branch:** fix-mcp-server-validation

---

## Context

The Apollo MCP Server exposes tools with **lowercase** names: `search`, `introspect`, `validate`, `execute`.

Our `McpClient` (and `MCP_TOOLS` list in `dynamic-generator.ts`) uses PascalCase names:
`"Search"`, `"Introspect"`, `"Validate"`.

This causes all three tool calls to fail:
- `search()` and `introspect()` fail silently (return empty string) → LLM gets "(no results)" context
- `validate()` fails → `validateWithMcp()` returns null and logs the misleading message
  `"[MCP] MCP server unreachable, falling back to local validation"`

The Apollo MCP server binary itself logs `"Tool Validate not found"` to stdout (visible in McpManager output), confirming the server IS reachable but the tool name is wrong.

The user sees two incorrect messages:
1. McpManager output: `"Tool Validate not found"` (from Apollo binary stdout)
2. Generator output: `"[MCP] MCP server unreachable..."` (wrong – server IS reachable)

---

## Tasks

### P0 — Fix tool names in `mcp-client.ts`

- [x] **T1:** Change `callTool("Search", ...)` → `callTool("search", ...)` in `search()` method
- [x] **T2:** Change `callTool("Introspect", ...)` → `callTool("introspect", ...)` in `introspect()` method
- [x] **T3:** Change `callTool("Validate", ...)` → `callTool("validate", ...)` in `validate()` method

### P0 — Fix MCP_TOOLS and handler in `dynamic-generator.ts`

- [x] **T4:** Change `name: "Search"` → `name: "search"` in `MCP_TOOLS` array
- [x] **T5:** Change `name: "Introspect"` → `name: "introspect"` in `MCP_TOOLS` array
- [x] **T6:** Change `if (name === "Search")` → `if (name === "search")` in `callLLMWithMcpTools` handler
- [x] **T7:** Change `if (name === "Introspect")` → `if (name === "introspect")` in `callLLMWithMcpTools` handler

### P0 — Fix misleading log message in `dynamic-generator.ts`

- [x] **T8:** In `validateWithMcp()`, change the fallback log message from:
  `"[MCP] MCP server unreachable, falling back to local validation"` to:
  `"[MCP] MCP validate tool unavailable, falling back to local validation"`

---

## Files

- `packages/graphql-embedding-operation/src/mcp-client.ts` — T1, T2, T3
- `packages/graphql-embedding-operation/src/dynamic-generator.ts` — T4, T5, T6, T7, T8

---

## Success Criteria

- [x] Apollo MCP Server no longer logs `"Tool Validate not found"` to stdout (validate tool is called correctly)
- [x] `validateWithMcp()` successfully gets validation results from the MCP server when it's running
- [x] `validateAndRetry()` logs `"[MCP] Validation used: Apollo MCP Server"` instead of falling back to local
- [x] LLM tool calls during generation route to correct lowercase tool names on the Apollo server
- [x] `tsc --noEmit` passes in all packages
- [x] Build succeeds

---

## Implementation Summary

**Root cause:** Apollo MCP Server exposes tools with lowercase names (`search`, `introspect`, `validate`) but the code was calling them with PascalCase (`Search`, `Introspect`, `Validate`). All three tool calls were failing — `search()` and `introspect()` silently returned empty strings, while `validate()` returned null and triggered a misleading "MCP server unreachable" log message.

**Modified files:**
- `packages/graphql-embedding-operation/src/mcp-client.ts` — Fixed tool call names: `"Search"` → `"search"`, `"Introspect"` → `"introspect"`, `"Validate"` → `"validate"`
- `packages/graphql-embedding-operation/src/dynamic-generator.ts` — Fixed `MCP_TOOLS` name definitions and tool handler checks to lowercase; fixed misleading fallback log from "MCP server unreachable" to "MCP validate tool unavailable"; rewrote `fixOperationErrors()` to extract type+field from errors, call `introspect(type)` AND `search(field)` programmatically, and inject both as LLM context
- `packages/graphql-embedding-operation/src/mcp-client.ts` — Rewrote `validate()` response parsing: treats "Operation is valid" as success and anything else as error lines (previously relied on keyword matching which missed GraphQL compiler errors)
