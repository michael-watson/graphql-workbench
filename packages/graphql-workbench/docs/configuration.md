# Configuration Reference

All settings are under the `graphqlWorkbench` namespace. Open **Settings** (`Ctrl+,` / `Cmd+,`) and search for "GraphQL Workbench" to find them.

## Vector Store

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `graphqlWorkbench.vectorStore` | `"pglite"` \| `"postgres"` | `"pglite"` | Which vector store backend to use. PGLite is embedded and requires no setup. PostgreSQL requires a running instance with `pgvector`. |
| `graphqlWorkbench.postgresConnectionString` | string | `"postgresql://postgres@localhost:5432/postgres"` | Connection string for PostgreSQL. Only used when `vectorStore` is `"postgres"`. |

## Embedding Model

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `graphqlWorkbench.modelPath` | string | `""` (auto-download) | Path to a custom GGUF embedding model file. Leave empty to automatically download the default model (~313 MB) on first use. The model is cached in the extension's global storage. |

## Operation Generation

| Setting | Type | Default | Range | Description |
|---------|------|---------|-------|-------------|
| `graphqlWorkbench.minSimilarityScore` | number | `0.4` | 0--1 | Minimum cosine similarity score for vector search results. Lower values return more results but may include less relevant matches. |
| `graphqlWorkbench.maxDocuments` | number | `50` | 1--200 | Maximum number of documents to retrieve from vector search. |
| `graphqlWorkbench.maxValidationRetries` | number | `5` | 1--10 | Maximum number of attempts the LLM gets to fix an invalid generated operation before giving up. |

## LLM Provider

These settings apply to dynamic operation generation and schema design analysis.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `graphqlWorkbench.llmProvider` | `"ollama"` \| `"ollama-cloud"` \| `"openai"` \| `"anthropic"` | `"ollama"` | Which LLM provider to use. |
| `graphqlWorkbench.llmModel` | string | `""` (provider default) | Model name to use. When empty, uses the provider's default: `qwen2.5` for Ollama, `gpt-4o-mini` for OpenAI, `claude-3-haiku` for Anthropic. |
| `graphqlWorkbench.ollamaBaseUrl` | string | `"http://localhost:11434"` | Base URL for the Ollama API. |
| `graphqlWorkbench.ollamaCloudApiKey` | string | `""` | Ollama Cloud API key. Required when `llmProvider` is `"ollama-cloud"`. |
| `graphqlWorkbench.openaiApiKey` | string | `""` | OpenAI API key. Required when `llmProvider` is `"openai"`. |
| `graphqlWorkbench.anthropicApiKey` | string | `""` | Anthropic API key. Required when `llmProvider` is `"anthropic"`. |

## LLM Sampling Parameters

These parameters control how the LLM generates text. Lower temperature values produce more deterministic output.

| Setting | Type | Default | Range | Description |
|---------|------|---------|-------|-------------|
| `graphqlWorkbench.llmTemperature` | number | `0.2` | 0--2 | Controls randomness. Lower values make output more focused and deterministic. |
| `graphqlWorkbench.llmTopK` | number | `40` | 1--100 | Limits token selection to the top K most likely tokens at each step. |
| `graphqlWorkbench.llmTopP` | number | `0.9` | 0--1 | Nucleus sampling threshold. The model considers tokens whose cumulative probability reaches this value. |

## Provider Setup

### Ollama (default)

1. Install [Ollama](https://ollama.com).
2. Pull the default model: `ollama pull qwen2.5`
3. Ensure Ollama is running on the default port (11434), or update `graphqlWorkbench.ollamaBaseUrl`.

No API key is needed.

### Ollama Cloud

1. Set `graphqlWorkbench.llmProvider` to `"ollama-cloud"`.
2. Set `graphqlWorkbench.ollamaCloudApiKey` to your API key.
3. Optionally set `graphqlWorkbench.llmModel` (defaults to `qwen2.5`).

### OpenAI

1. Set `graphqlWorkbench.llmProvider` to `"openai"`.
2. Set `graphqlWorkbench.openaiApiKey` to your API key.
3. Optionally set `graphqlWorkbench.llmModel` (defaults to `gpt-4o-mini`).

### Anthropic

1. Set `graphqlWorkbench.llmProvider` to `"anthropic"`.
2. Set `graphqlWorkbench.anthropicApiKey` to your API key.
3. Optionally set `graphqlWorkbench.llmModel` (defaults to `claude-3-haiku`).

## Schema Design Workbench

These settings control the Schema Design Workbench activity bar panel.

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `graphqlWorkbench.enableDesignWorkbench` | boolean | `true` | Show the Schema Design Workbench activity bar tab. Disable to hide the panel. |
| `graphqlWorkbench.roverPath` | string | `"rover"` | Path to the Rover CLI executable for federated schema validation. Use the full path if `rover` is not in your system PATH. |
| `graphqlWorkbench.validateOnSave` | boolean | `true` | Automatically validate schema designs when `.graphql` or `supergraph.yaml` files are saved. |

### Rover CLI Setup

The Schema Design Workbench uses the [Rover CLI](https://www.apollographql.com/docs/rover/) to validate and compose federated schemas.

1. Install Rover:
   ```bash
   curl -sSL https://rover.apollo.dev/nix/latest | sh
   ```
   Or see the [Rover installation docs](https://www.apollographql.com/docs/rover/getting-started) for other methods.

2. Verify installation:
   ```bash
   rover --version
   ```

3. If `rover` is not in your PATH, set the full path in settings:
   ```json
   {
     "graphqlWorkbench.roverPath": "/usr/local/bin/rover"
   }
   ```

Rover is only required for federated schema validation. Standalone schemas use the built-in `graphql` library.
