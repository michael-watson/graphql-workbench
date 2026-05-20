# graphql-embedding-operation

Dynamic GraphQL operation generation and Apollo MCP Server client.

## Source

```
src/
├── dynamic-generator.ts   # DynamicOperationGenerator — generates operations from embeddings
├── mcp-client.ts          # McpClient — communicates with Apollo MCP Server
├── types.ts               # Shared types
└── index.ts               # Public exports
```

## DynamicOperationGenerator

Public methods used by the Search Playground:
- `searchRootFieldsOnly(query)` — embedding search scoped to root fields
- `determineOperationType(field)` — infers query/mutation/subscription
- `selectRootField(results)` — picks best match from search results

`EmbeddingManager.runPlaygroundSearch()` orchestrates these with an `onProgress` callback for progressive UI updates.

## McpClient (Apollo MCP Server)

Tool names are **lowercase** — the server exposes `search`, `introspect`, `validate`:

```ts
// correct
client.callTool("search", { ... })
client.callTool("introspect", { ... })
client.callTool("validate", { ... })

// wrong — PascalCase does not work
client.callTool("Search", { ... })
```

`MCP_TOOLS` constant in `dynamic-generator.ts` also uses lowercase names.
