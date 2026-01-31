import type { LLMProvider, ChatMessage, LLMCompletionOptions } from "../types.js";

/**
 * Options for configuring the Anthropic provider
 */
export interface AnthropicProviderOptions {
  /** Anthropic API key (required) */
  apiKey: string;
  /** Model to use (default: "claude-3-haiku-20240307") */
  model?: string;
  /** Anthropic API base URL (default: "https://api.anthropic.com") */
  baseUrl?: string;
  /** Default temperature for responses (0-1, default: undefined - uses model default) */
  defaultTemperature?: number;
  /** Default maximum tokens to generate (default: 4096) */
  defaultMaxTokens?: number;
  /** Top-k sampling parameter (default: undefined - uses model default) */
  topK?: number;
  /** Top-p (nucleus) sampling parameter (0-1, default: undefined - uses model default) */
  topP?: number;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicChatRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
  top_k?: number;
  top_p?: number;
}

interface AnthropicChatResponse {
  id: string;
  type: string;
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface AnthropicErrorResponse {
  type: string;
  error: {
    type: string;
    message: string;
  };
}

/**
 * LLM provider implementation for Anthropic API.
 * Note: Anthropic's API has a different message format - system messages
 * are passed separately, not in the messages array.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTemperature?: number;
  private readonly defaultMaxTokens: number;
  private readonly topK?: number;
  private readonly topP?: number;

  constructor(options: AnthropicProviderOptions) {
    if (!options.apiKey) {
      throw new Error("Anthropic API key is required");
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-3-haiku-20240307";
    this.baseUrl = options.baseUrl ?? "https://api.anthropic.com";
    this.defaultTemperature = options.defaultTemperature;
    this.defaultMaxTokens = options.defaultMaxTokens ?? 4096;
    this.topK = options.topK;
    this.topP = options.topP;
  }

  async initialize(): Promise<void> {
    // Anthropic doesn't have a simple health check endpoint,
    // so we'll validate the key format at minimum
    if (!this.apiKey.startsWith("sk-ant-")) {
      throw new Error(
        "Invalid Anthropic API key format. Keys should start with 'sk-ant-'"
      );
    }
  }

  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<string> {
    // Extract system message if present (Anthropic handles it separately)
    let systemMessage: string | undefined;
    const chatMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // Anthropic only supports one system message, concatenate if multiple
        systemMessage = systemMessage
          ? `${systemMessage}\n\n${msg.content}`
          : msg.content;
      } else {
        chatMessages.push({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        });
      }
    }

    // Anthropic requires messages to alternate user/assistant,
    // starting with user. Ensure proper alternation.
    const normalizedMessages = this.normalizeMessages(chatMessages);

    const requestBody: AnthropicChatRequest = {
      model: this.model,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      messages: normalizedMessages,
    };

    if (systemMessage) {
      requestBody.system = systemMessage;
    }

    // Apply temperature (options override defaults)
    const temperature = options?.temperature ?? this.defaultTemperature;
    if (temperature !== undefined) {
      requestBody.temperature = temperature;
    }

    // Apply top-k sampling
    if (this.topK !== undefined) {
      requestBody.top_k = this.topK;
    }

    // Apply top-p sampling
    if (this.topP !== undefined) {
      requestBody.top_p = this.topP;
    }

    const response = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as AnthropicErrorResponse;
      throw new Error(
        `Anthropic API error: ${errorData.error?.message ?? response.statusText}`
      );
    }

    const data = (await response.json()) as AnthropicChatResponse;

    if (!data.content?.[0]?.text) {
      throw new Error("No response content from Anthropic");
    }

    return data.content[0].text;
  }

  /**
   * Normalize messages to ensure proper user/assistant alternation
   * required by Anthropic's API
   */
  private normalizeMessages(messages: AnthropicMessage[]): AnthropicMessage[] {
    if (messages.length === 0) {
      return [{ role: "user", content: "Hello" }];
    }

    const normalized: AnthropicMessage[] = [];

    for (const msg of messages) {
      const lastMsg = normalized[normalized.length - 1];

      // If same role as previous, merge content
      if (lastMsg && lastMsg.role === msg.role) {
        lastMsg.content = `${lastMsg.content}\n\n${msg.content}`;
      } else {
        normalized.push({ ...msg });
      }
    }

    // Ensure first message is from user
    if (normalized[0]?.role !== "user") {
      normalized.unshift({
        role: "user",
        content: "Please respond to the following:",
      });
    }

    return normalized;
  }

  async dispose(): Promise<void> {
    // No cleanup needed for Anthropic
  }
}
