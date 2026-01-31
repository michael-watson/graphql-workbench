# GraphQL Embedding

A suite of packages for embedding GraphQL schemas and generating dynamic operations based on natural language queries.

## Packages

| Package | Description |
|---------|-------------|
| `graphql-embedding-parser` | Parse GraphQL schemas into embeddable documents |
| `graphql-embedding-core` | Core interfaces, vector store implementations, and LLM providers |
| `graphql-embedding` | Embedding provider using node-llama-cpp with a local GGUF model |
| `graphql-embedding-operation` | Generate GraphQL operations from natural language |
| `graphql-embedding-schema-design` | Analyze GraphQL schemas against design best practices |
| `graphql-workbench` | VS Code extension for embedding, operation generation, and schema analysis |

## Installation

Install the packages you need:

```bash
# Core packages (required)
npm install graphql-embedding-parser graphql-embedding-core

# Local embedding with node-llama-cpp
npm install graphql-embedding

# Operation generation
npm install graphql-embedding-operation
```

## Quick Start

### 1. Parse a GraphQL Schema

```typescript
import { parse } from "graphql";
import { parseSchema } from "graphql-embedding-parser";

const schemaSDL = `
  type User {
    id: ID!
    name: String!
    email: String!
    posts: [Post!]!
  }

  type Post {
    id: ID!
    title: String!
    content: String!
    author: User!
  }

  type Query {
    user(id: ID!): User
    users: [User!]!
    post(id: ID!): Post
    posts: [Post!]!
  }

  type Mutation {
    createUser(name: String!, email: String!): User!
    createPost(title: String!, content: String!, authorId: ID!): Post!
  }
`;

const schemaAst = parse(schemaSDL);
const documents = parseSchema(schemaAst);

console.log(`Parsed ${documents.length} documents`);
```

### 2. Embed and Store Documents

```typescript
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import {
  EmbeddingService,
  PGLiteVectorStore,
} from "graphql-embedding-core";
import { LlamaEmbeddingProvider } from "graphql-embedding";

// Initialize the embedding provider
const embeddingProvider = new LlamaEmbeddingProvider({
  // Uses bundled model by default, or specify your own:
  // modelPath: "/path/to/your/model.gguf"
});
await embeddingProvider.initialize();

// Initialize vector store with PGLite
const pglite = new PGlite({ extensions: { vector } });
const vectorStore = new PGLiteVectorStore({
  client: pglite,
  dimensions: embeddingProvider.dimensions,
});

// Create the embedding service
const embeddingService = new EmbeddingService({
  embeddingProvider,
  vectorStore,
});

await embeddingService.initialize();

// Embed and store the parsed documents
await embeddingService.embedAndStore(documents);
```

### 3. Generate Operations from Natural Language

```typescript
import { buildSchema } from "graphql";
import { DynamicOperationGenerator, OllamaProvider } from "graphql-embedding-operation";

const schema = buildSchema(schemaSDL);

const llmProvider = new OllamaProvider({ model: "qwen2.5" });
await llmProvider.initialize();

const generator = new DynamicOperationGenerator({
  llmProvider,
  vectorStore,
  schema,
});

// Embed the user input first
const inputVector = await embeddingProvider.embed("get all users with their posts");

// Generate a query from natural language
const result = await generator.generateDynamicOperation({
  inputVector,
  inputText: "get all users with their posts",
});

console.log(result.operation);
// Output: a valid GraphQL query for the users field
console.log(result.operationType); // "query"
console.log(result.rootField);     // "users"
```

## LLM Providers

The operation generation and schema analysis packages require an LLM provider. Three providers are available out of the box, and the interface is extensible for custom implementations.

### Ollama (default)

```typescript
import { OllamaProvider } from "graphql-embedding-core";

const llm = new OllamaProvider({
  model: "qwen2.5",               // default model
  baseUrl: "http://localhost:11434", // default URL
});
await llm.initialize();
```

### OpenAI

```typescript
import { OpenAIProvider } from "graphql-embedding-core";

const llm = new OpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o-mini", // default model
});
await llm.initialize();
```

### Anthropic

```typescript
import { AnthropicProvider } from "graphql-embedding-core";

const llm = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-3-haiku", // default model
});
await llm.initialize();
```

### Custom LLM Provider

Implement the `LLMProvider` interface to use any LLM service:

```typescript
import type { LLMProvider, ChatMessage, LLMCompletionOptions } from "graphql-embedding-core";

class MyLLMProvider implements LLMProvider {
  readonly name = "my-provider";
  readonly model = "my-model";

  async initialize(): Promise<void> { /* ... */ }
  async complete(messages: ChatMessage[], options?: LLMCompletionOptions): Promise<string> { /* ... */ }
  async dispose(): Promise<void> { /* ... */ }
}
```

## Using with PostgreSQL + pgvector

For production use with PostgreSQL and pgvector:

```typescript
import { Pool } from "pg";
import { PostgresVectorStore } from "graphql-embedding-core";

const pool = new Pool({
  connectionString: "postgresql://user:pass@localhost:5432/mydb",
});

const vectorStore = new PostgresVectorStore({
  pool,
  dimensions: embeddingProvider.dimensions,
  tableName: "graphql_embeddings", // optional, defaults to this
});
```

## Custom Embedding Provider

Implement the `EmbeddingProvider` interface to use your own embedding model:

```typescript
import type { EmbeddingProvider } from "graphql-embedding-core";

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async initialize(): Promise<void> {
    // Any initialization logic
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: "text-embedding-3-small",
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }

  get dimensions(): number {
    return 1536; // text-embedding-3-small dimensions
  }

  async dispose(): Promise<void> {
    // Cleanup if needed
  }
}
```

## Schema Design Analysis

Analyze your GraphQL schema against design best practices:

```typescript
import { SchemaDesignAnalyzer } from "graphql-embedding-schema-design";

const analyzer = new SchemaDesignAnalyzer({
  llmProvider,
  vectorStore,
});

const report = await analyzer.analyze();
console.log(report.markdown); // Markdown-formatted analysis
```

## VS Code Extension

The `graphql-workbench` package provides a VS Code extension for embedding schemas, generating operations, and analyzing schema design directly in your editor.

### Features

- **Embed Schema from File**: Right-click a `.graphql` file or use the command palette
- **Embed Schema from Endpoint**: Introspect a GraphQL endpoint and embed its schema
- **Generate Operation**: Describe what you want in natural language and get a GraphQL operation
- **Introspect Endpoint**: Introspect a GraphQL endpoint to retrieve its schema
- **Lint Schema**: Lint a schema against best practices
- **Analyze Schema Design**: Get an LLM-powered analysis of your schema design
- **Clear Embeddings**: Remove all stored embeddings

### Installation

Install from the VS Code Marketplace or build locally:

```bash
cd packages/graphql-workbench
npm run package
# Install the generated .vsix file
```

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `graphqlWorkbench.vectorStore` | `pglite` | Use `pglite` (local) or `postgres` |
| `graphqlWorkbench.postgresConnectionString` | `postgresql://localhost:5432/graphql_embeddings` | PostgreSQL connection string |
| `graphqlWorkbench.modelPath` | `` | Path to custom GGUF model |
| `graphqlWorkbench.llmProvider` | `ollama` | LLM provider: `ollama`, `openai`, or `anthropic` |
| `graphqlWorkbench.llmModel` | `` | Model identifier (uses provider default if empty) |
| `graphqlWorkbench.ollamaBaseUrl` | `http://localhost:11434` | Ollama API base URL |
| `graphqlWorkbench.openaiApiKey` | `` | OpenAI API key |
| `graphqlWorkbench.anthropicApiKey` | `` | Anthropic API key |
| `graphqlWorkbench.llmTemperature` | `0.2` | LLM temperature (0-2) |
| `graphqlWorkbench.llmTopK` | `40` | LLM top-k sampling (1-100) |
| `graphqlWorkbench.llmTopP` | `0.9` | LLM top-p sampling (0-1) |
| `graphqlWorkbench.minSimilarityScore` | `0.4` | Minimum cosine similarity score for search results (0-1) |
| `graphqlWorkbench.maxDocuments` | `50` | Maximum documents returned from similarity search (1-200) |
| `graphqlWorkbench.maxValidationRetries` | `5` | Maximum LLM retries when fixing invalid operations (1-10) |

## Document Types

The parser generates documents with the following types:

| Type | Description |
|------|-------------|
| `object` | Object type definitions |
| `field` | Individual fields on types |
| `input` | Input object types |
| `enum` | Enum type definitions |
| `interface` | Interface definitions |
| `union` | Union type definitions |
| `scalar` | Custom scalar definitions |
| `query` | Query root type |
| `mutation` | Mutation root type |
| `subscription` | Subscription root type |

Each document contains:

```typescript
interface EmbeddingDocument {
  id: string;           // Unique identifier (e.g., "field:User.name")
  type: DocumentType;   // One of the types above
  name: string;         // Name of the type/field
  description: string | null;  // GraphQL description if present
  content: string;      // Human-readable content for embedding
  metadata: {
    parentType?: string;    // Parent type for fields
    fieldType?: string;     // Return type for fields
    arguments?: ArgumentInfo[];
    enumValues?: string[];
    possibleTypes?: string[];
    interfaces?: string[];
    fields?: string[];
  };
}
```

## Development

### Setup

```bash
git clone <repository-url>
cd graphql-embedding
npm install
npm run download:model
npm run build
```

> **Note:** The `download:model` script downloads the [embeddinggemma-300M-Q8_0.gguf](https://huggingface.co/unsloth/embeddinggemma-300m-GGUF) model from Hugging Face into `packages/graphql-embedding/models/`. This file is required by the `graphql-embedding` package but is not checked into the repository due to its size.

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build all packages |
| `npm run clean` | Clean build artifacts |
| `npm run typecheck` | Type check without emitting |
| `npm run test` | Run tests across all packages |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint all packages |

### Releasing

This project uses [changesets](https://github.com/changesets/changesets) for versioning:

```bash
# Create a changeset describing your changes
npm run changeset

# Update versions based on changesets
npm run version

# Build and publish to npm
npm run release
```

## License

MIT
