import type { VectorStore, LLMProvider } from "graphql-embedding-core";

/**
 * Options for configuring the SchemaDesignAnalyzer
 */
export interface SchemaDesignAnalyzerOptions {
  /** Vector store containing embedded schema documents */
  vectorStore: VectorStore;
  /** LLM provider for generating analysis (defaults to OllamaProvider with qwen2.5) */
  llmProvider?: LLMProvider;
  /** Embedding dimensions for zero-vector retrieval */
  dimensions: number;
  /** Maximum documents to retrieve per category (default: 500) */
  maxDocuments?: number;
}

/**
 * Result of a schema design analysis
 */
export interface SchemaDesignReport {
  /** The full markdown report */
  markdown: string;
  /** How many schema documents were analyzed */
  documentCount: number;
  /** Which best practice categories were evaluated */
  categories: string[];
}
