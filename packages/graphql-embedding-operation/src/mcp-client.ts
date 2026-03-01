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

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Send a JSON-RPC 2.0 request to the MCP server.
   * Handles both application/json and text/event-stream responses.
   */
  private async callJsonRpc(
    method: string,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const id = String(++_idCounter);
    const body: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };

    const response = await fetch(this.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`MCP server responded with ${response.status}: ${response.statusText}`);
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
    args: Record<string, unknown>
  ): Promise<string> {
    const result = (await this.callJsonRpc("tools/call", {
      name,
      arguments: args,
    })) as McpToolCallResult;

    const textBlocks = (result.content ?? [])
      .filter((b): b is McpContentBlock & { type: "text"; text: string } =>
        b.type === "text" && typeof b.text === "string"
      )
      .map((b) => b.text);

    return textBlocks.join("\n");
  }

  /**
   * Search the schema for documents matching the query.
   */
  async search(query: string): Promise<string> {
    try {
      return await this.callTool("Search", { query });
    } catch {
      return "";
    }
  }

  /**
   * Introspect a specific type or field in the schema.
   */
  async introspect(query: string): Promise<string> {
    try {
      return await this.callTool("Introspect", { query });
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
      const text = await this.callTool("Validate", { operation });

      // Parse the validate response. Apollo MCP Server returns plain text or JSON.
      // Try JSON first, then look for error patterns in plain text.
      try {
        const parsed = JSON.parse(text) as { valid?: boolean; errors?: string[] };
        return {
          valid: parsed.valid ?? true,
          errors: parsed.errors ?? [],
        };
      } catch {
        // Plain text: look for error indicators
        const lowerText = text.toLowerCase();
        if (
          lowerText.includes("error") ||
          lowerText.includes("invalid") ||
          lowerText.includes("unknown")
        ) {
          // Extract lines that look like errors
          const errorLines = text
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("```"));
          return { valid: false, errors: errorLines };
        }
        // No error indicators — treat as valid
        return { valid: true, errors: [] };
      }
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
      const result = (await this.callJsonRpc("tools/list", {})) as McpToolsListResult;
      return (result.tools ?? []).map((t) => t.name);
    } catch {
      return [];
    }
  }
}
