import type { LLMProvider, ChatMessage, LLMCompletionOptions } from "../types.js";

/**
 * Options for configuring the Ollama Cloud provider
 */
export interface OllamaCloudProviderOptions {
  /** API key for authenticating with Ollama Cloud (required) */
  apiKey: string;
  /** Model to use (default: "qwen2.5") */
  model?: string;
  /** Ollama Cloud API base URL (default: "https://ollama.com") */
  baseUrl?: string;
  /** Default temperature for responses (0-1, default: undefined - uses model default) */
  defaultTemperature?: number;
  /** Default maximum tokens to generate (default: undefined - uses model default) */
  defaultMaxTokens?: number;
  /** Top-k sampling parameter (default: undefined - uses model default) */
  topK?: number;
  /** Top-p (nucleus) sampling parameter (default: undefined - uses model default) */
  topP?: number;
}

interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  stream: false;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_k?: number;
    top_p?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

/**
 * LLM provider implementation for Ollama Cloud.
 * Uses the same API format as local Ollama but connects to the cloud service
 * with Bearer token authentication.
 */
export class OllamaCloudProvider implements LLMProvider {
  readonly name = "ollama-cloud";
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultTemperature?: number;
  private readonly defaultMaxTokens?: number;
  private readonly topK?: number;
  private readonly topP?: number;

  constructor(options: OllamaCloudProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "qwen2.5";
    this.baseUrl = options.baseUrl ?? "https://ollama.com";
    this.defaultTemperature = options.defaultTemperature;
    this.defaultMaxTokens = options.defaultMaxTokens;
    this.topK = options.topK;
    this.topP = options.topP;
  }

  async initialize(): Promise<void> {
    // Verify connectivity and API key by calling /api/tags
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to connect to Ollama Cloud at ${this.baseUrl}: ${response.statusText}. ` +
          `Verify your API key is correct.`
      );
    }
  }

  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<string> {
    const requestBody: OllamaChatRequest = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {},
    };

    // Apply temperature (options override defaults)
    const temperature = options?.temperature ?? this.defaultTemperature;
    if (temperature !== undefined) {
      requestBody.options!.temperature = temperature;
    }

    // Apply max tokens (options override defaults)
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
    if (maxTokens !== undefined) {
      requestBody.options!.num_predict = maxTokens;
    }

    // Apply top-k sampling
    if (this.topK !== undefined) {
      requestBody.options!.top_k = this.topK;
    }

    // Apply top-p sampling
    if (this.topP !== undefined) {
      requestBody.options!.top_p = this.topP;
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Ollama Cloud API error: ${response.statusText} - ${errorText}`
      );
    }

    const data = (await response.json()) as OllamaChatResponse;
    return data.message.content;
  }

  async dispose(): Promise<void> {
    // No cleanup needed for Ollama Cloud
  }
}
