# Spec 000002: Apollo MCP Server Integration

## Context
Add Apollo MCP Server support to graphql-workbench VS Code extension. Each design with a passing schema gets an auto-started MCP server. Servers use the schema from the local workbench (API schema for federated designs). The binary is downloaded from GitHub releases. Users can toggle per-design via the tree view.

## Tasks

### P0: Core Infrastructure

- [x] **P0.1** Create `McpBinaryManager` service
  - Platform/arch detection → target triple mapping
  - GitHub releases API for latest version
  - HTTPS download of `.tar.gz`
  - Extract with `tar xzf` (works macOS/Linux/Windows 10+)
  - Store binary at `globalStorageUri/mcp/bin/apollo-mcp-server`
  - Persist version to `globalState`
  - Expose `getBinaryPath()` and `ensureBinaryAvailable()`

- [x] **P0.2** Add `onDidValidateDesign` event to `DesignManager`
  - Fire after `validateDesign()` completes with `{ design, result }`
  - McpManager subscribes to this as the startup trigger

- [x] **P0.3** Create `McpManager` service
  - Track running servers: `Map<configPath, McpServerEntry>`
  - Port allocation starting at 9001 (persist across restarts)
  - Per-design disabled set (persisted to `globalState`)
  - Global `enableMcpServer` setting check
  - Start server: write schema temp file + config YAML, spawn process
  - Federated: compose API schema via `composeApiSchema()`, write to temp file
  - Stop server: kill process, cleanup
  - Restart server: stop then start
  - `onDidValidateDesign` → start/stop based on validity
  - `onDidChangeDesigns` → stop servers for removed designs
  - Fire `_onDidChangeMcpServers` for tree refresh
  - `dispose()`: kill all processes

- [x] **P0.4** Generate MCP config YAML
  - Write to `globalStorageUri/mcp/configs/{designName}.yaml`
  - Schema: local path to schema file
  - Transport: streamable_http, 127.0.0.1, port
  - Introspection: introspect/search/validate all enabled

### P1: UI Integration

- [x] **P1.1** Extend `DesignTreeItem` with `mcp-status` type
  - Add `"mcp-status"` to `DesignItemType`
  - Add `mcpPort?: number` and `mcpEnabled?: boolean` constructor params
  - Running state: green plug icon, description = `http://127.0.0.1:{port}/mcp`
  - Disabled state: grey plug icon, description = `MCP disabled`
  - Command: `graphql-workbench.toggleMcpServer` on click

- [x] **P1.2** Update `DesignTreeProvider` to show MCP status
  - Add `McpManager` as constructor parameter
  - Add `createMcpStatusItem()` helper
  - Add MCP status item to `getFederatedChildren()` and `getStandaloneChildren()`
  - Subscribe to McpManager `onDidChangeMcpServers` for refresh
  - Pass McpManager to provider in `extension.ts`

- [x] **P1.3** Add MCP commands to `design-workbench-commands.ts`
  - `toggleMcpServerCommand(mcpManager, item)` - enable/disable for design
  - `restartMcpServerCommand(mcpManager, item)` - restart server
  - `downloadMcpBinaryCommand(binaryManager)` - download/update binary

### P2: Package Configuration

- [x] **P2.1** Add settings to `package.json`
  - `graphqlWorkbench.enableMcpServer` (boolean, default: true)

- [x] **P2.2** Add commands to `package.json`
  - `graphql-workbench.toggleMcpServer` - "Toggle MCP Server"
  - `graphql-workbench.restartMcpServer` - "Restart MCP Server"
  - `graphql-workbench.downloadMcpBinary` - "GraphQL Workbench: Download Apollo MCP Server"

- [x] **P2.3** Add menus to `package.json`
  - `view/item/context` for `mcp-status`: toggle and restart options
  - Hide palette commands via `commandPalette` when false

- [x] **P2.4** Wire up `McpManager` in `extension.ts`
  - Create `McpBinaryManager` and `McpManager` after DesignManager
  - Pass McpManager to DesignTreeProvider
  - Register MCP commands
  - Handle `enableMcpServer` config change (start/stop all)
  - Dispose McpManager on deactivate

## Success Criteria

- MCP server starts automatically for designs with valid schemas
- Federated designs use composed API schema
- Port 9001 used for first design, increments for additional
- Tree view shows "MCP Server" row with port/URL for each design
- Right-clicking MCP status item shows toggle and restart options
- Global `enableMcpServer: false` stops all servers
- Binary download works on macOS arm64, macOS x64, Linux arm64, Linux x64, Windows
- Server restarts when design file is saved
- `graphql-workbench.downloadMcpBinary` command triggers manual download

## Implementation Summary

All tasks completed. TypeScript type-check (tsc --noEmit) passes. esbuild build passes.

### Files Created
- `packages/graphql-workbench/src/services/mcp-binary-manager.ts` - Binary download/management
- `packages/graphql-workbench/src/services/mcp-manager.ts` - MCP server process management

### Files Modified
- `packages/graphql-workbench/src/services/design-manager.ts` - Added `onDidValidateDesign` event
- `packages/graphql-workbench/src/providers/design-tree-items.ts` - Added `mcp-status` type
- `packages/graphql-workbench/src/providers/design-tree-provider.ts` - Added MCP status items
- `packages/graphql-workbench/src/commands/design-workbench-commands.ts` - Added 3 MCP commands
- `packages/graphql-workbench/src/extension.ts` - Wired up McpManager lifecycle
- `packages/graphql-workbench/package.json` - Added settings, commands, menus

### Key Design Decisions
- MCP server only starts when `onDidValidateDesign` fires with valid=true (no wasted starts)
- Port assignments persisted to globalState so they survive VS Code restarts
- Federated designs: rover composes API schema → written to temp file → MCP reads it
- Binary stored at globalStorageUri/mcp/bin/apollo-mcp-server
- tar xzf extraction works on macOS, Linux, and Windows 10+
