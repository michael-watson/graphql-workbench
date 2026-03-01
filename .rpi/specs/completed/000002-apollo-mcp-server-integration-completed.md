# Spec 000002: Apollo MCP Server Integration

## Context

Add Apollo MCP Server support to the graphql-workbench VS Code extension. Each design gets an auto-started MCP server on workspace load. Federated designs use the composed API schema (via Rover). Servers start on port 9001 and increment per design. Users can start, stop, enable, or disable servers per-design from the tree view. The binary is downloaded automatically from GitHub releases with platform detection.

## Tasks

### P0: Core Infrastructure

- [x] **P0.1** Create `McpBinaryManager` service (`src/services/mcp-binary-manager.ts`)
  - Platform/arch detection → Rust target triple: `aarch64-apple-darwin`, `x86_64-apple-darwin`, `aarch64-unknown-linux-gnu`, `x86_64-unknown-linux-gnu`, `aarch64-pc-windows-msvc`, `x86_64-pc-windows-msvc`
  - Fetch latest version from GitHub API: `api.github.com/repos/apollographql/apollo-mcp-server/releases/latest`
  - Download `.tar.gz` via HTTPS with redirect following (up to 5 hops)
  - Extract with `tar xzf --strip-components=1` (archive nests binary under `dist/`, strip removes it)
  - Store binary at `globalStorageUri/mcp/bin/apollo-mcp-server` (`.exe` on Windows)
  - `chmod 0o755` on macOS/Linux after extraction
  - `isBinaryAvailable()` — sync check using `fs.accessSync`
  - `ensureBinaryAvailable()` — prompts user to download if missing, returns path or null
  - `downloadBinary()` — force re-download with progress notification

- [x] **P0.2** Add `onDidValidateDesign` event to `DesignManager` (`src/services/design-manager.ts`)
  - New `EventEmitter<{ design: DesignEntry; result: ValidationResult }>`
  - Fires inside `validateDesign()` after `publishDiagnostics()` and before `_onDidChangeDesigns`
  - McpManager subscribes to restart server with fresh composed schema when validation passes
  - Disposed in `dispose()`

- [x] **P0.3** Create `McpManager` service (`src/services/mcp-manager.ts`)
  - Tracks running servers: `Map<configPath, McpServerEntry>` (`{ port, process, configFilePath, schemaFilePath }`)
  - Port allocation: starts at 9001, increments per new design; persisted to `globalState` key `mcpPortAssignments`
  - Per-design disabled set persisted to `globalState` key `mcpDisabledDesigns`
  - **Auto-start on discovery**: `onDidChangeDesigns` starts servers for all non-disabled designs without a running server; stops servers for removed designs
  - **Restart on save**: `onDidValidateDesign` with `result.valid === true` restarts server to pick up changed schema
  - Binary spawned as: `spawn(binaryPath, [configFilePath])` — positional arg, NOT `--config`
  - stdout/stderr piped to output channel with `[McpManager:designName]` prefix
  - `enableDesign(configPath)` / `disableDesign(configPath)` — save state, start/stop accordingly
  - `startServer(configPath)` / `stopServer(configPath)` — public for command palette
  - `stopAllServers()` / `startAllEnabledServers()` — for global setting toggle
  - `dispose()` kills all child processes
  - Fires `_onDidChangeMcpServers` on all state changes for tree refresh

- [x] **P0.4** Generate MCP config YAML per design
  - Written to `globalStorageUri/mcp/configs/{sanitizedDesignName}.yaml`
  - Standalone: `schema.path` points directly to the `.graphql` file
  - Federated: composes API schema via `composeApiSchema()`, writes result to `globalStorageUri/mcp/schemas/{designName}-api.graphql`, `schema.path` points there
  - Config structure:
    ```yaml
    schema:
      source: local
      path: "/absolute/path/to/schema.graphql"
    transport:
      type: streamable_http
      address: "127.0.0.1"
      port: 9001
    introspection:
      introspect:
        enabled: true
      search:
        enabled: true
      validate:
        enabled: true
    ```

### P1: UI Integration

- [x] **P1.1** Extend `DesignTreeItem` with `mcp-status` type (`src/providers/design-tree-items.ts`)
  - Added `"mcp-status"` to `DesignItemType` union
  - Added `mcpPort?: number`, `mcpEnabled?: boolean`, `mcpRunning?: boolean` constructor params
  - **Running** (`contextValue: "mcp-status-running"`): green plug icon, description = full URL `http://127.0.0.1:{port}/mcp`
  - **Stopped** (`contextValue: "mcp-status-stopped"`): grey plug icon, description = `"MCP stopped"`
  - **Disabled** (`contextValue: "mcp-status-disabled"`): grey plug icon, description = `"MCP disabled"`
  - `contextValue` is state-specific (not generic `"mcp-status"`) to drive conditional context menus

- [x] **P1.2** Update `DesignTreeProvider` (`src/providers/design-tree-provider.ts`)
  - Added `mcpManager?: McpManager` as optional second constructor parameter
  - Added `createMcpStatusItem(designPath)` helper — reads running/enabled/port state from McpManager
  - MCP status item inserted at top of children list for both federated and standalone designs (only when `mcpManager.isGloballyEnabled()`)
  - `mcpManager.onDidChangeMcpServers` triggers `treeProvider.refresh()` (wired in `extension.ts`)

- [x] **P1.3** Add MCP commands (`src/commands/design-workbench-commands.ts`)
  - `startMcpServerCommand(mcpManager, item)` — calls `mcpManager.startServer()`
  - `stopMcpServerCommand(mcpManager, item)` — calls `mcpManager.stopServer()`
  - `enableMcpServerCommand(mcpManager, item)` — calls `mcpManager.enableDesign()`
  - `disableMcpServerCommand(mcpManager, item)` — calls `mcpManager.disableDesign()`
  - `downloadMcpBinaryCommand(binaryManager)` — calls `binaryManager.downloadBinary()`

### P2: Package Configuration

- [x] **P2.1** Setting: `graphqlWorkbench.enableMcpServer`
  - Type: `boolean`, default: `true`
  - Description explains ports start at 9001 and the download command

- [x] **P2.2** Commands registered in `package.json`
  - `graphql-workbench.startMcpServer` — "Start MCP Server"
  - `graphql-workbench.stopMcpServer` — "Stop MCP Server"
  - `graphql-workbench.enableMcpServer` — "Enable MCP Server"
  - `graphql-workbench.disableMcpServer` — "Disable MCP Server"
  - `graphql-workbench.downloadMcpBinary` — "GraphQL Workbench: Download Apollo MCP Server"
  - start/stop/enable/disable hidden from command palette (`when: false`)

- [x] **P2.3** Context menus in `package.json` `view/item/context`
  - Group `1_mcp`: **Start** (when `mcp-status-stopped`) or **Stop** (when `mcp-status-running`)
  - Group `2_mcp` (separator): **Disable** (when running or stopped) or **Enable** (when disabled)

- [x] **P2.4** Wire McpManager in `extension.ts`
  - `McpBinaryManager` and `McpManager` created after `DesignManager`
  - `await mcpManager.initialize()` called before `discoverDesigns()`
  - `McpManager` passed to `DesignTreeProvider` constructor
  - `mcpManager.onDidChangeMcpServers` → `treeProvider.refresh()`
  - `enableMcpServer` setting change → `stopAllServers()` or `startAllEnabledServers()`
  - `mcpManager.dispose()` called in both subscription dispose and `deactivate()`

## Bug Fixes Applied During Implementation

1. **`--config` flag** — Apollo MCP Server CLI uses a positional argument (`apollo-mcp-server config.yaml`), not `--config config.yaml`. Fixed spawn args.
2. **tar strip-components** — Archive extracts to `dist/apollo-mcp-server`. Changed from `--strip-components=0` to `--strip-components=1` so binary lands directly in `binDir`.
3. **Binary not downloaded** — `startOrRestartServer` was calling `isBinaryAvailable()` (bail silently) instead of `ensureBinaryAvailable()` (prompt to download). Fixed to call `ensureBinaryAvailable()`.

## Success Criteria

- [x] MCP servers start automatically when workspace loads (on `onDidChangeDesigns`)
- [x] Federated designs use composed API schema
- [x] Port 9001 for first design, incrementing for additional; ports persisted across restarts
- [x] Tree view shows "MCP Server" row with green plug + URL when running
- [x] Right-click shows: Start OR Stop (group 1), then Disable OR Enable (group 2, separated)
- [x] Global `enableMcpServer: false` stops all servers; re-enabling restarts them
- [x] Binary download works on macOS arm64/x64, Linux arm64/x64, Windows arm64/x64
- [x] Server restarts when design file is saved and schema is valid (fresh schema for MCP)
- [x] `graphql-workbench.downloadMcpBinary` command triggers manual download

## Implementation Summary

### Files Created
- `packages/graphql-workbench/src/services/mcp-binary-manager.ts`
- `packages/graphql-workbench/src/services/mcp-manager.ts`

### Files Modified
- `packages/graphql-workbench/src/services/design-manager.ts` — `onDidValidateDesign` event
- `packages/graphql-workbench/src/providers/design-tree-items.ts` — `mcp-status` type with state-based `contextValue`
- `packages/graphql-workbench/src/providers/design-tree-provider.ts` — `McpManager` param, `createMcpStatusItem()`
- `packages/graphql-workbench/src/commands/design-workbench-commands.ts` — 5 MCP commands
- `packages/graphql-workbench/src/extension.ts` — full lifecycle wiring
- `packages/graphql-workbench/package.json` — setting, commands, menus

### Key Architectural Notes
- **Auto-start hook**: `onDidChangeDesigns` (not `onDidValidateDesign`) is the primary startup trigger so servers come up immediately on workspace load without requiring an explicit validate step
- **Schema refresh hook**: `onDidValidateDesign` with `valid=true` restarts the server so the MCP server always has an up-to-date composed schema after saves
- **Port stability**: ports are allocated once per configPath and persisted; the same design always gets the same port across VS Code restarts
- **Federated schema temp file**: written to `globalStorageUri/mcp/schemas/`, separate from the supergraph.yaml; MCP server reads only the federation-directive-free API schema
- **contextValue granularity**: `mcp-status-running`, `mcp-status-stopped`, `mcp-status-disabled` (not generic `mcp-status`) — required for VS Code to show the correct subset of context menu items per state
