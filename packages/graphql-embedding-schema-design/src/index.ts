export { SchemaDesignAnalyzer } from "./schema-design-analyzer.js";
export type {
  SchemaDesignAnalyzerOptions,
  SchemaDesignReport,
} from "./types.js";

// Re-export LLM providers and types from core for convenience
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
