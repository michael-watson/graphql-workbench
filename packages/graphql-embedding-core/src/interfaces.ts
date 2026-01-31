import type { EmbeddingDocument } from "graphql-embedding-parser";

export interface EmbeddingProvider {
  initialize(): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimensions: number;
  /** Maximum context size in tokens */
  readonly maxContextSize?: number;
  /** Count tokens in text (if supported by provider) */
  countTokens?(text: string): number;
  dispose(): Promise<void>;
}

export interface StoredDocument extends EmbeddingDocument {
  embedding: number[];
}

export interface SearchResult {
  document: EmbeddingDocument;
  score: number;
}

export interface MetadataFilter {
  field: string;
  operator: "eq" | "neq" | "in" | "exists";
  value?: string | boolean | number | string[];
}

export interface ColumnFilter {
  column: "name" | "type";
  operator: "eq" | "in";
  value: string | string[];
}

export interface SearchOptions {
  limit?: number;
  metadataFilters?: MetadataFilter[];
  columnFilters?: ColumnFilter[];
}

export interface VectorStore {
  initialize(): Promise<void>;
  store(documents: StoredDocument[]): Promise<void>;
  search(embedding: number[], limitOrOptions?: number | SearchOptions): Promise<SearchResult[]>;
  delete(ids: string[]): Promise<void>;
  clear(): Promise<void>;
  close(): Promise<void>;
  /** Returns the count of documents in the store */
  count(): Promise<number>;
}

export interface EmbeddingServiceOptions {
  embeddingProvider: EmbeddingProvider;
  vectorStore: VectorStore;
}

export interface SkippedDocument {
  id: string;
  name: string;
  tokenCount: number;
  maxTokens: number;
}

export interface ChunkedDocument {
  name: string;
  originalTokenCount: number;
  chunks: number;
}

export interface EmbedResult {
  embeddedCount: number;
  skippedCount: number;
  skippedDocuments: SkippedDocument[];
  chunkedCount: number;
  chunkedDocuments: ChunkedDocument[];
}
