# graphql-workbench (VS Code Extension)

## Build & Type Check

```bash
npm run build --workspace=graphql-workbench   # esbuild bundle (does NOT type-check)
cd packages/graphql-workbench && npx tsc --noEmit  # type check only
```

## Module Resolution

Uses `NodeNext` — dynamic `import()` paths **must** have `.js` extensions for `tsc --noEmit` to pass. Static imports handled by esbuild and do not need `.js`.

```ts
// dynamic import (needs .js)
const { parse } = await import("graphql");

// ESM packages must use dynamic imports
const { someUtil } = await import("./utils.js");
```

`graphql.buildSchema()` takes a `string`, NOT a `DocumentNode` AST.

## Source Structure

```
src/
├── extension.ts           # activation, registers all commands & providers
├── commands/              # exported async command handler functions
├── services/              # classes (stateful, long-lived)
└── providers/             # VS Code tree/completion providers
```

### Key Services

| File | Purpose |
|------|---------|
| `design-manager.ts` | Manages standalone/federated designs, emits `onDidChangeDesigns`, `onDidValidateDesign` |
| `schema-validator.ts` | Validates GraphQL schemas locally |
| `rover-validator.ts` | Federation validation via Rover CLI |
| `embedding-manager.ts` | Orchestrates embedding operations, `runPlaygroundSearch()` |
| `mcp-manager.ts` | Apollo MCP Server process lifecycle, port assignment (starts at 9001) |
| `mcp-binary-manager.ts` | Downloads/extracts MCP binary from GitHub releases |
| `entity-store.ts` | Entity persistence |

### Key Commands

| File | Command(s) |
|------|-----------|
| `design-workbench-commands.ts` | embedDesign, generateOperationForDesign, clearDesignEmbeddings, startMcpServer, stopMcpServer, enableMcpServer, disableMcpServer, downloadMcpBinary |
| `open-search-playground.ts` | `graphql-workbench.openSearchPlayground` — webview panel |
| `embed-endpoint.ts` | Embed remote endpoint |
| `embed-file.ts` | Embed local schema file |
| `introspect-endpoint.ts` | Introspect remote endpoint |
| `generate-operation.ts` | Generate GraphQL operation |
| `lint-schema.ts` | Schema linting |
| `analyze-schema-design.ts` | Schema design analysis |
| `clear-embeddings.ts` | Clear stored embeddings |
| `open-explorer-panel.ts` | Open explorer webview |

### Key Providers

| File | Purpose |
|------|---------|
| `design-tree-provider.ts` | Schema Design Workbench tree view |
| `design-tree-items.ts` | Tree item classes (`DesignEntry` has `embeddingTableName`, `isEmbedded`) |
| `federation-completion-provider.ts` | Federation directive completion |

## Architectural Rules

**Circular dependency avoidance:** When two services need shared types, define them inline rather than cross-importing. Example: `rover-validator.ts` defines its own `SubgraphInfo` instead of importing from `design-manager.ts`.

**Tree item `contextValue`** must be state-specific for VS Code conditional menus:
- `mcp-status-running` / `mcp-status-stopped` / `mcp-status-disabled`

**Webview pattern:** singleton panel, nonce CSP, message protocol, VS Code CSS variables.

## VS Code Settings

Three custom settings registered:
- `enableDesignWorkbench` — toggle workbench feature
- `roverPath` — path to Rover binary
- `validateOnSave` — auto-validate on file save

## External ESM Packages

All external ESM packages are externalized in `esbuild.config.mjs`. Add new ones there when introducing ESM dependencies.

## MCP Server Details

- Apollo MCP Server CLI: positional arg `apollo-mcp-server config.yaml` (NOT `--config`)
- Config YAML: `globalStorageUri/mcp/configs/`, schema temp files: `globalStorageUri/mcp/schemas/`
- Auto-starts on `onDidChangeDesigns`; restarts on `onDidValidateDesign` when `valid=true`
- Port assignments persisted to `globalState` key `mcpPortAssignments`
- Binary extracted with `tar xzf --strip-components=1` (archive path is `dist/binary`)

## Embedding Details

- `DesignEntry.embeddingTableName` defaults to `${designName}_embeddings`
- Federated designs embed the composed API schema (federation directives stripped)
- Auto re-embed on save uses `embedSchemaIncremental()` — diffs by document ID (content-based hash)
- Deleted designs trigger `onShouldClearEmbeddings` for automatic cleanup
