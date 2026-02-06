# Getting Started

## Prerequisites

- **VS Code** 1.85.0 or later
- **Node.js** 18 or later
- An **LLM provider** for dynamic operation generation and schema design analysis (one of):
  - [Ollama](https://ollama.com) running locally (default)
  - An OpenAI API key
  - An Anthropic API key
- **Rover CLI** (optional) -- required for federated schema validation. Install with:
  ```bash
  curl -sSL https://rover.apollo.dev/nix/latest | sh
  ```

## Installation

Install the extension from a `.vsix` package:

1. Build the extension:
   ```bash
   npm run build
   cd packages/graphql-workbench
   npm run package
   ```
2. In VS Code, open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run **Extensions: Install from VSIX...**
3. Select the generated `.vsix` file.

The extension activates automatically when you open a `.graphql` file or when your workspace contains any `.graphql` files.

## Quick Start

### Using the Schema Design Workbench

The easiest way to get started is with the Schema Design Workbench:

1. Click the **GraphQL Workbench** icon in the VS Code activity bar (left sidebar).
2. The extension automatically discovers your `.graphql` files and `supergraph.yaml` configurations.
3. Click a design to expand it and see its types, or right-click to access actions like validation and embedding.

For federated designs, the workbench uses the Rover CLI to validate and compose schemas. Install it with:

```bash
curl -sSL https://rover.apollo.dev/nix/latest | sh
```

### 1. Embed a Schema

Before you can generate operations or analyze your schema, you need to embed it into a vector store.

**From the Workbench:**
- Right-click any design in the Schema Design Workbench and select **Embed Schema**.
- Or click the "Embedding" row (when it shows "not embedded") to start embedding.

**From a file:**
- Open a `.graphql` schema file, then run **GraphQL Workbench: Embed Schema from File** from the Command Palette.

**From an endpoint:**
- Run **GraphQL Workbench: Embed Schema from Endpoint** and enter your GraphQL API URL.

All methods prompt you for a table name. The default (`graphql_embeddings` or `{designName}_embeddings`) works for most cases.

### 2. Generate an Operation

Once your schema is embedded, run **GraphQL Workbench: Generate Operation** from the Command Palette.

1. Select an embedding table from the quick-pick list (or enter one manually).
2. Enter a natural language description of the operation you want, such as:

   > get all users with their posts

3. The Explorer panel opens with the generated operation loaded into Apollo Explorer, ready to run against your endpoint.

You can also open the Explorer panel directly with **GraphQL Workbench: Open Explorer Panel** and generate operations from within it.

### 3. Lint Your Schema

Run **GraphQL Workbench: Lint Schema** on any `.graphql` file. Select which lint rules to apply, and violations appear in the VS Code Problems panel.

## Vector Store Options

The extension supports two vector store backends:

| Backend | Description | Best for |
|---------|-------------|----------|
| **PGLite** (default) | Embedded database stored locally in VS Code's extension storage. No setup required. | Individual use, quick start |
| **PostgreSQL** | Connects to an external PostgreSQL instance with `pgvector` installed. | Teams, shared environments, large schemas |

Change the backend in **Settings > GraphQL Workbench > Vector Store**.

## Next Steps

- [Commands Reference](./commands.md) -- full details on every command
- [Configuration Reference](./configuration.md) -- all available settings
- [Lint Rules Reference](./lint-rules.md) -- every lint rule explained
