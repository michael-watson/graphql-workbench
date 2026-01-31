export { DynamicOperationGenerator } from "./dynamic-generator.js";
export type {
  DynamicOperationOptions,
  GenerationContext,
  GenerationRuntimeOptions,
  DynamicGeneratedOperation,
  FilteredSearchResult,
  ValidationResult,
  OperationLogger,
} from "./types.js";

// LLM providers and types (re-exported from core)
export type {
  LLMProvider,
  ChatMessage,
  ChatRole,
  LLMCompletionOptions,
} from "graphql-embedding-core";

export {
  OllamaProvider,
  type OllamaProviderOptions,
  OpenAIProvider,
  type OpenAIProviderOptions,
  AnthropicProvider,
  type AnthropicProviderOptions,
} from "graphql-embedding-core";

// Re-export common types
export type { SearchResult, EmbeddingDocument, RootOperationType } from "./types.js";
