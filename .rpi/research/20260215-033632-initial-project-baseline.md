# Research: Initial Project Baseline

**Date:** 2026-02-15
**Git Hash:** 65906e4531d64470b3395e0fa367a3d04b6c81da
**Branch:** ai-ready-repo
**Researcher:** Claude Opus 4.6

---

## Executive Summary

This research documents the complete state of the GraphQL Workbench project as of its transition to spec-driven development via the RPI Loop Template. The project is a mature TypeScript monorepo containing 5 library packages and 1 VS Code extension, totaling ~10,800 lines of source code across 50+ commits spanning from May 2024 to February 2026.

The project has evolved from an initial shell (May 2024) through a complete rewrite (Jan 30, 2026) into a feature-rich GraphQL tooling ecosystem supporting schema embedding, natural language operation generation, schema design analysis, and federated GraphQL workflows -- all integrated into a VS Code extension published to the marketplace.

This research serves as the foundation for creating the initial completed spec (000001) that retroactively documents everything built before the RPI workflow was adopted.

---

## Research Questions

1. What has been built in this repository from inception to the current state?
2. What is the chronological development timeline?
3. What are the key architectural decisions and patterns?
4. What is the full feature set of each package?
5. What is the appropriate scope for an initial "baseline" completed spec?

---

## Methodology

- Full git history analysis (`git log --all` with dates)
- Package structure exploration (all 6 packages)
- Source code line counts per package
- Template and RPI structure review
- State file and configuration review

---

## Findings

### Development Timeline

| Date | Milestone |
|------|-----------|
| 2024-05-15 | Initial commit |
| 2024-05-16 | Shell created with CI |
| 2026-01-28 | Development resumes |
| 2026-01-30 | Complete MVP rewrite (38c68c4) |
| 2026-01-31 | Bug fixes (LLM not found, VSIX) |
| 2026-02-01 | Platform binaries, packaging, marketplace prep |
| 2026-02-02 | GraphQL Explorer panel, VS Code marketplace publish |
| 2026-02-04 | Yelp schema design guidelines |
| 2026-02-05 | Schema Design Workbench tab |
| 2026-02-06 | Pinecone vector store, table reuse fix |
| 2026-02-08 | Entity completion provider |
| 2026-02-09 | Read-only settings |
| 2026-02-12 | Federated subgraph fix, Rover validator improvements |
| 2026-02-14 | RPI Loop Template integrated (current) |

### Package Inventory

| Package | Lines | Purpose |
|---------|-------|---------|
| graphql-embedding-parser | ~656 | Parse GraphQL AST into embeddable documents |
| graphql-embedding-core | ~2,700 | Interfaces, vector stores (PGLite/Postgres/Pinecone), LLM providers, EmbeddingService |
| graphql-embedding | ~107 | Local embedding via node-llama-cpp + GGUF model |
| graphql-embedding-operation | ~933 | Natural language to GraphQL operation generation |
| graphql-embedding-schema-design | ~272 | Schema design analysis against best practices |
| graphql-workbench (VS Code ext) | ~7,700 | VS Code extension integrating all packages |
| **Total** | **~12,368** | |

### Key Features Delivered

1. **Schema Embedding Pipeline** - Parse schemas, generate vector embeddings, store in vector databases
2. **3 Vector Store Backends** - PGLite (local), PostgreSQL + pgvector, Pinecone (cloud REST API)
3. **4 LLM Providers** - Ollama, Ollama Cloud, OpenAI, Anthropic
4. **Operation Generation** - Natural language queries to validated GraphQL operations
5. **Schema Design Analysis** - LLM-powered analysis against Yelp best practices
6. **Schema Design Workbench** - Activity bar tab with tree view for standalone + federated designs
7. **Federated GraphQL Support** - supergraph.yaml parsing, subgraph management, entity completion
8. **GraphQL Explorer Panel** - Webview for viewing generated operations
9. **Incremental Re-embedding** - Diff-based updates on file save
10. **VS Code Marketplace Publishing** - Extension available as MichaelWatson.graphql-workbench

### Architecture Decisions

- **Monorepo with npm workspaces** - Clean separation of concerns
- **TypeScript project references** - Correct build order for libraries
- **esbuild for VS Code extension** - Fast bundling, separate from tsc
- **NodeNext module resolution** - Dynamic imports with `.js` extensions for ESM packages
- **Dynamic imports for ESM packages** - PGLite, node-llama-cpp loaded at runtime
- **Inline shared types** - Avoids circular dependencies between services
- **Pinecone REST API (no SDK)** - Reduces bundle size and dependencies
- **Changesets for versioning** - Structured release management

---

## Open Questions

None - this is a baseline documentation exercise.

---

## Recommendations

Create spec `000001` as a completed spec documenting the full project baseline. This spec should:
1. Cover all packages and features built from initial commit through current state
2. Mark all tasks as completed with `[x]`
3. Include the full implementation summary
4. Reference the git history timeline
5. Serve as the "starting point" for all future specs

---

## References

- Git history: 50+ commits across main and feature branches
- CLAUDE.md: Comprehensive project instructions
- Package.json files: Version and dependency information
- Source files: ~12,300 lines of TypeScript
