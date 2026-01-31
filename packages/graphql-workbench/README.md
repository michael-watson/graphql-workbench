# GraphQL Workbench

Embed GraphQL schemas and generate operations from natural language queries directly in VS Code.

## Features

- **Embed Schema from File**: Parse and embed a `.graphql` schema file
- **Embed Schema from Endpoint**: Introspect a GraphQL endpoint and embed its schema
- **Generate Operation**: Create GraphQL queries/mutations from natural language descriptions
- **Clear Embeddings**: Remove all stored embeddings

## Commands

Open the Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`) and search for:

| Command | Description |
|---------|-------------|
| `GraphQL Workbench: Embed Schema from File` | Embed a local `.graphql` file |
| `GraphQL Workbench: Embed Schema from Endpoint` | Introspect and embed from a GraphQL endpoint |
| `GraphQL Workbench: Generate Operation` | Generate a GraphQL operation from natural language |
| `GraphQL Workbench: Clear All Embeddings` | Clear all stored embeddings |

## Context Menu

Right-click on a `.graphql` file in the Explorer or Editor to access:
- Embed Schema from File
- Generate Operation

## Settings

Configure the extension in VS Code Settings (`Cmd+,` / `Ctrl+,`):

| Setting | Default | Description |
|---------|---------|-------------|
| `graphqlWorkbench.vectorStore` | `pglite` | Vector store type: `pglite` (local) or `postgres` |
| `graphqlWorkbench.postgresConnectionString` | `postgresql://postgres@localhost:5432/postgres` | PostgreSQL connection string |
| `graphqlWorkbench.modelPath` | `` | Path to custom GGUF embedding model |

### Using PGLite (Default)

PGLite stores embeddings locally with no external dependencies. Data persists in VS Code's extension storage.

### Using PostgreSQL

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

## Usage

### 1. Embed a Schema

**From a file:**
1. Open a `.graphql` schema file
2. Run `GraphQL Workbench: Embed Schema from File`
3. Wait for the embedding process to complete

**From an endpoint:**
1. Run `GraphQL Workbench: Embed Schema from Endpoint`
2. Enter the GraphQL endpoint URL
3. Optionally add authorization headers as JSON
4. Wait for introspection and embedding to complete

### 2. Generate Operations

1. Run `GraphQL Workbench: Generate Operation`
2. Enter a natural language description of what you want:
   - "get all users with their posts"
   - "create a new product with name and price"
   - "fetch order by id with line items"
3. The generated operation opens in a new editor tab

## Requirements

- VS Code 1.85.0 or later
- For PostgreSQL: PostgreSQL server with pgvector extension

## Notes

- The first command execution initializes the embedding model (may take a moment)
- Embeddings persist between VS Code sessions
- Each workspace can have its own set of embeddings
- The bundled embedding model is optimized for code-related queries
