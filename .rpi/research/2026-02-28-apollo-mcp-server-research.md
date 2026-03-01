# Apollo MCP Server Integration - Research Document

## Executive Summary

The graphql-workbench VS Code extension has a clean service-based architecture that makes it straightforward to add Apollo MCP Server support. The integration follows existing patterns: a new `McpManager` service manages process lifecycle, a `McpBinaryManager` handles binary download, and tree view items display MCP status per design.

## Findings

### Codebase Architecture
- **Entry point**: `packages/graphql-workbench/src/extension.ts`
- **Services**: `design-manager.ts`, `rover-validator.ts`, `schema-validator.ts`, `embedding-manager.ts`
- **Providers**: `design-tree-provider.ts`, `design-tree-items.ts`
- **Commands**: `commands/design-workbench-commands.ts`
- Build: esbuild (bundles, no type-check), TypeScript tsc --noEmit for verification

### DesignEntry Structure (design-manager.ts)
```typescript
interface DesignEntry {
  type: "federated" | "standalone";
  configPath: string;
  subgraphs?: SubgraphEntry[];
  lastValidation?: ValidationResult;
  embeddingTableName?: string;
  isEmbedded?: boolean;
  federationVersion?: string;
  federationVersionLine?: number;
}
```

### Key Patterns
- Child processes: `rover-validator.ts` uses `execFile` for Rover CLI
- Long-running servers: NOT currently used - MCP will be first
- File watchers: `createFileSystemWatcher` in design-manager.ts
- Settings: `vscode.workspace.getConfiguration("graphqlWorkbench")`
- State persistence: `context.globalState.update(key, value)`
- Event emitters: `vscode.EventEmitter<T>` pattern

### Apollo MCP Server Binary
- Latest version: v1.8.0
- GitHub API: `https://api.github.com/repos/apollographql/apollo-mcp-server/releases/latest`
- Platform targets:
  - macOS ARM: `aarch64-apple-darwin`
  - macOS x86: `x86_64-apple-darwin`
  - Linux ARM: `aarch64-unknown-linux-gnu`
  - Linux x86: `x86_64-unknown-linux-gnu`
  - Windows ARM: `aarch64-pc-windows-msvc`
  - Windows x86: `x86_64-pc-windows-msvc`
- Archive format: `.tar.gz` (all platforms)
- Extraction: `tar xzf` works on macOS, Linux, and Windows 10+

### Apollo MCP Server Config Format
```yaml
schema:
  source: local
  path: /absolute/path/to/schema.graphql

transport:
  type: streamable_http
  address: 127.0.0.1
  port: 9001

introspection:
  introspect:
    enabled: true
  search:
    enabled: true
  validate:
    enabled: true
```

### MCP Server URL
- Transport: `streamable_http` (HTTP SSE)
- URL pattern: `http://127.0.0.1:{port}/mcp`
- Port: starts at 9001, increments per design

### Schema Sources
- Standalone designs: use `.graphql` file directly
- Federated designs: compose API schema via rover (`composeApiSchema()`), write to temp file
  - Already available: `composeApiSchema()` in `rover-validator.ts`

### Tree View Item Constructor
Current signature (positional args):
```typescript
constructor(label, itemType, collapsibleState, designPath,
  subgraphName?, schemaFilePath?, groupName?, line?,
  embeddingTableName?, isEmbedded?)
```
Can add `mcpPort?` and `mcpEnabled?` at end without breaking callers.

## Recommendations

### Architecture
1. **`McpBinaryManager`** - handles binary download, version tracking, extraction
2. **`McpManager`** - manages MCP server processes per design
3. Extend `DesignManager` with `onDidValidateDesign` event
4. Add `mcp-status` item type to tree view

### Port Strategy
- Allocate port on first use, maintain `Map<configPath, number>`
- Port 9001 + increment per design
- Persist port assignments to `globalState` for consistency across restarts

### MCP Startup Trigger
- Listen to new `onDidValidateDesign` event (only start after valid schema)
- For standalone: validation result directly
- For federated: API schema composition success = valid

### Toggle Mechanism
- Per-design disabled set stored in `globalState`
- Global setting `enableMcpServer` controls all servers
- `mcp-status` tree item shows current state, right-click to toggle

## Open Questions
- None - sufficient info available to implement.
