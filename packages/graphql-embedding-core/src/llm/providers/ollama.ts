import type { LLMProvider, ChatMessage, LLMCompletionOptions } from "../types.js";

/**
 * Options for configuring the Ollama provider
 */
export interface OllamaProviderOptions {
  /** Model to use (default: "qwen2.5") */
  model?: string;
  /** Ollama API base URL (default: "http://localhost:11434") */
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
 * LLM provider implementation for Ollama.
 * Default provider for dynamic operation generation.
 */
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;
  private readonly defaultTemperature?: number;
  private readonly defaultMaxTokens?: number;
  private readonly topK?: number;
  private readonly topP?: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.model = options.model ?? "qwen2.5";
    this.baseUrl = options.baseUrl ?? "http://localhost:11434";
    this.defaultTemperature = options.defaultTemperature;
    this.defaultMaxTokens = options.defaultMaxTokens;
    this.topK = options.topK;
    this.topP = options.topP;
  }

  async initialize(): Promise<void> {
    // Verify Ollama is running and model is available
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(
        `Failed to connect to Ollama at ${this.baseUrl}: ${response.statusText}`
      );
    }

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = data.models ?? [];
    const modelNames = models.map((m) => m.name.split(":")[0]);

    if (!modelNames.includes(this.model.split(":")[0])) {
      throw new Error(
        `Model "${this.model}" not found in Ollama. Available models: ${modelNames.join(", ")}. ` +
          `Run "ollama pull ${this.model}" to download it.`
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
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama API error: ${response.statusText} - ${errorText}`);
    }

    const data = (await response.json()) as OllamaChatResponse;
    return data.message.content;
  }

  async dispose(): Promise<void> {
    // No cleanup needed for Ollama
  }
}
