import type { GraphQLSchema } from "graphql";
import type { VectorStore, SearchResult } from "graphql-embedding-core";
import type { EmbeddingDocument, RootOperationType } from "graphql-embedding-parser";
import type { LLMProvider } from "graphql-embedding-core";

/**
 * Logger interface for detailed operation generation logging
 */
export interface OperationLogger {
  log(message: string): void;
}

/**
 * Options for configuring the DynamicOperationGenerator
 */
export interface DynamicOperationOptions {
  /** LLM provider for generating operations */
  llmProvider: LLMProvider;
  /** Vector store containing embedded schema documents */
  vectorStore: VectorStore;
  /** Minimum similarity score for search results (default: 0.4) */
  minSimilarityScore?: number;
  /** Maximum number of documents to retrieve (default: 50) */
  maxDocuments?: number;
  /** Maximum depth for recursive type discovery (default: 5) */
  maxTypeDepth?: number;
  /** Maximum validation/retry attempts (default: 5) */
  maxValidationRetries?: number;
  /** Optional GraphQL schema for full validation */
  schema?: GraphQLSchema;
  /** Optional logger for detailed step-by-step logging */
  logger?: OperationLogger;
}

/**
 * Context for generating a dynamic operation
 */
export interface GenerationContext {
  /** Pre-embedded vector representation of user input */
  inputVector: number[];
  /** Original text input for LLM prompts */
  inputText: string;
}

/**
 * Runtime options that can override constructor defaults
 */
export interface GenerationRuntimeOptions {
  /** Minimum similarity score for search results */
  minSimilarityScore?: number;
  /** Maximum number of documents to retrieve */
  maxDocuments?: number;
  /** Maximum validation/retry attempts */
  maxValidationRetries?: number;
}

/**
 * Result of dynamic operation generation
 */
export interface DynamicGeneratedOperation {
  /** The generated GraphQL operation string */
  operation: string;
  /** Example variables for the operation */
  variables: Record<string, unknown>;
  /** The type of operation (query, mutation, subscription) */
  operationType: "query" | "mutation" | "subscription";
  /** The root field name selected */
  rootField: string;
  /** Documents used during generation */
  relevantDocuments: SearchResult[];
  /** Number of validation attempts made */
  validationAttempts: number;
}

/**
 * Internal type for filtered search results
 */
export interface FilteredSearchResult extends SearchResult {
  document: EmbeddingDocument & {
    metadata: {
      rootOperationType?: RootOperationType;
      isRootOperationField?: boolean;
    };
  };
}

/**
 * Internal type for validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type { SearchResult, EmbeddingDocument, RootOperationType };
