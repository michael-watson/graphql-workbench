# GraphQL Workbench

Embed GraphQL schemas and generate operations from natural language queries directly in VS Code.

## Features

- **Schema Design Workbench** -- Manage standalone and federated GraphQL designs from a dedicated activity bar with validation, embedding, and schema composition
- **Schema Embedding** -- Parse and embed `.graphql` schemas from local files or live endpoints into a vector store
- **Operation Generation** -- Generate GraphQL queries, mutations, and subscriptions from natural language using an LLM
- **Explorer Panel** -- An integrated Apollo Explorer webview for running generated operations against a live endpoint
- **Schema Linting** -- Check schemas against naming convention and design rules with quick-fix dismissals
- **Schema Design Analysis** -- LLM-powered analysis of your schema against best practice categories
- **Endpoint Introspection** -- Download and save remote GraphQL schemas as `.graphql` files

## Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for:

| Command | Description |
|---------|-------------|
| `GraphQL Workbench: Embed Schema from File` | Parse and embed a local `.graphql` schema |
| `GraphQL Workbench: Embed Schema from Endpoint` | Introspect a GraphQL endpoint and embed its schema |
| `GraphQL Workbench: Generate Operation` | Generate a GraphQL operation from a natural language description and open it in the Explorer panel |
| `GraphQL Workbench: Open Explorer Panel` | Open the Apollo Explorer webview to run operations against a live endpoint |
| `GraphQL Workbench: Introspect Endpoint to File` | Download a remote schema via introspection and save it as a `.graphql` file |
| `GraphQL Workbench: Lint Schema` | Check a schema against naming convention and design rules |
| `GraphQL Workbench: Analyze Schema Design` | Generate an LLM-powered best practices report for the embedded schema |
| `GraphQL Workbench: Clear All Embeddings` | Remove all stored embeddings from the vector store |

## Context Menus

Right-click on a `.graphql` file in the Explorer or Editor to access:

- **Embed Schema from File**
- **Generate Operation** (editor only)
- **Lint Schema**
- **Open Explorer Panel** (editor only)

## Settings

Configure the extension in VS Code Settings (`Cmd+,` / `Ctrl+,`). All settings are under the `graphqlWorkbench` namespace.

### Vector Store

| Setting | Default | Description |
|---------|---------|-------------|
| `graphqlWorkbench.vectorStore` | `"pglite"` | Vector store backend: `"pglite"` (embedded, no setup) or `"postgres"` (requires pgvector) |
| `graphqlWorkbench.postgresConnectionString` | `"postgresql://postgres@localhost:5432/postgres"` | PostgreSQL connection string (only used when `vectorStore` is `"postgres"`) |

### Embedding Model

| Setting | Default | Description |
|---------|---------|-------------|
| `graphqlWorkbench.modelPath` | `""` | Path to a custom GGUF embedding model. Leave empty to auto-download the default model (~313 MB) on first use. The model is cached in the extension's global storage. |

### LLM Provider

These settings control the LLM used for operation generation and schema design analysis.

| Setting | Default | Description |
|---------|---------|-------------|
| `graphqlWorkbench.llmProvider` | `"ollama"` | LLM provider: `"ollama"`, `"ollama-cloud"`, `"openai"`, or `"anthropic"` |
| `graphqlWorkbench.llmModel` | `""` | Model name. When empty, uses the provider default: `qwen2.5` for Ollama, `gpt-4o-mini` for OpenAI, `claude-3-haiku` for Anthropic. |
| `graphqlWorkbench.ollamaBaseUrl` | `"http://localhost:11434"` | Ollama API base URL |
| `graphqlWorkbench.ollamaCloudApiKey` | `""` | Ollama Cloud API key (required for `ollama-cloud` provider) |
| `graphqlWorkbench.openaiApiKey` | `""` | OpenAI API key (required for `openai` provider) |
| `graphqlWorkbench.anthropicApiKey` | `""` | Anthropic API key (required for `anthropic` provider) |

### LLM Sampling

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `graphqlWorkbench.llmTemperature` | `0.2` | 0--2 | Controls randomness. Lower values produce more deterministic output. |
| `graphqlWorkbench.llmTopK` | `40` | 1--100 | Limits token selection to the top K most likely tokens at each step. |
| `graphqlWorkbench.llmTopP` | `0.9` | 0--1 | Nucleus sampling threshold. The model considers tokens whose cumulative probability reaches this value. |

### Operation Generation

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| `graphqlWorkbench.minSimilarityScore` | `0.4` | 0--1 | Minimum cosine similarity score for vector search results. Lower values return more results but may include less relevant matches. |
| `graphqlWorkbench.maxDocuments` | `50` | 1--200 | Maximum number of documents to retrieve from vector search. |
| `graphqlWorkbench.maxValidationRetries` | `5` | 1--10 | Maximum attempts the LLM gets to fix an invalid generated operation. |

## Schema Design Workbench

The Schema Design Workbench provides a dedicated activity bar panel for managing GraphQL schema designs. It automatically discovers and organizes both standalone schemas and Apollo Federation supergraphs.

### Opening the Workbench

Click the GraphQL Workbench icon in the VS Code activity bar (left sidebar) to open the Designs panel.

### Design Types

The workbench supports two types of designs:

| Type | Identified By | Description |
|------|---------------|-------------|
| **Standalone** | Any `.graphql` file with type definitions | A single schema file containing your entire GraphQL API |
| **Federated** | A `supergraph.yaml` file | An Apollo Federation supergraph composed of multiple subgraph schemas |

### Tree View Structure

**Standalone designs** show:
- Embedding status (click to embed if not embedded)
- Schema types organized by category (Queries, Mutations, Types, etc.)
- Click any type to navigate to its definition

**Federated designs** show:
- Embedding status
- Federation version (click to navigate to the version in supergraph.yaml)
- Supergraph Schema (click to view the composed supergraph with federation directives)
- API Schema (click to view the client-facing schema without federation directives)
- Each subgraph with its schema file

### Validation

Schemas are validated automatically on save (configurable via `graphqlWorkbench.validateOnSave`).

- **Standalone schemas** are validated using the `graphql` library
- **Federated schemas** are validated using the [Rover CLI](https://www.apollographql.com/docs/rover/) with `rover supergraph compose`

Validation errors appear in the VS Code Problems panel with precise line/column locations. Click an error to navigate directly to the issue.

### Embedding from the Workbench

Right-click any design or its Embedding row to:
- **Embed Schema** -- Parse and embed the schema into a vector store with a custom table name
- **Re-embed Schema** -- Clear and re-embed the schema (useful after major changes)
- **Clear Embeddings** -- Remove all embeddings for this design

For federated designs, the API schema (without federation directives) is used for embedding.

When embedded, the Embedding row shows the table name in green. Changes to embedded designs are automatically re-embedded incrementally (only changed documents are updated).

### Context Menu Actions

Right-click items in the tree for actions:

| Item Type | Available Actions |
|-----------|-------------------|
| Design (standalone/federated) | Validate, Embed Schema, Generate Operation, Clear Embeddings, Delete |
| Subgraph | Rename, Delete |
| Schema file | Open, Analyze Design, Lint Schema |
| Embedding row | Embed Schema, Re-embed Schema, Clear Embeddings |

### Creating New Designs

Use the toolbar buttons at the top of the Designs panel:
- **+** (Add icon) -- Create a new standalone schema
- **New Federated Design** (from the overflow menu) -- Create a federated design with a sample subgraph

## Usage

### 1. Embed a Schema

**From a file:**

1. Open a `.graphql` schema file
2. Run `GraphQL Workbench: Embed Schema from File`
3. Enter a table name for storing embeddings (default: `graphql_embeddings`)
4. Wait for the embedding process to complete

**From an endpoint:**

1. Run `GraphQL Workbench: Embed Schema from Endpoint`
2. Enter the GraphQL endpoint URL
3. Optionally add authorization headers as JSON (e.g., `{"Authorization": "Bearer token"}`)
4. Enter a table name and wait for introspection and embedding to complete

### 2. Generate Operations

1. Run `GraphQL Workbench: Generate Operation`
2. Select an embedding table from the quick-pick list (or enter a name manually)
3. Enter a natural language description of what you want:
   - "get all users with their posts"
   - "create a new product with name and price"
   - "fetch order by id with line items"
4. The Explorer panel opens with the generated operation loaded into Apollo Explorer, ready to run against your endpoint
5. The operation includes a `# Prompt:` comment at the top showing the original description

### 3. Use the Explorer Panel

1. Run `GraphQL Workbench: Open Explorer Panel` (or generate an operation, which opens it automatically)
2. Select an embedding table from the dropdown to load its schema
3. Enter the endpoint URL for your GraphQL API
4. Type a description and click **Generate** to create operations directly in the panel
5. The embedded Apollo Explorer lets you run operations, view docs, and inspect results

The Explorer panel is a singleton -- generating operations from the Command Palette will reuse the same panel rather than opening new ones.

### 4. Lint a Schema

1. Open a `.graphql` file and run `GraphQL Workbench: Lint Schema`
2. Deselect any rules you want to skip from the picker
3. Violations appear in the **Problems** panel as warnings
4. Use the lightbulb quick-fix to dismiss individual violations or all violations in a file

See `docs/lint-rules.md` in the extension directory for the full list of rules.

### 5. Analyze Schema Design

1. Embed a schema first (step 1 above)
2. Run `GraphQL Workbench: Analyze Schema Design`
3. A markdown report opens evaluating naming conventions, documentation, anti-patterns, query design, and mutation design
4. Use **Markdown: Open Preview** to render the report

### 6. Introspect an Endpoint

1. Run `GraphQL Workbench: Introspect Endpoint to File`
2. Enter the endpoint URL and optional auth headers
3. Choose a save location for the `.graphql` file

## LLM Provider Setup

### Ollama (default)

1. Install [Ollama](https://ollama.com)
2. Pull the default model: `ollama pull qwen2.5`
3. Ensure Ollama is running on the default port (11434), or update `graphqlWorkbench.ollamaBaseUrl`

No API key is needed.

### Ollama Cloud

1. Set `graphqlWorkbench.llmProvider` to `"ollama-cloud"`
2. Set `graphqlWorkbench.ollamaCloudApiKey` to your API key
3. Optionally set `graphqlWorkbench.llmModel` (defaults to `qwen2.5`)

### OpenAI

1. Set `graphqlWorkbench.llmProvider` to `"openai"`
2. Set `graphqlWorkbench.openaiApiKey` to your API key
3. Optionally set `graphqlWorkbench.llmModel` (defaults to `gpt-4o-mini`)

### Anthropic

1. Set `graphqlWorkbench.llmProvider` to `"anthropic"`
2. Set `graphqlWorkbench.anthropicApiKey` to your API key
3. Optionally set `graphqlWorkbench.llmModel` (defaults to `claude-3-haiku`)

## Vector Store Setup

### PGLite (default)

PGLite stores embeddings locally with no external dependencies. Data persists in VS Code's extension storage.

### PostgreSQL

1. Install PostgreSQL with the pgvector extension
2. Create a database:
   ```sql
   CREATE DATABASE graphql_embeddings;
   \c graphql_embeddings
   CREATE EXTENSION vector;
   ```
3. Update settings:
   ```json
   {
     "graphqlWorkbench.vectorStore": "postgres",
     "graphqlWorkbench.postgresConnectionString": "postgresql://user:pass@localhost:5432/graphql_embeddings"
   }
   ```

## Requirements

- VS Code 1.85.0 or later
- An LLM provider for operation generation and schema design analysis (Ollama runs locally with no API key)
- For PostgreSQL vector store: a PostgreSQL server with the pgvector extension

## Notes

- The embedding model (~313 MB) is downloaded automatically on first use and cached locally
- Embeddings persist between VS Code sessions
- Each table name provides an isolated set of embeddings, allowing multiple schemas side by side
- The Output panel (`GraphQL Workbench`) shows detailed logs for all operations
