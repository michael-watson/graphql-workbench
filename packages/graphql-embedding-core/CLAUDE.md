# graphql-embedding-core

Core embedding service and vector store implementations.

## Source

```
src/
├── embedding-service.ts   # Main EmbeddingService orchestrator
├── interfaces.ts          # Shared interfaces (IVectorStore, IEmbeddingProvider, etc.)
├── pglite-store.ts        # PGlite (in-process Postgres) vector store
├── pinecone-store.ts      # Pinecone vector store
├── postgres-store.ts      # External Postgres vector store
├── llm/                   # LLM provider adapters
└── index.ts               # Public exports
```

## Key Interfaces (`interfaces.ts`)

Define shared types here rather than importing from consumers — this is the source of truth to avoid circular dependencies across packages.

## Vector Store Pattern

All stores implement `IVectorStore`. When adding a new store:
1. Implement `IVectorStore` from `interfaces.ts`
2. Export from `index.ts`
3. Add to `graphql-embedding/src/index.ts` aggregator
