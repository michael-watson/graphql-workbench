# Contributing to GraphQL Embedding

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm 9 or later
- Git

### Setup

1. Fork the repository and clone your fork:

```bash
git clone https://github.com/<your-username>/graphql-embedding.git
cd graphql-embedding
```

2. Install dependencies:

```bash
npm install
```

3. Download the embedding model:

```bash
npm run download:model
```

This downloads the [embeddinggemma-300M-Q8_0.gguf](https://huggingface.co/unsloth/embeddinggemma-300m-GGUF) model from Hugging Face into `packages/graphql-embedding/models/`. The model file is not checked into the repository due to its size.

4. Build all packages:

```bash
npm run build
```

5. Verify everything works:

```bash
npm run typecheck
```

## Project Structure

```
graphql-embedding/
├── packages/
│   ├── graphql-embedding-parser/        # Schema parsing into embeddable documents
│   ├── graphql-embedding-core/          # Core interfaces, vector stores, and LLM providers
│   ├── graphql-embedding/               # node-llama-cpp embedding provider
│   ├── graphql-embedding-operation/     # Dynamic operation generation from natural language
│   ├── graphql-embedding-schema-design/ # Schema design analysis
│   └── graphql-workbench/               # VS Code extension
├── graphs/                              # Sample GraphQL schemas for testing
├── tsconfig.base.json                   # Shared TypeScript config
├── tsconfig.json                        # Project references
├── vitest.config.ts                     # Test configuration
└── package.json                         # Workspace configuration
```

### Package Dependency Graph

```
graphql-embedding-parser (foundation - no internal deps)
    │
graphql-embedding-core (depends on parser)
    │
    ├── graphql-embedding (depends on core)
    ├── graphql-embedding-operation (depends on core, parser)
    └── graphql-embedding-schema-design (depends on core)
    │
graphql-workbench (VS Code extension - depends on all packages)
```

## Development Workflow

### Making Changes

1. Create a new branch for your feature or fix:

```bash
git checkout -b feature/my-new-feature
```

2. Make your changes in the relevant package(s) under `packages/`.

3. Build to check for compilation errors:

```bash
npm run build
```

4. Run type checking:

```bash
npm run typecheck
```

### Testing Your Changes

#### Unit Testing

Tests use [Vitest](https://vitest.dev/) and follow the convention of placing test files in a `__tests__` directory within each package using the `.eval.ts` extension.

1. Create a `__tests__` directory in the package if one doesn't exist:

```bash
mkdir packages/graphql-embedding-parser/__tests__
```

2. Add test files using the `.eval.ts` extension (e.g., `my-feature.eval.ts`).

3. Run tests:

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

#### Manual Testing

You can test packages locally before publishing:

1. **Test the parser:**

```typescript
// test-parser.ts
import { parse } from "graphql";
import { parseSchema } from "./packages/graphql-embedding-parser/src";

const schema = parse(`
  type Query {
    hello: String
  }
`);

const docs = parseSchema(schema);
console.log(JSON.stringify(docs, null, 2));
```

Run with:

```bash
npx tsx test-parser.ts
```

2. **Test with a local database:**

```typescript
// test-embedding.ts
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { parse } from "graphql";
import { parseSchema } from "./packages/graphql-embedding-parser/src";
import {
  EmbeddingService,
  PGLiteVectorStore,
} from "./packages/graphql-embedding-core/src";
import { LlamaEmbeddingProvider } from "./packages/graphql-embedding/src";

async function main() {
  // Parse schema
  const schemaAst = parse(`
    type User {
      id: ID!
      name: String!
    }
    type Query {
      user(id: ID!): User
      users: [User!]!
    }
  `);
  const documents = parseSchema(schemaAst);
  console.log(`Parsed ${documents.length} documents`);

  // Initialize embedding provider
  const embeddingProvider = new LlamaEmbeddingProvider();
  await embeddingProvider.initialize();
  console.log(`Embedding dimensions: ${embeddingProvider.dimensions}`);

  // Initialize vector store
  const pglite = new PGlite({ extensions: { vector } });
  const vectorStore = new PGLiteVectorStore({
    client: pglite,
    dimensions: embeddingProvider.dimensions,
  });

  // Create service and embed
  const service = new EmbeddingService({
    embeddingProvider,
    vectorStore,
  });
  await service.initialize();
  await service.embedAndStore(documents);
  console.log("Documents embedded and stored");

  // Test search
  const results = await service.search("get user by id");
  console.log("Search results:", results.map(r => ({
    name: r.document.name,
    score: r.score.toFixed(4),
  })));

  await service.close();
}

main().catch(console.error);
```

Run with:

```bash
npx tsx test-embedding.ts
```

#### Testing Package Links

To test how your changes work when installed as a dependency:

1. Build all packages:

```bash
npm run build
```

2. Create a test project outside the monorepo:

```bash
mkdir ../test-project
cd ../test-project
npm init -y
```

3. Link the local packages:

```bash
npm link ../graphql-embedding/packages/graphql-embedding-parser
npm link ../graphql-embedding/packages/graphql-embedding-core
```

4. Test importing and using the packages in your test project.

### Code Style

- Use TypeScript for all code
- Follow existing patterns in the codebase
- Keep functions focused and well-named
- Add JSDoc comments for public APIs
- Avoid introducing new dependencies unless necessary

### Commit Messages

Write clear, descriptive commit messages:

```
feat(parser): add support for directive parsing

- Parse directives on types and fields
- Include directive arguments in metadata
- Add tests for common directives
```

Prefixes:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Submitting a Pull Request

### Before Submitting

1. Ensure your code builds without errors:

```bash
npm run build
```

2. Run type checking:

```bash
npm run typecheck
```

3. Run tests (if available):

```bash
npm run test
```

4. Create a changeset describing your changes:

```bash
npm run changeset
```

Follow the prompts to:
- Select the packages you changed
- Choose the version bump type (patch/minor/major)
- Write a summary of your changes

### Creating the PR

1. Push your branch to your fork:

```bash
git push origin feature/my-new-feature
```

2. Open a pull request against the `main` branch.

3. In your PR description, include:
   - What changes you made and why
   - How to test the changes
   - Any breaking changes or migration steps
   - Related issues (if any)

### PR Review Process

- A maintainer will review your PR
- Address any feedback by pushing additional commits
- Once approved, a maintainer will merge your PR

## Adding a New Package

If you need to add a new package:

1. Create the package directory:

```bash
mkdir -p packages/graphql-embedding-newpkg/src
```

2. Create `package.json`:

```json
{
  "name": "graphql-embedding-newpkg",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "clean": "rm -rf dist *.tsbuildinfo"
  }
}
```

3. Create `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

4. Add the package to root `tsconfig.json` references:

```json
{
  "references": [
    // ... existing references
    { "path": "packages/graphql-embedding-newpkg" }
  ]
}
```

5. If your package depends on other packages in the monorepo, add them as dependencies in your `package.json`:

```json
{
  "dependencies": {
    "graphql-embedding-core": "^0.1.0"
  }
}
```

And add project references in your package's `tsconfig.json`:

```json
{
  "references": [
    { "path": "../graphql-embedding-core" }
  ]
}
```

6. Run `npm install` to link the new package.

## Adding a New LLM Provider

The `graphql-embedding-core` package defines the `LLMProvider` interface. To add a new provider:

1. Create a new file in `packages/graphql-embedding-core/src/` (e.g., `my-llm-provider.ts`).

2. Implement the `LLMProvider` interface:

```typescript
import type { LLMProvider, ChatMessage, LLMCompletionOptions } from "./interfaces.js";

export interface MyProviderOptions {
  apiKey: string;
  model?: string;
}

export class MyProvider implements LLMProvider {
  readonly name = "my-provider";
  readonly model: string;

  constructor(options: MyProviderOptions) {
    this.model = options.model ?? "default-model";
  }

  async initialize(): Promise<void> {
    // Validate credentials, warm up connections, etc.
  }

  async complete(messages: ChatMessage[], options?: LLMCompletionOptions): Promise<string> {
    // Send messages to the LLM API and return the response text
  }

  async dispose(): Promise<void> {
    // Clean up resources
  }
}
```

3. Export the provider from the package's `index.ts`.

## Testing Different Embedding Models

The `graphql-embedding` package uses GGUF models via `node-llama-cpp`. The default bundled model is `embeddinggemma-300M-Q8_0.gguf`, located in `packages/graphql-embedding/models/`. You can test alternative embedding models by adding them to this directory and debugging through the VS Code extension.

### Adding a Model

1. Download a GGUF embedding model (e.g., from [Hugging Face](https://huggingface.co/models?search=gguf+embedding)).

2. Place the `.gguf` file in the models directory:

```bash
cp ~/Downloads/my-embedding-model.gguf packages/graphql-embedding/models/
```

### Debugging with the VS Code Extension

The repository includes launch configurations for debugging the `graphql-workbench` extension, which is the easiest way to test a new model end-to-end.

1. Build the packages:

```bash
npm run build
```

2. Open this repository in VS Code and press `F5` (or select **Run > Start Debugging**). Choose the **"Run GraphQL Workbench Extension"** launch configuration. This opens an Extension Development Host window with the extension loaded.

3. In the Extension Development Host, open VS Code settings and set `graphqlWorkbench.modelPath` to the absolute path of your new model:

```
/absolute/path/to/graphql-embedding/packages/graphql-embedding/models/my-embedding-model.gguf
```

4. Use the command palette to run **GraphQL Workbench: Embed Schema from File** on one of the sample schemas in the `graphs/` directory. The output channel (**GraphQL Workbench**) will show the model being loaded and the embedding dimensions.

5. Run **GraphQL Workbench: Generate Operation** and enter a natural language query to test the full pipeline with your model.

### What to Look For

When evaluating a new embedding model, check:

- **Dimensions**: Different models produce vectors of different sizes. The vector store is initialized with the model's dimension count, so this is handled automatically.
- **Similarity scores**: After embedding a schema, use **Generate Operation** and observe the similarity scores in the output channel. Higher scores for relevant fields indicate better model performance for GraphQL content.
- **Context size**: The default context size is 2048 tokens. If your model supports a different context size, you can pass `contextSize` when constructing `LlamaEmbeddingProvider` programmatically.

### Switching Back to the Default Model

Clear the `graphqlWorkbench.modelPath` setting (set it to an empty string) to revert to the bundled `embeddinggemma-300M-Q8_0.gguf` model. The extension will reinitialize with the default model on the next operation.

## Questions?

If you have questions or need help, feel free to:
- Open an issue for discussion
- Ask in the PR comments

Thank you for contributing!
