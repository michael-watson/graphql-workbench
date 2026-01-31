import type {
  LLMProvider,
  ChatMessage,
  LLMCompletionOptions,
} from "graphql-embedding-core";

export interface MockLLMCall {
  messages: ChatMessage[];
  options?: LLMCompletionOptions;
}

/**
 * Mock LLM provider for testing. Matches user message content against
 * regex patterns and returns the corresponding response.
 */
export class MockLLMProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "mock-model";

  private readonly responses: Map<RegExp, string>;
  private readonly _callHistory: MockLLMCall[] = [];

  constructor(responses: Map<RegExp, string>) {
    this.responses = responses;
  }

  get callHistory(): readonly MockLLMCall[] {
    return this._callHistory;
  }

  async initialize(): Promise<void> {}

  async complete(
    messages: ChatMessage[],
    options?: LLMCompletionOptions
  ): Promise<string> {
    this._callHistory.push({ messages, options });

    // Find the last user message
    const userMessage = [...messages].reverse().find((m) => m.role === "user");
    if (!userMessage) {
      return "";
    }

    // Match against patterns
    for (const [pattern, response] of this.responses) {
      if (pattern.test(userMessage.content)) {
        return response;
      }
    }

    return "";
  }

  async dispose(): Promise<void> {}
}
