import type { LLMProvider, LLMToolProvider, McpToolDefinition, ChatMessage, LLMCompletionOptions } from "../types.js";

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

// --- Tool calling types ---

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicToolRequest {
  model: string;
  max_tokens: number;
  messages: unknown[];
  tools: AnthropicTool[];
  system?: string;
  temperature?: number;
  top_k?: number;
  top_p?: number;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

interface AnthropicToolMessage {
  role: "user";
  content: AnthropicToolResultBlock[];
}

interface AnthropicToolResponse {
  id: string;
  type: string;
  role: string;
  content: Array<AnthropicTextBlock | AnthropicToolUseBlock>;
  stop_reason: "end_turn" | "tool_use" | string;
  usage: { input_tokens: number; output_tokens: number };
}

/**
 * LLM provider implementation for Anthropic API.
 * Note: Anthropic's API has a different message format - system messages
 * are passed separately, not in the messages array.
 */
export class AnthropicProvider implements LLMProvider, LLMToolProvider {
  readonly name = "anthropic";
  readonly supportsTools = true as const;
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
   * Run a completion with MCP tool use support.
   * Internally loops calling tools until the model emits end_turn.
   * Tool call rounds are transparent to the caller — they do not surface
   * as separate "validation iterations" in the generation loop.
   *
   * Max 10 internal tool-call turns to prevent runaway loops.
   */
  async completeWithTools(
    messages: ChatMessage[],
    tools: McpToolDefinition[],
    onToolCall: (name: string, args: Record<string, unknown>) => Promise<string>,
    options?: LLMCompletionOptions
  ): Promise<string> {
    // Extract system message (Anthropic handles it separately)
    let systemMessage: string | undefined;
    const chatMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
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

    const normalizedMessages = this.normalizeMessages(chatMessages);

    // Convert tool definitions to Anthropic format
    const anthropicTools: AnthropicTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema,
    }));

    // Mutable message list for the agentic loop
    // We use a relaxed type here to accommodate tool result messages
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runMessages: any[] = [...normalizedMessages];

    const temperature = options?.temperature ?? this.defaultTemperature;
    const maxToolTurns = 10;
    let toolTurns = 0;

    while (toolTurns < maxToolTurns) {
      const requestBody: AnthropicToolRequest = {
        model: this.model,
        max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
        messages: runMessages,
        tools: anthropicTools,
      };

      if (systemMessage) {
        requestBody.system = systemMessage;
      }
      if (temperature !== undefined) {
        requestBody.temperature = temperature;
      }
      if (this.topK !== undefined) {
        requestBody.top_k = this.topK;
      }
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

      const data = (await response.json()) as AnthropicToolResponse;

      if (data.stop_reason === "end_turn") {
        // Extract text from final response
        const textBlock = data.content.find(
          (b): b is AnthropicTextBlock => b.type === "text"
        );
        return textBlock?.text ?? "";
      }

      if (data.stop_reason === "tool_use") {
        toolTurns++;

        // Append assistant response to message history
        runMessages.push({ role: "assistant", content: data.content });

        // Execute all tool calls and collect results
        const toolResults: AnthropicToolResultBlock[] = [];
        for (const block of data.content) {
          if (block.type === "tool_use") {
            const toolUse = block as AnthropicToolUseBlock;
            const result = await onToolCall(toolUse.name, toolUse.input);
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: result,
            });
          }
        }

        // Append tool results as user message
        const toolMessage: AnthropicToolMessage = {
          role: "user",
          content: toolResults,
        };
        runMessages.push(toolMessage);
        continue;
      }

      // Unexpected stop reason — return whatever text we have
      const textBlock = data.content.find(
        (b): b is AnthropicTextBlock => b.type === "text"
      );
      return textBlock?.text ?? "";
    }

    throw new Error(`Max tool call turns (${maxToolTurns}) exceeded`);
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
