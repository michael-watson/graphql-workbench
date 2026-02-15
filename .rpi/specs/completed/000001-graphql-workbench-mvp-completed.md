# 000001: GraphQL Workbench MVP

**Status:** Completed
**Created:** 2026-02-15
**Git Hash:** 65906e4531d64470b3395e0fa367a3d04b6c81da

---

## Context

### Background
This is a retroactive spec documenting everything built in the GraphQL Workbench project from initial commit (2024-05-15) through the adoption of the RPI Loop workflow (2026-02-14). The project went through a complete rewrite on 2026-01-30 and has since been rapidly developed with features including schema embedding, operation generation, schema design analysis, and a full VS Code extension.

This spec establishes the baseline so all future specs can reference what already exists.

### User Goal
Build an AI-powered GraphQL tooling ecosystem that:
- Embeds GraphQL schemas as vector embeddings for semantic search
- Generates GraphQL operations from natural language queries
- Analyzes schemas against design best practices
- Provides a VS Code extension with a Schema Design Workbench for standalone and federated GraphQL projects

### Related Specs
- Depends on: None (this is the first spec)
- Blocks: All future specs (establishes baseline)

---

## User Journey

### Before
No tooling existed for embedding GraphQL schemas as vectors, generating operations from natural language, or analyzing schema design in VS Code.

### After
A complete TypeScript monorepo with 5 library packages and a VS Code extension providing:
- Schema parsing and embedding pipeline
- Multiple vector store backends (PGLite, PostgreSQL, Pinecone)
- Multiple LLM providers (Ollama, Ollama Cloud, OpenAI, Anthropic)
- Natural language to GraphQL operation generation
- Schema design analysis against best practices
- Schema Design Workbench with standalone and federated design support
- Federated GraphQL features (supergraph.yaml, entity completion, Rover validation)
- Published to VS Code Marketplace

---

## Success Criteria

- [x] Schema parsing converts GraphQL AST into embeddable documents
- [x] Embedding service stores documents in vector databases with semantic search
- [x] At least one local and one cloud vector store backend
- [x] Natural language queries generate valid GraphQL operations
- [x] LLM provider abstraction supports multiple backends
- [x] Schema design analysis provides actionable recommendations
- [x] VS Code extension integrates all features with commands and settings
- [x] Schema Design Workbench provides tree view for managing designs
- [x] Federated GraphQL schemas supported (supergraph.yaml, Rover CLI)
- [x] Extension published to VS Code Marketplace

---

## Tasks

### Priority 0 (Critical)

- [x] **Create graphql-embedding-parser package** - Parse GraphQL schema AST into EmbeddingDocument objects
  - Files: `packages/graphql-embedding-parser/src/`
  - Details: Uses `visit` from graphql-js to traverse schema definitions. Exports `parseSchema()`, `EmbeddingDocument`, `DocumentType`, `chunkDocuments()`. ~656 lines.

- [x] **Create graphql-embedding-core package** - Core interfaces, vector stores, LLM providers, and EmbeddingService
  - Files: `packages/graphql-embedding-core/src/`
  - Details: Defines `EmbeddingProvider`, `VectorStore`, `LLMProvider` interfaces. Implements PGLiteVectorStore, PostgresVectorStore, PineconeVectorStore. Implements OllamaProvider, OllamaCloudProvider, OpenAIProvider, AnthropicProvider. ~2,700 lines.

- [x] **Create graphql-embedding package** - Local embedding provider using node-llama-cpp
  - Files: `packages/graphql-embedding/src/`
  - Details: `LlamaEmbeddingProvider` class loading GGUF model (embeddinggemma-300M-Q8_0.gguf). ~107 lines.

- [x] **Create graphql-embedding-operation package** - Generate GraphQL operations from natural language
  - Files: `packages/graphql-embedding-operation/src/`
  - Details: `DynamicOperationGenerator` with LLM-based field selection and validation retry loop. ~933 lines.

- [x] **Create graphql-workbench VS Code extension** - Integrate all packages into VS Code
  - Files: `packages/graphql-workbench/src/`
  - Details: Extension with 24 commands, 19 settings, esbuild bundler. ~7,700 lines. Uses dynamic imports for ESM packages.

- [x] **Set up monorepo build system** - TypeScript project references with npm workspaces
  - Files: `tsconfig.json`, `tsconfig.base.json`, `packages/*/tsconfig.json`
  - Details: Library packages build via `tsc --build` respecting dependency order. VS Code extension builds via esbuild separately.

### Priority 1 (High)

- [x] **Create graphql-embedding-schema-design package** - Analyze schemas against best practices
  - Files: `packages/graphql-embedding-schema-design/src/`
  - Details: `SchemaDesignAnalyzer` class with Yelp schema design guidelines. ~272 lines.

- [x] **Implement Schema Design Workbench** - Activity bar tab with tree view for GraphQL designs
  - Files: `packages/graphql-workbench/src/services/design-manager.ts`, `providers/design-tree-provider.ts`, `commands/design-workbench-commands.ts`
  - Details: Tree view showing standalone and federated designs with validation status, embedding status, and 12 design-specific commands.

- [x] **Add Pinecone vector store** - Cloud vector store using REST API (no SDK)
  - Files: `packages/graphql-embedding-core/src/pinecone-store.ts`
  - Details: Pinecone REST API integration. Namespaces map to table names. Near-zero vectors for sentinel records. ~366 lines.

- [x] **Implement federated GraphQL support** - supergraph.yaml parsing, subgraph management, Rover CLI validation
  - Files: `packages/graphql-workbench/src/services/rover-validator.ts`, `design-manager.ts`
  - Details: YAML-based supergraph config, entity extraction, Rover CLI integration for composition validation.

- [x] **Add entity completion provider** - IntelliSense for federated schema entities
  - Files: `packages/graphql-workbench/src/providers/`
  - Details: Completion provider suggesting entities from other subgraphs in federated designs.

- [x] **Add GraphQL Explorer panel** - Webview for viewing generated operations
  - Files: `packages/graphql-workbench/src/`
  - Details: Webview panel displaying generated GraphQL operations.

- [x] **Implement incremental re-embedding** - Diff-based updates on file save
  - Files: `packages/graphql-workbench/src/services/embedding-manager.ts`
  - Details: `embedSchemaIncremental()` diffs old vs new schema by document ID (content-based hash). Only changed documents are re-embedded.

### Priority 2 (Nice to Have)

- [x] **Publish to VS Code Marketplace** - Package and distribute the extension
  - Files: `.github/workflows/`, `packages/graphql-workbench/package.json`
  - Details: Published as MichaelWatson.graphql-workbench. VSIX release on merge to main. Platform-specific builds.

- [x] **Add schema design linting** - Code actions and diagnostics for schema violations
  - Files: `packages/graphql-workbench/src/providers/`
  - Details: Lint diagnostics with code actions, dismiss violations feature.

- [x] **Introduce read-only settings** - Protect certain configuration values
  - Files: `packages/graphql-workbench/src/`
  - Details: Prevents accidental modification of critical settings.

### Testing Tasks

- [x] **Parser tests** - Unit tests for schema parsing
  - Files: `packages/graphql-embedding-parser/__tests__/parser.test.ts`
  - Details: Vitest-based tests for parseSchema functionality.

- [x] **Operation generator tests** - Tests for operation generation
  - Files: `packages/graphql-embedding-operation/__tests__/`
  - Details: Tests for DynamicOperationGenerator.

- [x] **CI pipeline** - GitHub Actions for typecheck and tests
  - Files: `.github/workflows/`
  - Details: Automated checks on pull requests.

---

## Dependencies

### Code Dependencies
- `graphql` ^16.8.1 - Core GraphQL library for parsing and validation
- `@electric-sql/pglite` ^0.2.0 - In-memory/local PostgreSQL with vector extension
- `node-llama-cpp` ^3.0.0 - Local GGUF model inference for embeddings
- `yaml` - YAML parsing for supergraph.yaml federation configs
- `pg` ^8.0.0 - PostgreSQL client (optional, for postgres vector store)

### External Dependencies
- VS Code Extension API - Extension host runtime
- Rover CLI (optional) - Apollo federation composition validation
- Pinecone (optional) - Cloud vector database
- OpenAI API (optional) - LLM provider
- Anthropic API (optional) - LLM provider
- Ollama (optional) - Local LLM provider

---

## Implementation Notes

### Architecture Decisions

**Monorepo with npm workspaces**
- Clean separation: parser, core, embedding, operation generation, schema design, VS Code extension
- TypeScript project references ensure correct build order for libraries
- VS Code extension uses esbuild separately (not part of tsc project references)

**Interface-driven design**
- `EmbeddingProvider` interface allows swapping embedding backends
- `VectorStore` interface supports PGLite, PostgreSQL, and Pinecone
- `LLMProvider` interface supports Ollama, OpenAI, Anthropic

**Dynamic imports for ESM packages**
- ESM-only packages (PGLite, node-llama-cpp) loaded via `await import()` at runtime
- Prevents bundler issues in VS Code's CommonJS-like extension host
- Dynamic import paths require `.js` extensions for tsc --noEmit

**Pinecone REST API (no SDK)**
- Reduces bundle size and avoids SDK version coupling
- Near-zero vectors (`1e-7`) used for sentinel records (Pinecone rejects all-zero vectors)
- Schema SDL stored on `__schema_sdl__` sentinel record

**Circular dependency avoidance**
- Services that reference each other define shared types inline
- Example: `rover-validator.ts` defines its own `SubgraphInfo` instead of importing from `design-manager.ts`

### Patterns to Follow
- Commands: exported async functions in `commands/*.ts`
- Services: classes in `services/*.ts`
- Tree views: providers in `providers/*.ts`
- ESM packages: use dynamic `import()` with `.js` extensions
- Package imports: use package names, not relative paths across packages
- `graphql.buildSchema()` takes a `string`, NOT a `DocumentNode` AST

### Edge Cases
- Pinecone rejects all-zero vectors (use near-zero sentinel)
- `buildSchema()` vs `parse()` - string vs DocumentNode
- Federated subgraphs can get duplicated as designs (fixed in 9b7ef2c)
- Rover CLI may not be in PATH (augmented PATH lookup in bab8430)
- Rover validator output can exceed default buffer (increased in 65906e4)

### Security Considerations
- API keys (Pinecone, OpenAI, Anthropic) stored in VS Code settings, not committed
- No sensitive data in embedded vectors
- Pinecone index host URLs auto-prepend `https://` if missing

### Performance Considerations
- Incremental re-embedding avoids re-processing unchanged schema documents
- PGLite provides fast local vector search without external database
- Chunking large documents prevents embedding dimension overflow
- Content-based hashing enables efficient change detection

---

## Implementation Summary

### What Was Done
Built a complete GraphQL tooling ecosystem from scratch over ~2 weeks (2026-01-30 to 2026-02-12):

1. **graphql-embedding-parser** - Schema AST to embeddable document parser
2. **graphql-embedding-core** - Interfaces, 3 vector stores (PGLite, PostgreSQL, Pinecone), 4 LLM providers (Ollama, Ollama Cloud, OpenAI, Anthropic), EmbeddingService
3. **graphql-embedding** - Local GGUF model embedding provider via node-llama-cpp
4. **graphql-embedding-operation** - Natural language to validated GraphQL operation generator
5. **graphql-embedding-schema-design** - Schema design analyzer with Yelp best practices
6. **graphql-workbench** - VS Code extension with 24 commands, 19 settings, Schema Design Workbench, federated GraphQL support, entity completion, GraphQL explorer, incremental re-embedding, marketplace publishing

Total: ~10,800 lines of TypeScript across 6 packages.

### Deviations from Plan
N/A - This is a retroactive spec. Development was organic, not spec-driven.

### New Specs Created
None - this is the baseline spec. All future work will be tracked via the RPI Loop workflow starting with spec 000002+.

### Blockers Encountered
Resolved during development:
- VSIX too large (removed platform-specific node-llama-cpp binaries)
- LLM not found error handling (improved error messages)
- Federated subgraphs duplicated as designs (fixed duplicate detection)
- Rover CLI not in PATH (augmented PATH with common install locations)
- Rover validator buffer overflow (increased max buffer size)

### Lessons Learned
- **esbuild doesn't type-check** - Always run `tsc --noEmit` alongside esbuild
- **Dynamic imports need `.js`** - NodeNext module resolution requires file extensions in `import()` paths
- **Avoid circular deps** - Define shared types inline when services reference each other
- **Pinecone quirks** - No all-zero vectors, namespace-based table mapping, REST API preferred over SDK
- **`buildSchema()` takes string** - Not DocumentNode AST (common mistake)
- **Incremental embedding** - Content-based hashing is more reliable than timestamp-based change detection

---

## Metadata

**Estimated Effort:** XL (full project, 6 packages, ~10,800 lines)
**Actual Effort:** XL (~2 weeks of rapid development)
**Implemented By:** Michael Watson + Claude
**Reviewed By:** Retroactively documented via RPI research phase
