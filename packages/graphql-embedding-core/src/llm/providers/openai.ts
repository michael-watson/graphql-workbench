import type { LLMProvider, ChatMessage, LLMCompletionOptions } from "../types.js";

/**
 * Options for configuring the OpenAI provider
 */
export interface OpenAIProviderOptions {
  /** OpenAI API key (required) */
  apiKey: string;
  /** Model to use (default: "gpt-4o-mini") */
  model?: string;
  /** OpenAI API base URL (default: "https://api.openai.com") */
  baseUrl?: string;
  /** Default temperature for responses (0-2, default: undefined - uses model default) */
  defaultTemperature?: number;
  /** Default maximum tokens to generate (default: undefined - uses model default) */
  defaultMaxTokens?: number;
  /** Top-p (nucleus) sampling parameter (0-1, default: undefined - uses model default) */
  topP?: number;
  /** Frequency penalty (-2 to 2, default: undefined - uses model default) */
  frequencyPenalty?: number;
  /** Presence penalty (-2 to 2, default: undefined - uses model default) */
  presencePenalty?: number;
}

interface OpenAIChatRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

interface OpenAIChatResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

/**
 * LLM provider implementation for OpenAI API.
 */
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultTemperature?: number;
  private readonly defaultMaxTokens?: number;
  private readonly topP?: number;
  private readonly frequencyPenalty?: number;
  private readonly presencePenalty?: number;

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-4o-mini";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com";
    this.defaultTemperature = options.defaultTemperature;
    this.defaultMaxTokens = options.defaultMaxTokens;
    this.topP = options.topP;
    this.frequencyPenalty = options.frequencyPenalty;
    this.presencePenalty = options.presencePenalty;
  }

  async initialize(): Promise<void> {
    // Verify API key is valid by making a simple models request
    const response = await fetch(`${this.baseUrl}/v1/models`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid OpenAI API key");
      }
      throw new Error(
        `Failed to connect to OpenAI API: ${response.statusText}`
      );
    }
  }

  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<string> {
    const requestBody: OpenAIChatRequest = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    };

    // Apply temperature (options override defaults)
    const temperature = options?.temperature ?? this.defaultTemperature;
    if (temperature !== undefined) {
      requestBody.temperature = temperature;
    }

    // Apply max tokens (options override defaults)
    const maxTokens = options?.maxTokens ?? this.defaultMaxTokens;
    if (maxTokens !== undefined) {
      requestBody.max_tokens = maxTokens;
    }

    // Apply top-p sampling
    if (this.topP !== undefined) {
      requestBody.top_p = this.topP;
    }

    // Apply frequency penalty
    if (this.frequencyPenalty !== undefined) {
      requestBody.frequency_penalty = this.frequencyPenalty;
    }

    // Apply presence penalty
    if (this.presencePenalty !== undefined) {
      requestBody.presence_penalty = this.presencePenalty;
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = (await response.json()) as OpenAIErrorResponse;
      throw new Error(
        `OpenAI API error: ${errorData.error?.message ?? response.statusText}`
      );
    }

    const data = (await response.json()) as OpenAIChatResponse;

    if (!data.choices?.[0]?.message?.content) {
      throw new Error("No response content from OpenAI");
    }

    return data.choices[0].message.content;
  }

  async dispose(): Promise<void> {
    // No cleanup needed for OpenAI
  }
}
