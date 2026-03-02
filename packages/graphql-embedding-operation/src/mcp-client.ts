/**
 * Minimal MCP (Model Context Protocol) client for the Apollo MCP Server.
 * Uses the streamable_http transport: POST JSON-RPC 2.0 to the MCP endpoint.
 */

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpContentBlock {
  type: "text" | "image" | "resource";
  text?: string;
}

interface McpToolCallResult {
  content: McpContentBlock[];
  isError?: boolean;
}

interface McpToolsListResult {
  tools: Array<{ name: string; description: string }>;
}

export interface McpValidationResult {
  valid: boolean;
  errors: string[];
}

let _idCounter = 0;

export class McpClient {
  private readonly serverUrl: string;
  private sessionId: string | undefined = undefined;
  private initialized = false;
  private initializingPromise: Promise<void> | undefined = undefined;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Perform the MCP protocol handshake (initialize + initialized notification).
   * Required before any tool calls on the streamable_http transport.
   * Lazily initialized and idempotent — safe to call multiple times.
   */
  private ensureInitialized(): Promise<void> {
    if (this.initialized) return Promise.resolve();
    if (this.initializingPromise) return this.initializingPromise;
    this.initializingPromise = this._initialize().finally(() => {
      this.initializingPromise = undefined;
    });
    return this.initializingPromise;
  }

  private async _initialize(): Promise<void> {
    const id = String(++_idCounter);
    const initBody = {
      jsonrpc: "2.0" as const,
      id,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "graphql-workbench", version: "1.0.0" },
      },
    };

    const initResponse = await fetch(this.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(initBody),
    });

    if (!initResponse.ok) {
      throw new Error(
        `MCP initialize failed: ${initResponse.status} ${initResponse.statusText}`,
      );
    }

    // Capture session ID if the server provides one
    const sessionId = initResponse.headers.get("Mcp-Session-Id");
    if (sessionId) {
      this.sessionId = sessionId;
    }

    // Consume the initialize response body
    const initContentType = initResponse.headers.get("content-type") ?? "";
    if (initContentType.includes("text/event-stream")) {
      await initResponse.text();
    } else {
      await initResponse.json().catch(() => {});
    }

    // Send the initialized notification (no id field = notification, no response expected)
    const notifHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      notifHeaders["Mcp-Session-Id"] = this.sessionId;
    }
    await fetch(this.serverUrl, {
      method: "POST",
      headers: notifHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      }),
    }).catch(() => {}); // Notifications don't need a response

    this.initialized = true;
  }

  /**
   * Send a JSON-RPC 2.0 request to the MCP server.
   * Handles both application/json and text/event-stream responses.
   * Automatically performs the MCP initialization handshake on first call.
   */
  private async callJsonRpc(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    await this.ensureInitialized();

    const id = String(++_idCounter);
    const body: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(
        `MCP server responded with ${response.status}: ${response.statusText}`,
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("text/event-stream")) {
      // SSE: read the first data: line that contains the JSON-RPC response
      const text = await response.text();
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("data: ")) {
          const json = trimmed.slice("data: ".length).trim();
          if (json && json !== "[DONE]") {
            const rpcResponse = JSON.parse(json) as JsonRpcResponse;
            if (rpcResponse.error) {
              throw new Error(`MCP error: ${rpcResponse.error.message}`);
            }
            return rpcResponse.result;
          }
        }
      }
      throw new Error("No valid data event found in SSE response");
    }

    const rpcResponse = (await response.json()) as JsonRpcResponse;
    if (rpcResponse.error) {
      throw new Error(`MCP error: ${rpcResponse.error.message}`);
    }
    return rpcResponse.result;
  }

  /**
   * Call a named MCP tool and return its text content.
   */
  private async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const result = (await this.callJsonRpc("tools/call", {
      name,
      arguments: args,
    })) as McpToolCallResult;

    const textBlocks = (result.content ?? [])
      .filter(
        (b): b is McpContentBlock & { type: "text"; text: string } =>
          b.type === "text" && typeof b.text === "string",
      )
      .map((b) => b.text);

    return textBlocks.join("\n");
  }

  /**
   * Search the schema for documents matching the query.
   */
  async search(query: string): Promise<string> {
    try {
      return await this.callTool("search", { query });
    } catch {
      return "";
    }
  }

  /**
   * Introspect a specific type or field in the schema.
   */
  async introspect(typeName: string): Promise<string> {
    try {
      return await this.callTool("introspect", {
        type_name: typeName,
        depth: 1,
      });
    } catch {
      return "";
    }
  }

  /**
   * Validate a GraphQL operation directly via the MCP server (no LLM involved).
   * Returns null if the server is unreachable.
   */
  async validate(operation: string): Promise<McpValidationResult | null> {
    try {
      const text = await this.callTool("validate", { operation });

      // Try JSON first (future-proofing for structured responses)
      try {
        const parsed = JSON.parse(text) as {
          valid?: boolean;
          errors?: string[];
        };
        if (typeof parsed.valid === "boolean") {
          return {
            valid: parsed.valid,
            errors: parsed.errors ?? [],
          };
        }
      } catch {
        // Not JSON — parse as plain text
      }

      // Apollo MCP Server returns "Operation is valid" on success.
      // Any other non-empty response is a validation failure — use the text as the error.
      const trimmed = text.trim();
      if (!trimmed || trimmed === "Operation is valid") {
        return { valid: true, errors: [] };
      }

      // Apollo MCP Server wraps each logical error in a multi-line ASCII diagnostic
      // block. Normalize each error to graphql-js format so fixOperationErrors
      // receives consistent errors regardless of which validator ran:
      //   MCP:   "Error: type `Graph` does not have a field `schema`"
      //          "Note: path to the field: `query Foo → graph → schema`"
      //   →  "Cannot query field \"schema\" on type \"Graph\"."
      //      "Note: path to the field: `query Foo → graph → schema`"
      const rawLines = trimmed.split("\n").map((l) => l.trim());
      const errors: string[] = [];
      let i = 0;
      while (i < rawLines.length) {
        const line = rawLines[i]!;
        if (/^Error:/i.test(line)) {
          // Normalize "Error: type `X` does not have a field `Y`"
          // → "Cannot query field "Y" on type "X"." (graphql-js format)
          const fieldMatch = line.match(
            /type [`'"]?(\w+)[`'"]? does not have a field [`'"]?(\w+)[`'"]/i,
          );
          const normalized = fieldMatch
            ? `Cannot query field "${fieldMatch[2]}" on type "${fieldMatch[1]}".`
            : line.replace(/^Error:\s*/i, "").trim();

          // Pair with the following Note: line if present (provides path context)
          const next = rawLines[i + 1] ?? "";
          if (/^Note: path to the field:/i.test(next)) {
            errors.push(`${normalized}\n${next}`);
            i += 2;
          } else {
            errors.push(normalized);
            i++;
          }
        } else {
          i++;
        }
      }

      // Fall back to all non-empty lines if the format didn't match (future-proofing)
      const lines =
        errors.length > 0
          ? errors
          : trimmed
              .split("\n")
              .map((l) => l.trim())
              .filter((l) => l.length > 0);

      return { valid: false, errors: lines };
    } catch {
      // Server unreachable or tool call failed
      return null;
    }
  }

  /**
   * List available tool names from the MCP server.
   */
  async listTools(): Promise<string[]> {
    try {
      const result = (await this.callJsonRpc(
        "tools/list",
        {},
      )) as McpToolsListResult;
      return (result.tools ?? []).map((t) => t.name);
    } catch {
      return [];
    }
  }
}
