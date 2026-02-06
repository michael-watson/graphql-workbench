# Agent Instructions

This document provides guidance for AI agents working within the graphql-embedding repository.

## Repository Overview

This is a TypeScript monorepo using npm workspaces. It contains five packages that work together to embed GraphQL schemas and generate operations from natural language queries.

## Package Dependency Graph

```
graphql-embedding-parser (no internal dependencies)
         ↓
graphql-embedding-core (depends on parser)
         ↓
graphql-embedding (depends on core)
graphql-embedding-operation (depends on core and parser)
graphql-embedding-schema-design (depends on core)
         ↓
graphql-workbench (depends on all above, separate build)
```

Build order must respect these dependencies. The root `tsconfig.json` uses TypeScript project references to handle this automatically via `tsc --build`.

**Note:** The VS Code extension (`graphql-workbench`) has its own build process using esbuild and is not part of the TypeScript project references.

## Package Responsibilities

### graphql-embedding-parser

**Location:** `packages/graphql-embedding-parser/`

Parses GraphQL schema AST into `EmbeddingDocument` objects. Uses the `visit` function from `graphql-js` to traverse schema definitions.

**Key exports:**

- `parseSchema(schemaAst: DocumentNode): EmbeddingDocument[]`
- `EmbeddingDocument` type
- `DocumentType` type

**When to modify:** Changes to how schemas are parsed, new document types, additional metadata extraction.

### graphql-embedding-core

**Location:** `packages/graphql-embedding-core/`

Defines interfaces and provides vector store implementations.

**Key exports:**

- `EmbeddingProvider` interface - implement this for custom embedding models
- `VectorStore` interface - implement this for custom vector databases
- `EmbeddingService` class - orchestrates embedding and storage
- `PGLiteVectorStore` - in-memory/local vector store using PGLite
- `PostgresVectorStore` - production vector store using PostgreSQL + pgvector

**When to modify:** New vector store implementations, changes to interfaces, embedding service logic.

### graphql-embedding

**Location:** `packages/graphql-embedding/`

Provides a concrete `EmbeddingProvider` implementation using node-llama-cpp with a local GGUF model.

**Key exports:**

- `LlamaEmbeddingProvider` class

**When to modify:** Changes to the llama.cpp integration, model loading, embedding generation.

**Note:** The `models/` directory contains the GGUF model file. This is a large binary file.

### graphql-embedding-operation

**Location:** `packages/graphql-embedding-operation/`

Generates GraphQL operations from natural language by searching embedded documents and constructing queries/mutations.

**Key exports:**

- `DynamicOperationGenerator` class
- `DynamicGeneratedOperation` type

**When to modify:** Operation generation logic, LLM-based field selection, validation retry loop.

### graphql-embedding-schema-design

**Location:** `packages/graphql-embedding-schema-design/`

Analyzes GraphQL schemas against design best practices using embedded documents and LLMs.

**Key exports:**

- `SchemaDesignAnalyzer` class
- `SchemaDesignAnalyzerOptions` type
- `SchemaDesignReport` type
- Re-exports LLM providers (`OllamaProvider`, `OpenAIProvider`, `AnthropicProvider`) from core

**When to modify:** Changes to schema design analysis, best practice rules, or report generation.

### graphql-workbench

**Location:** `packages/graphql-workbench/`

VS Code extension that provides commands for embedding schemas and generating operations.

**Key files:**

- `src/extension.ts` - Extension entry point, command registration
- `src/services/embedding-manager.ts` - Manages embedding provider and vector store lifecycle
- `src/commands/*.ts` - Individual command implementations

**Build system:** Uses esbuild (not tsc) due to VS Code extension requirements.

**When to modify:** Adding new commands, changing UI/UX, updating settings.

**Special considerations:**

- Uses dynamic imports for ESM-only packages (PGLite, node-llama-cpp)
- Must externalize native modules in esbuild config
- Settings defined in `package.json` under `contributes.configuration`

## Common Tasks

### Adding a new vector store implementation

1. Create a new file in `packages/graphql-embedding-core/src/` (e.g., `milvus-store.ts`)
2. Implement the `VectorStore` interface:

   ```typescript
   import type {
     VectorStore,
     StoredDocument,
     SearchResult,
   } from "./interfaces.js";

   export class MilvusVectorStore implements VectorStore {
     async initialize(): Promise<void> {}
     async store(documents: StoredDocument[]): Promise<void> {}
     async search(
       embedding: number[],
       limit?: number,
     ): Promise<SearchResult[]> {}
     async delete(ids: string[]): Promise<void> {}
     async clear(): Promise<void> {}
     async close(): Promise<void> {}
   }
   ```

3. Export from `packages/graphql-embedding-core/src/index.ts`
4. Add any new dependencies to `packages/graphql-embedding-core/package.json` as peer dependencies

### Adding a new document type to the parser

1. Add the type to `DocumentType` union in `packages/graphql-embedding-parser/src/index.ts`
2. Add a new visitor method in `parseSchema()` for the corresponding GraphQL AST node
3. Create appropriate `EmbeddingDocument` objects with relevant metadata

### Modifying the embedding interface

The `EmbeddingProvider` interface is in `packages/graphql-embedding-core/src/interfaces.ts`. Changes here affect:

- `graphql-embedding` package (must update `LlamaEmbeddingProvider`)
- Any user-implemented custom providers

### Adding tests

Tests go in `__tests__/` directories within each package:

```
packages/graphql-embedding-parser/__tests__/parser.test.ts
packages/graphql-embedding-core/__tests__/service.test.ts
```

## Build Commands

```bash
# Build library packages (respects dependency order)
npm run build

# Build VS Code extension
npm run build --workspace=graphql-workbench

# Clean all build artifacts
npm run clean

# Type check without emitting
npm run typecheck

# Run tests
npm run test

# Package VS Code extension for distribution
npm run package --workspace=graphql-workbench
```

## File Patterns

| Pattern                                         | Purpose                            |
| ----------------------------------------------- | ---------------------------------- |
| `packages/*/src/index.ts`                       | Package entry points               |
| `packages/*/src/interfaces.ts`                  | Type definitions                   |
| `packages/*/tsconfig.json`                      | Package-specific TypeScript config |
| `packages/*/package.json`                       | Package manifest with dependencies |
| `tsconfig.base.json`                            | Shared compiler options            |
| `tsconfig.json`                                 | Project references for build order |
| `packages/graphql-workbench/src/extension.ts`   | VS Code extension entry            |
| `packages/graphql-workbench/src/commands/*.ts`  | VS Code command handlers           |
| `packages/graphql-workbench/esbuild.config.mjs` | VS Code extension bundler config   |

## Important Conventions

### Imports between packages

Use package names, not relative paths:

```typescript
// Correct
import { EmbeddingDocument } from "graphql-embedding-parser";

// Incorrect
import { EmbeddingDocument } from "../graphql-embedding-parser/src";
```

TypeScript path mappings in each package's `tsconfig.json` resolve these to source files during development.

### Adding dependencies

- **Internal dependencies:** Add to `dependencies` in package.json with `^0.1.0` version
- **External runtime dependencies:** Add to `dependencies`
- **External optional dependencies:** Add to `peerDependencies` with `peerDependenciesMeta` marking as optional
- **Type-only dependencies:** Add to `devDependencies`

### Exports

All packages use explicit exports in `package.json`:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.js"
    }
  }
}
```

### Module format

Packages use `NodeNext` module resolution and output ES modules. Use `.js` extensions in relative imports:

```typescript
import { foo } from "./utils.js";
```

## Versioning

This repository uses changesets for version management. When making changes:

1. Run `npm run changeset`
2. Select affected packages
3. Choose version bump type (patch/minor/major)
4. Write a changelog entry

Do not manually edit version numbers in package.json files.

## Error Handling

- Throw descriptive errors with context
- Check initialization state before operations (e.g., `LlamaEmbeddingProvider.initialize()`)
- Use TypeScript strict mode - handle all nullable values

## Testing Changes Locally

To verify changes work end-to-end:

```typescript
import { parse } from "graphql";
import { parseSchema } from "graphql-embedding-parser";
import { EmbeddingService, PGLiteVectorStore } from "graphql-embedding-core";
import { LlamaEmbeddingProvider } from "graphql-embedding";

const schema = parse(`type Query { hello: String }`);
const docs = parseSchema(schema);

const provider = new LlamaEmbeddingProvider();
await provider.initialize();

const store = new PGLiteVectorStore({
  client: pglite,
  dimensions: provider.dimensions,
});

const service = new EmbeddingService({
  embeddingProvider: provider,
  vectorStore: store,
});

await service.initialize();
await service.embedAndStore(docs);
const results = await service.search("hello query");
```

## Debugging Tips

- Check that `npm run build` succeeds before testing
- Verify TypeScript path mappings if imports fail
- Check that vector dimensions match between embedding provider and vector store
- PGLite requires the `vector` extension to be loaded
- Use "Run & Debug" panel in VS Code to debug vs code extension with the latest packages code locally is rebuilt and used.

## Do Not

- Modify `package-lock.json` manually
- Change module resolution strategy without updating all packages
- Add circular dependencies between packages
- Commit large model files to git (they belong in `models/` with `.gitkeep`)
- Skip the changeset step when making publishable changes
