export type {
  EmbeddingProvider,
  VectorStore,
  StoredDocument,
  SearchResult,
  MetadataFilter,
  ColumnFilter,
  SearchOptions,
  EmbeddingServiceOptions,
  EmbedResult,
  SkippedDocument,
  ChunkedDocument,
} from "./interfaces.js";

export { EmbeddingService } from "./embedding-service.js";
export { PGLiteVectorStore } from "./pglite-store.js";
export type { PGLiteVectorStoreOptions } from "./pglite-store.js";
export { PostgresVectorStore } from "./postgres-store.js";
export type { PostgresVectorStoreOptions } from "./postgres-store.js";

export { chunkDocuments } from "graphql-embedding-parser";
export type { EmbeddingDocument, DocumentType } from "graphql-embedding-parser";

// LLM provider interface and types
export type {
  ChatRole,
  ChatMessage,
  LLMCompletionOptions,
  LLMProvider,
} from "./llm/index.js";

// LLM provider implementations
export {
  OllamaProvider,
  type OllamaProviderOptions,
  OllamaCloudProvider,
  type OllamaCloudProviderOptions,
  OpenAIProvider,
  type OpenAIProviderOptions,
  AnthropicProvider,
  type AnthropicProviderOptions,
} from "./llm/index.js";
