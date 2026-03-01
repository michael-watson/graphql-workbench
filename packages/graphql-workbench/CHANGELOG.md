# Changelog

All notable changes to GraphQL Workbench are documented here.

---

## [0.3.1]

### Bug Fixes

- **MCP validation always falling back to local parser.** The `McpClient` was calling `tools/call` without first performing the MCP protocol initialization handshake. The Apollo MCP Server (and any strict MCP implementation) requires a `initialize` JSON-RPC request followed by a `notifications/initialized` notification before tool calls are accepted. Without this, the server rejected every call, the `catch` block returned `null`, and the generator silently fell back to the local parse-only validator. The client now performs a lazy initialization on the first call, captures the optional `Mcp-Session-Id` response header, and includes it in all subsequent requests.

- **Search Playground — validation method not visible.** There was no indication in the Validation Loop section of whether each attempt was validated by the Apollo MCP Server or the local GraphQL parser. Each validation attempt card now shows a colored badge: **MCP Server** (blue) when validated via the Apollo MCP Server, or **Local Parser** (purple) when falling back to local parse/validate.

- **Required arguments omitted by LLM on large schemas.** When the schema context sent to the LLM was large, required (non-null) arguments on the selected root field were sometimes silently dropped, producing an invalid operation that the validation loop could not fix without the necessary argument definitions. The operation generation and error-fix prompts now explicitly extract required arguments from the root field metadata and include a `CRITICAL:` block listing every required argument with its type in both the system and user messages. The same instruction is repeated in `fixOperationErrors` so correction attempts also respect required arguments.

- **Related Type Discovery — unsorted type chips in Search Playground.** The type chips in the Related Type Discovery section of the Search Playground were displayed in traversal order (insertion order of the BFS map), which varied between searches. They are now sorted alphabetically by type name.

---

## [0.3.0]

### Bug Fixes

- **Search Playground — validation loop cards not appearing.** After embedding a schema the operation generator was re-created with a minimal logger that omitted the `onValidationAttempt`, `onToolCall`, and `onToolResult` callbacks. The Validation Loop section in the playground would show nothing even when multiple retries occurred. The full set of playground callbacks is now attached to every generator instance regardless of which code path initialises it.

- **Postgres/PGLite — zero vector search results on large schemas.** IVFFlat's default `probes = 1` scans only ~1 % of the index per query. With a selective metadata filter (`parentType IN ('Query', 'Mutation', 'Subscription')`), the single scanned list often contained no root-operation documents, causing the database to return zero rows. The JavaScript-side similarity fallback loop could not recover because it only lowers the score threshold — it does not retry with a wider index scan. Both the Postgres and PGLite stores now issue `SET ivfflat.probes = 10` before each search, scanning 10 % of the index and dramatically improving recall on large schemas. The `probes` value is configurable via the store constructor options.

- **Pinecone — zero results on filtered queries.** Pod-based Pinecone indexes apply metadata filters after the ANN search (post-filtering). A selective filter on a large index could eliminate most ANN candidates before they reached the caller, returning far fewer results than requested — or none at all. The Pinecone store now requests `topK × 5` candidates whenever a filter is present, then trims the result to the requested limit. The multiplier is configurable via `PineconeVectorStoreOptions.filterTopKMultiplier` (default: `5`, capped at Pinecone's 10,000 topK ceiling).

---

## [0.2.0]

### New Features

- **Apollo MCP Server integration.** A local Apollo MCP Server is automatically started for each design in the Schema Design Workbench. The server exposes `Search`, `Introspect`, and `Validate` tools over a JSON-RPC HTTP endpoint. Each design gets a fixed port starting at 9001 (persisted between sessions). The binary is downloaded automatically from the Apollo GitHub releases on first use.

- **MCP-assisted operation generation.** When an Apollo MCP Server is running and the Anthropic LLM provider is configured, the LLM can call `Search` and `Introspect` during operation generation and validation-loop fix attempts. Each tool call is transparent and does not consume a validation retry. The `Introspect` tool always uses depth 1. When an MCP server is available, the generated operation is validated directly via the server's `Validate` tool instead of a local parse-only check.

- **Short-circuit to MCP Search on empty vector results.** If the vector search returns no root-operation fields even after progressively lowering the similarity threshold, the generator falls back to calling the Apollo MCP `Search` tool directly and uses the returned schema context to generate the operation via LLM.

- **LLM entity/keyword extraction for vector search.** Before embedding a query, the LLM can rewrite it into concise entities and keywords, stripping filler words to produce more precise similarity matches. Controlled by the `graphqlWorkbench.useEntityExtraction` setting (default: `true`).

- **Search Playground — full generation pipeline.** The Search Playground now visualises every stage of the operation generation pipeline:
  - **Query Extraction** — original vs. rewritten query
  - **Vector Search Results** — root fields with similarity scores
  - **Operation Type Classification** — Query / Mutation / Subscription
  - **Root Field Selection** — chosen field with type and arguments
  - **Related Type Discovery** — all types traversed from the root field
  - **Operation Generation** — live MCP tool call timeline (Search / Introspect) showing each query sent and the number of characters returned
  - **Validation Loop** — one card per attempt: VALID/INVALID badge, error messages, expandable failing-operation snapshot, and any MCP tool calls made during the LLM fix attempt
  - **Generated Operation** — final operation in a copyable code block with total generation time

---

## [0.1.0]

### Initial Release

- **Schema Design Workbench** — activity bar panel for managing standalone and federated GraphQL designs, with validation, embedding, and schema composition
- **Federation entity completion** — autocomplete entity references from other subgraphs with correct `@key` stubs
- **Schema embedding** — embed `.graphql` schemas from local files or live endpoints into PGLite, PostgreSQL, or Pinecone vector stores
- **Operation generation** — generate GraphQL queries, mutations, and subscriptions from natural language using Ollama, OpenAI, or Anthropic
- **Explorer panel** — integrated Apollo Explorer webview for running operations against a live endpoint
- **Schema linting** — naming-convention and design-rule checks with Problems panel integration and quick-fix dismissals
- **Schema design analysis** — LLM-powered best-practices report
- **Endpoint introspection** — download and save remote GraphQL schemas as `.graphql` files
