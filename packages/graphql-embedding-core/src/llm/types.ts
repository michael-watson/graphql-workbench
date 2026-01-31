/**
 * Chat message roles for LLM interactions
 */
export type ChatRole = "system" | "assistant" | "user";

/**
 * A single message in a chat conversation
 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * Options for LLM completion requests
 */
export interface LLMCompletionOptions {
  /** Temperature for response randomness (0-1). Lower = more deterministic */
  temperature?: number;
  /** Maximum tokens to generate in the response */
  maxTokens?: number;
}

/**
 * Interface for LLM providers used in dynamic operation generation.
 * Implementations should handle their own HTTP communication using fetch().
 */
export interface LLMProvider {
  /** Initialize the provider (e.g., verify connectivity) */
  initialize(): Promise<void>;

  /**
   * Generate a completion from the given chat messages
   * @param messages - Array of chat messages forming the conversation
   * @param options - Optional completion parameters
   * @returns The generated response text
   */
  complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<string>;

  /** Provider name (e.g., "ollama", "openai", "anthropic") */
  readonly name: string;

  /** Model identifier being used */
  readonly model: string;

  /** Clean up any resources */
  dispose(): Promise<void>;
}
