import {
  parse,
  validate,
  type GraphQLSchema,
  type GraphQLError,
} from "graphql";
import type { VectorStore } from "graphql-embedding-core";
import type {
  EmbeddingDocument,
  RootOperationType,
} from "graphql-embedding-parser";
import type {
  LLMProvider,
  LLMToolProvider,
  McpToolDefinition,
  ChatMessage,
} from "graphql-embedding-core";
import { McpClient } from "./mcp-client.js";
import type {
  DynamicOperationOptions,
  GenerationContext,
  GenerationRuntimeOptions,
  DynamicGeneratedOperation,
  FilteredSearchResult,
  ValidationResult,
  OperationLogger,
} from "./types.js";

/** Built-in GraphQL scalar types to skip during type discovery */
const GRAPHQL_SCALARS = new Set(["ID", "String", "Int", "Float", "Boolean"]);

/**
 * Generates GraphQL operations dynamically using LLM and vector similarity search.
 * Implements a 14-step process combining embedding-based retrieval with LLM reasoning.
 */
/** MCP tool definitions exposed to the LLM during operation generation. */
const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "search",
    description:
      "Search the GraphQL schema for relevant types, fields, and documents by keyword. Use this when you need to find information about specific entities or operations in the schema.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to find relevant schema documents",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "introspect",
    description:
      "Introspect a specific GraphQL type or field name to get its full schema definition including all fields, arguments, and descriptions.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Type or field name to introspect",
        },
      },
      required: ["query"],
    },
  },
];

export class DynamicOperationGenerator {
  private readonly llmProvider: LLMProvider;
  private readonly vectorStore: VectorStore;
  private readonly minSimilarityScore: number;
  private readonly maxDocuments: number;
  private readonly maxTypeDepth: number;
  private readonly maxValidationRetries: number;
  private readonly schema?: GraphQLSchema;
  private readonly logger?: OperationLogger;
  private readonly mcpServerUrl?: string;
  private embeddingDimensions = 0;
  private _mcpClient?: McpClient;

  constructor(options: DynamicOperationOptions) {
    this.llmProvider = options.llmProvider;
    this.vectorStore = options.vectorStore;
    this.minSimilarityScore = options.minSimilarityScore ?? 0.4;
    this.maxDocuments = options.maxDocuments ?? 50;
    this.maxTypeDepth = options.maxTypeDepth ?? 5;
    this.maxValidationRetries = options.maxValidationRetries ?? 5;
    this.schema = options.schema;
    this.logger = options.logger;
    this.mcpServerUrl = options.mcpServerUrl;
  }

  /** Return a lazily-created McpClient if a server URL is configured. */
  private getMcpClient(): McpClient | undefined {
    if (!this.mcpServerUrl) return undefined;
    if (!this._mcpClient) {
      this._mcpClient = new McpClient(this.mcpServerUrl);
    }
    return this._mcpClient;
  }

  /**
   * Route an LLM completion through MCP tool use when available.
   *
   * - If the provider implements LLMToolProvider AND an MCP server is configured,
   *   calls completeWithTools() so the LLM can invoke Search/Introspect as needed.
   *   Each tool call turn is transparent — it does NOT increment the validation counter.
   * - Otherwise falls back to the standard complete() call.
   *
   * System messages are extracted and passed correctly for each path.
   */
  private async callLLMWithMcpTools(
    messages: ChatMessage[],
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<string> {
    const mcpClient = this.getMcpClient();
    const toolProvider = this.llmProvider as unknown as LLMToolProvider;

    if (mcpClient && toolProvider.supportsTools === true) {
      this.log(
        "[MCP] Using tool-enabled LLM call (Search + Introspect available)",
      );
      return toolProvider.completeWithTools(
        messages,
        MCP_TOOLS,
        async (name, args) => {
          const query = (args["query"] as string) ?? "";
          this.log(`[MCP] LLM called tool: ${name}("${query}")`);
          if (name === "search") {
            this.logger?.onToolCall?.(name, query);
            const result = await mcpClient.search(query);
            this.log(`[MCP] Search result length: ${result.length} chars`);
            this.logger?.onToolResult?.(name, result.length);
            return result || "(no results)";
          }
          if (name === "introspect") {
            this.logger?.onToolCall?.(name, query);
            const result = await mcpClient.introspect(query);
            this.log(`[MCP] Introspect result length: ${result.length} chars`);
            this.logger?.onToolResult?.(name, result.length);
            return result || "(no results)";
          }
          return `Unknown tool: ${name}`;
        },
        options,
      );
    }

    return this.llmProvider.complete(messages, options);
  }

  /**
   * Validate a GraphQL operation via the Apollo MCP Server directly.
   * Returns null if the MCP server is not configured or unreachable.
   * Does NOT involve the LLM.
   */
  private async validateWithMcp(
    operation: string,
  ): Promise<ValidationResult | null> {
    const mcpClient = this.getMcpClient();
    if (!mcpClient) return null;

    this.log("[MCP] Validating operation via Apollo MCP Server...");
    const result = await mcpClient.validate(operation);
    if (!result) {
      this.log(
        "[MCP] MCP validate tool unavailable, falling back to local validation",
      );
      return null;
    }
    this.log(
      `[MCP] Validation result: ${result.valid ? "VALID" : "INVALID"} (${
        result.errors.length
      } errors)`,
    );
    return result;
  }

  private log(message: string): void {
    this.logger?.log(message);
  }

  /**
   * Fallback generation path when vector search returns no results.
   * Calls the MCP Search tool directly, uses the schema context it returns to
   * generate an operation via LLM, then runs the normal validation loop.
   */
  private async generateFromMcpSearch(
    inputText: string,
    maxValidationRetries: number,
  ): Promise<DynamicGeneratedOperation> {
    const mcpClient = this.getMcpClient()!;

    this.log("\n--- MCP FALLBACK: Searching schema via Apollo MCP Server ---");
    const mcpContext = await mcpClient.search(inputText);
    this.log(
      `[MCP] Search returned ${mcpContext.length} chars of schema context`,
    );

    if (!mcpContext.trim()) {
      throw new Error(
        "No relevant schema documents found — vector search returned no results and the MCP Search tool returned nothing.",
      );
    }

    // Generate the operation using the MCP search result as schema context
    this.log(
      "\n--- MCP FALLBACK: Generating operation from MCP schema context ---",
    );
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Your goal is to generate a valid GraphQL operation and example variables based on the schema context provided. Return the operation in a ```graphql code block and variables in a ```json code block.",
      },
      {
        role: "assistant",
        content: `Schema context from MCP server:\n${mcpContext}`,
      },
      {
        role: "user",
        content: `Can you generate me a valid GraphQL operation for: "${inputText}"`,
      },
    ];

    const response = await this.callLLMWithMcpTools(messages, {
      temperature: 0.2,
      maxTokens: 2000,
    });

    this.log("\nLLM response (MCP fallback):");
    this.log(response);

    const operation =
      this.extractCodeBlock(response, "graphql") ||
      this.extractCodeBlock(response, "") ||
      response.trim();

    let variables: Record<string, unknown> = {};
    const jsonBlock = this.extractCodeBlock(response, "json");
    if (jsonBlock) {
      try {
        variables = JSON.parse(jsonBlock);
      } catch {
        // ignore parse failure
      }
    }

    this.log("\nGenerated operation (MCP fallback):");
    this.log(operation);

    // Run the standard validation loop (uses MCP validate or local, same as normal path)
    this.log("\n--- MCP FALLBACK: Validating operation ---");
    const { operation: validatedOperation, attempts } =
      await this.validateAndRetry(
        operation,
        [],
        inputText,
        maxValidationRetries,
      );

    this.log(`Validation completed after ${attempts} attempt(s)`);

    this.log("\n" + "=".repeat(60));
    this.log("DYNAMIC OPERATION GENERATION COMPLETED (via MCP fallback)");
    this.log(`Validation attempts: ${attempts}`);
    this.log("=".repeat(60));

    return {
      operation: validatedOperation,
      variables,
      operationType: "query",
      rootField: "",
      relevantDocuments: [],
      validationAttempts: attempts,
    };
  }

  /**
   * Generate a GraphQL operation from user input using the 14-step process.
   *
   * @param context - Generation context with pre-embedded input vector and original text
   * @returns Generated operation with metadata
   */
  async generateDynamicOperation(
    context: GenerationContext,
    runtimeOptions?: GenerationRuntimeOptions,
  ): Promise<DynamicGeneratedOperation> {
    const { inputVector, inputText } = context;

    // Store embedding dimensions for type lookups later
    this.embeddingDimensions = inputVector.length;

    // Use runtime options if provided, otherwise fall back to constructor defaults
    const minSimilarityScore =
      runtimeOptions?.minSimilarityScore ?? this.minSimilarityScore;
    const maxDocuments = runtimeOptions?.maxDocuments ?? this.maxDocuments;
    const maxValidationRetries =
      runtimeOptions?.maxValidationRetries ?? this.maxValidationRetries;

    this.log("=".repeat(60));
    this.log("DYNAMIC OPERATION GENERATION STARTED");
    this.log(`Input text: "${inputText}"`);
    this.log(`Input vector dimensions: ${inputVector.length}`);
    this.log("=".repeat(60));

    // Step 3-4: Search for relevant root fields
    this.log("\n--- STEP 3-4: Searching for relevant root fields ---");
    this.log(
      `Parameters: minSimilarityScore=${minSimilarityScore}, maxDocuments=${maxDocuments}`,
    );
    let currentScore = minSimilarityScore;
    let searchResults = await this.searchRootFields(
      inputVector,
      currentScore,
      maxDocuments,
    );

    while (searchResults.length === 0 && currentScore - 0.05 >= 0) {
      currentScore = Math.round((currentScore - 0.05) * 100) / 100;
      this.log(
        `No results at similarity >= ${(currentScore + 0.05).toFixed(
          2,
        )}, retrying with >= ${currentScore.toFixed(2)}`,
      );
      searchResults = await this.searchRootFields(
        inputVector,
        currentScore,
        maxDocuments,
      );
    }

    this.log(
      `Found ${searchResults.length} root operation fields with similarity >= ${currentScore}`,
    );
    if (searchResults.length > 0) {
      const minScore = Math.min(...searchResults.map((r) => r.score));
      const maxScore = Math.max(...searchResults.map((r) => r.score));
      this.log(`Score range: ${minScore.toFixed(4)} - ${maxScore.toFixed(4)}`);
      this.log("\nTop matching root fields:");
      for (const r of searchResults.slice(0, 10)) {
        this.log(
          `  [score=${r.score.toFixed(4)}] ${
            r.document.metadata.rootOperationType
          }.${r.document.name}`,
        );
        this.log(
          `           Content: ${r.document.content.substring(0, 100)}...`,
        );
      }
      if (searchResults.length > 10) {
        this.log(`  ... and ${searchResults.length - 10} more`);
      }
    }

    if (searchResults.length === 0) {
      const mcpClient = this.getMcpClient();
      if (mcpClient) {
        this.log(
          `[MCP] No vector results — short-circuiting to MCP Search with query: "${inputText}"`,
        );
        return this.generateFromMcpSearch(inputText, maxValidationRetries);
      }
      this.log(
        `ERROR: No root fields found even after reducing similarity to ${currentScore.toFixed(
          2,
        )}`,
      );
      throw new Error(
        "No relevant root fields found in the schema for the given input",
      );
    }

    // Step 5-6: Determine root operation type (Query/Mutation/Subscription)
    this.log("\n--- STEP 5-6: Determining root operation type via LLM ---");
    const operationType = await this.determineRootOperationType(
      searchResults,
      inputText,
    );
    this.log(`LLM determined operation type: ${operationType}`);

    // Step 7: Filter results by operation type
    this.log("\n--- STEP 7: Filtering results by operation type ---");
    const filteredResults = this.filterByOperationType(
      searchResults,
      operationType,
    );
    this.log(`Filtered to ${filteredResults.length} ${operationType} fields`);

    if (filteredResults.length === 0) {
      this.log(`ERROR: No ${operationType} fields found!`);
      throw new Error(`No ${operationType} fields found in search results`);
    }

    this.log("\nFiltered fields:");
    for (const r of filteredResults) {
      this.log(
        `  [${r.score.toFixed(4)}] ${
          r.document.name
        }: ${r.document.content.substring(0, 80)}...`,
      );
    }

    // Step 8: Select most relevant field
    this.log("\n--- STEP 8: Selecting most relevant field via LLM ---");
    const selectedField = await this.selectMostRelevantField(
      filteredResults,
      inputText,
    );
    this.log(`Selected field: ${selectedField.name}`);
    this.log(`Field content: ${selectedField.content}`);
    this.log(`Return type: ${selectedField.metadata.fieldType}`);
    if (selectedField.metadata.arguments?.length) {
      this.log(
        `Arguments: ${selectedField.metadata.arguments
          .map((a) => `${a.name}: ${a.type}`)
          .join(", ")}`,
      );
    }

    // Step 9: Discover related types recursively
    this.log("\n--- STEP 9: Discovering related types recursively ---");
    this.log(`Max type depth: ${this.maxTypeDepth}`);
    const relatedTypes = await this.discoverRelatedTypes(selectedField);
    this.log(`Discovered ${relatedTypes.length} related types`);
    if (relatedTypes.length > 0) {
      this.log("\nRelated types:");
      for (const t of relatedTypes) {
        this.log(`  - ${t.name} (${t.type})`);
        this.log(`    Content: ${t.content.substring(0, 100)}...`);
      }
    }

    // Step 10: Generate operation with LLM
    this.log("\n--- STEP 10: Generating operation with LLM ---");
    this.log(`Providing ${1 + relatedTypes.length} schema documents to LLM`);
    const { operation, variables } = await this.generateOperationWithLLM(
      selectedField,
      relatedTypes,
      inputText,
    );
    this.log("\nGenerated operation:");
    this.log(operation);
    if (Object.keys(variables).length > 0) {
      this.log("\nGenerated variables:");
      this.log(JSON.stringify(variables, null, 2));
    }

    // Step 11-13: Validate and retry loop
    this.log("\n--- STEP 11-13: Validating and fixing operation ---");
    this.log(`Max validation retries: ${maxValidationRetries}`);
    const { operation: validatedOperation, attempts } =
      await this.validateAndRetry(
        operation,
        [selectedField, ...relatedTypes],
        inputText,
        maxValidationRetries,
      );
    this.log(`Validation completed after ${attempts} attempt(s)`);

    if (validatedOperation !== operation) {
      this.log("\nFinal validated operation:");
      this.log(validatedOperation);
    }

    // Step 14: Return final result
    this.log("\n" + "=".repeat(60));
    this.log("DYNAMIC OPERATION GENERATION COMPLETED");
    this.log(`Operation type: ${operationType}`);
    this.log(`Root field: ${selectedField.name}`);
    this.log(`Validation attempts: ${attempts}`);
    this.log("=".repeat(60));

    return {
      operation: validatedOperation,
      variables,
      operationType: operationType.toLowerCase() as
        | "query"
        | "mutation"
        | "subscription",
      rootField: selectedField.name,
      relevantDocuments: [
        ...filteredResults,
        ...relatedTypes.map((d) => ({
          document: d,
          score: 1.0, // Types discovered via traversal don't have scores
        })),
      ],
      validationAttempts: attempts,
    };
  }

  /**
   * Step 3-4: Search vector store for relevant root operation fields.
   *
   * Uses SQL-level WHERE clause filtering to retrieve only root operation
   * fields, avoiding the need to fetch all documents and filter in JS.
   */
  private async searchRootFields(
    inputVector: number[],
    minSimilarityScore: number,
    maxDocuments: number,
  ): Promise<FilteredSearchResult[]> {
    const results = (await this.vectorStore.search(inputVector, {
      limit: maxDocuments,
      metadataFilters: [
        {
          field: "parentType",
          operator: "in",
          value: ["Query", "Mutation", "Subscription"],
        },
      ],
    })) as FilteredSearchResult[];

    this.log(
      `Vector store returned ${results.length} root operation fields (filtered at SQL level)`,
    );

    // Enrich results with rootOperationType if not set (for older parser data)
    for (const r of results) {
      if (
        !r.document.metadata.rootOperationType &&
        r.document.metadata.parentType
      ) {
        r.document.metadata.rootOperationType = r.document.metadata
          .parentType as RootOperationType;
        r.document.metadata.isRootOperationField = true;
      }
    }

    // Apply similarity score threshold
    const filtered = results.filter((r) => r.score >= minSimilarityScore);

    this.log(
      `Found ${filtered.length} root operation fields with similarity >= ${minSimilarityScore}`,
    );

    return filtered;
  }

  /**
   * Step 5-6: Use LLM to determine which root operation type is most relevant
   */
  private async determineRootOperationType(
    results: FilteredSearchResult[],
    inputText: string,
  ): Promise<RootOperationType> {
    const messages: ChatMessage[] = [];

    // Add each result as assistant message with format: rootOperationType:content
    for (const r of results) {
      const opType = r.document.metadata.rootOperationType;
      messages.push({
        role: "assistant",
        content: `${opType}:${r.document.content}`,
      });
    }

    // Final user message asking to determine operation type
    const userPrompt = `My assistant returned the most relevant root fields based on my input: "${inputText}", which root field (Query, Mutation, Subscription) is most relevant? Respond with ONLY the root field (i.e Query, Mutation, Subscription)`;
    messages.push({
      role: "user",
      content: userPrompt,
    });

    this.log(
      `Sending ${messages.length} messages to LLM (${results.length} assistant + 1 user)`,
    );
    this.log(`User prompt: ${userPrompt}`);

    const response = await this.llmProvider.complete(messages, {
      temperature: 0.1,
      maxTokens: 50,
    });

    this.log(`LLM response: "${response.trim()}"`);

    // Parse response to extract operation type
    const normalized = response.trim().toLowerCase();

    if (normalized.includes("mutation")) {
      return "Mutation";
    }
    if (normalized.includes("subscription")) {
      return "Subscription";
    }
    return "Query"; // Default to Query
  }

  /**
   * Step 7: Filter search results by operation type
   */
  private filterByOperationType(
    results: FilteredSearchResult[],
    operationType: RootOperationType,
  ): FilteredSearchResult[] {
    return results.filter(
      (r) => r.document.metadata.rootOperationType === operationType,
    );
  }

  /**
   * Step 8: Use LLM to select the most relevant field from filtered results
   */
  private async selectMostRelevantField(
    filtered: FilteredSearchResult[],
    inputText: string,
  ): Promise<EmbeddingDocument> {
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Your goal is to select what you think is the most relevant field related to the users input. The assistant messages are the text for root Query/Mutation/Subscription fields of a GraphQL API.",
      },
    ];

    // Add each filtered result as assistant message
    for (const r of filtered) {
      messages.push({
        role: "assistant",
        content: `${r.document.id}:${r.document.content}`,
      });
    }

    // Final user message
    const userPrompt = `Based on the above information, which root field (Query, Mutation, Subscription) is most relevant to the user request: ${inputText}? Respond with ONLY the id of the most relevant field`;
    messages.push({
      role: "user",
      content: userPrompt,
    });

    this.log(
      `Sending ${messages.length} messages to LLM (1 system + ${filtered.length} assistant + 1 user)`,
    );
    this.log(
      `Candidate field IDs: ${filtered.map((r) => r.document.id).join(", ")}`,
    );

    const response = await this.llmProvider.complete(messages, {
      temperature: 0.1,
      maxTokens: 100,
    });

    // Find matching document by ID
    const responseId = response.trim();
    this.log(`LLM response (field ID): "${responseId}"`);

    const matched = filtered.find((r) => r.document.id === responseId);

    if (matched) {
      this.log(`Exact match found for ID: ${responseId}`);
      return matched.document;
    }

    // If exact match not found, try partial match or return highest scored
    const partialMatch = filtered.find(
      (r) =>
        responseId.includes(r.document.id) ||
        r.document.id.includes(responseId),
    );

    if (partialMatch) {
      this.log(
        `Partial match found: LLM said "${responseId}", matched to "${partialMatch.document.id}"`,
      );
      return partialMatch.document;
    }

    // Default to highest scored result
    this.log(
      `No ID match found, falling back to highest scored field: ${
        filtered[0]!.document.name
      }`,
    );
    return filtered[0]!.document;
  }

  /**
   * Step 9: Recursively discover all types referenced by the selected field
   */
  async discoverRelatedTypes(
    rootField: EmbeddingDocument,
  ): Promise<EmbeddingDocument[]> {
    const discoveredTypes = new Map<string, EmbeddingDocument>();
    const typesToProcess: string[] = [];

    // Extract return type from field metadata
    const returnType = this.extractBaseTypeName(
      rootField.metadata.fieldType ?? "",
    );
    if (returnType && !GRAPHQL_SCALARS.has(returnType)) {
      typesToProcess.push(returnType);
    }

    // Extract input types from arguments
    const args = rootField.metadata.arguments ?? [];
    for (const arg of args) {
      const argType = this.extractBaseTypeName(arg.type);
      if (argType && !GRAPHQL_SCALARS.has(argType)) {
        typesToProcess.push(argType);
      }
    }

    // BFS traversal with depth limit
    let depth = 0;
    while (typesToProcess.length > 0 && depth < this.maxTypeDepth) {
      const currentBatch = [...typesToProcess];
      typesToProcess.length = 0;

      for (const typeName of currentBatch) {
        if (discoveredTypes.has(typeName)) {
          continue;
        }

        // Search for type by name in vector store
        const typeDoc = await this.findTypeByName(typeName);
        if (typeDoc) {
          discoveredTypes.set(typeName, typeDoc);

          // Get field documents to find their types
          const fieldDocs = await this.findFieldsForType(typeName);
          for (const fieldDoc of fieldDocs) {
            const fieldType = this.extractBaseTypeName(
              fieldDoc.metadata.fieldType ?? "",
            );
            if (
              fieldType &&
              !GRAPHQL_SCALARS.has(fieldType) &&
              !discoveredTypes.has(fieldType)
            ) {
              typesToProcess.push(fieldType);
            }
          }

          // Handle union types
          const possibleTypes = typeDoc.metadata.possibleTypes ?? [];
          for (const pt of possibleTypes) {
            if (!discoveredTypes.has(pt)) {
              typesToProcess.push(pt);
            }
          }

          // Handle interface implementations
          const interfaces = typeDoc.metadata.interfaces ?? [];
          for (const iface of interfaces) {
            if (!discoveredTypes.has(iface)) {
              typesToProcess.push(iface);
            }
          }
        }
      }

      depth++;
    }

    return Array.from(discoveredTypes.values());
  }

  /**
   * Extract base type name from GraphQL type string (e.g., "[User!]!" -> "User")
   */
  private extractBaseTypeName(typeStr: string): string {
    return typeStr.replace(/[\[\]!]/g, "").trim();
  }

  /**
   * Search vector store for a type document by name.
   * Handles chunked documents by merging multiple chunks into a single document.
   * If the initial query doesn't return all chunks, a second query is issued
   * with a limit matching totalChunks to ensure completeness.
   */
  private async findTypeByName(
    typeName: string,
  ): Promise<EmbeddingDocument | null> {
    const zeroVector = new Array(this.embeddingDimensions).fill(0) as number[];
    const searchFilters = {
      columnFilters: [
        { column: "name" as const, operator: "eq" as const, value: typeName },
        {
          column: "type" as const,
          operator: "in" as const,
          value: ["object", "input", "interface", "union", "enum", "scalar"],
        },
      ],
    };

    let results = await this.vectorStore.search(zeroVector, {
      limit: 10,
      ...searchFilters,
    });

    if (results.length === 0) {
      return null;
    }

    // Check if results are chunked documents
    let chunkedResults = results.filter(
      (r) =>
        r.document.metadata.chunkIndex !== undefined &&
        r.document.metadata.totalChunks !== undefined,
    );

    if (chunkedResults.length > 0) {
      const totalChunks = chunkedResults[0]!.document.metadata.totalChunks!;

      // If we don't have all chunks, re-query with the correct limit
      if (chunkedResults.length < totalChunks) {
        this.log(
          `Found ${chunkedResults.length}/${totalChunks} chunks for ${typeName}, fetching all chunks...`,
        );
        results = await this.vectorStore.search(zeroVector, {
          limit: totalChunks,
          ...searchFilters,
        });
        chunkedResults = results.filter(
          (r) =>
            r.document.metadata.chunkIndex !== undefined &&
            r.document.metadata.totalChunks !== undefined,
        );
      }

      if (chunkedResults.length > 1) {
        return this.mergeChunkedDocuments(chunkedResults);
      }
    }

    return results[0]!.document;
  }

  /**
   * Merge multiple chunked search results into a single document.
   * Sorts chunks by chunkIndex, extracts fields from each, and
   * concatenates them under the shared type header.
   */
  private mergeChunkedDocuments(
    chunkedResults: { document: EmbeddingDocument; score: number }[],
  ): EmbeddingDocument {
    chunkedResults.sort(
      (a, b) =>
        (a.document.metadata.chunkIndex ?? 0) -
        (b.document.metadata.chunkIndex ?? 0),
    );

    const firstChunk = chunkedResults[0]!.document;

    // Each chunk has format: header{fields}
    const mergedFields: string[] = [];
    let header = "";

    for (const result of chunkedResults) {
      const content = result.document.content;
      const braceIndex = content.indexOf("{");
      if (braceIndex === -1) continue;

      if (!header) {
        header = content.substring(0, braceIndex + 1);
      }

      const body = content.substring(braceIndex + 1);
      const closingIndex = body.lastIndexOf("}");
      const fields =
        closingIndex !== -1 ? body.substring(0, closingIndex) : body;
      if (fields.trim()) {
        mergedFields.push(fields);
      }
    }

    const mergedContent = header + mergedFields.join("") + "}";

    return {
      ...firstChunk,
      id: firstChunk.id,
      content: mergedContent,
      metadata: {
        ...firstChunk.metadata,
        chunkIndex: undefined,
        totalChunks: undefined,
      },
    };
  }

  /**
   * Find all field documents for a given parent type
   */
  private async findFieldsForType(
    typeName: string,
  ): Promise<EmbeddingDocument[]> {
    const zeroVector = new Array(this.embeddingDimensions).fill(0) as number[];
    const results = await this.vectorStore.search(zeroVector, {
      limit: 100,
      columnFilters: [{ column: "type", operator: "eq", value: "field" }],
      metadataFilters: [
        { field: "parentType", operator: "eq", value: typeName },
      ],
    });

    return results.map((r) => r.document);
  }

  /**
   * Step 10: Generate the GraphQL operation using LLM
   */
  async generateOperationWithLLM(
    rootField: EmbeddingDocument,
    types: EmbeddingDocument[],
    inputText: string,
  ): Promise<{ operation: string; variables: Record<string, unknown> }> {
    // Identify required (non-null) arguments that must always be included
    const args = rootField.metadata.arguments ?? [];
    const requiredArgs = args.filter((a: { name: string; type: string }) =>
      a.type.trim().endsWith("!"),
    );

    let requiredArgsInstruction = "";
    if (requiredArgs.length > 0) {
      const argList = requiredArgs
        .map((a: { name: string; type: string }) => `  - ${a.name}: ${a.type}`)
        .join("\n");
      requiredArgsInstruction = `\n\nCRITICAL: The selected root field has REQUIRED arguments (non-null). You MUST include ALL of the following arguments in the operation with corresponding variable declarations:\n${argList}\nOmitting any required argument will cause the operation to be invalid.`;
    }

    const systemPrompt = `Your goal is to generate a valid GraphQL operation and example variables based on the assistant documents in the chat history. Return the operation in a \`\`\`graphql code block and variables in a \`\`\`json code block.${requiredArgsInstruction}`;

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];

    // Add root field as assistant message
    messages.push({
      role: "assistant",
      content: `Root Field:\n${rootField.content}`,
    });

    // Add related types as assistant messages
    for (const typeDoc of types) {
      messages.push({
        role: "assistant",
        content: `Type ${typeDoc.name}:\n${typeDoc.content}`,
      });
    }

    // Final user message — re-state required args so the LLM cannot miss them
    let userPrompt = `My assistant returned the most relevant pieces of the GraphQL schema, can you generate me a valid GraphQL operation for my initial question: "${inputText}"`;
    if (requiredArgs.length > 0) {
      const argNames = requiredArgs
        .map((a: { name: string; type: string }) => `${a.name} (${a.type})`)
        .join(", ");
      userPrompt += `\n\nIMPORTANT: Make sure to include ALL required arguments in the operation: ${argNames}`;
    }
    messages.push({
      role: "user",
      content: userPrompt,
    });

    this.log(
      `Sending ${messages.length} messages to LLM for operation generation`,
    );
    this.log(`System prompt: ${systemPrompt}`);
    this.log(`User prompt: ${userPrompt}`);

    const response = await this.callLLMWithMcpTools(messages, {
      temperature: 0.2,
      maxTokens: 2000,
    });

    this.log("\nLLM raw response:");
    this.log(response);

    // Extract operation from ```graphql block
    const operation =
      this.extractCodeBlock(response, "graphql") ||
      this.extractCodeBlock(response, "") ||
      response.trim();

    // Extract variables from ```json block
    let variables: Record<string, unknown> = {};
    const jsonBlock = this.extractCodeBlock(response, "json");
    if (jsonBlock) {
      try {
        variables = JSON.parse(jsonBlock);
        this.log("\nParsed variables from JSON block");
      } catch {
        this.log("\nFailed to parse JSON variables block");
      }
    }

    return { operation, variables };
  }

  /**
   * Extract content from a code block with the given language
   */
  private extractCodeBlock(text: string, language: string): string | null {
    const pattern = language
      ? new RegExp("```" + language + "\\s*\\n([\\s\\S]*?)```", "i")
      : /```\s*\n([\s\S]*?)```/;

    const match = text.match(pattern);
    return match ? match[1]!.trim() : null;
  }

  /**
   * Step 11-13: Validate operation and retry with LLM fixes if needed
   */
  async validateAndRetry(
    operation: string,
    context: EmbeddingDocument[],
    inputText: string,
    maxRetries?: number,
  ): Promise<{ operation: string; attempts: number }> {
    const maxValidationRetries = maxRetries ?? this.maxValidationRetries;
    let currentOperation = operation;
    let attempts = 1;

    while (attempts <= maxValidationRetries) {
      this.log(`\nValidation attempt ${attempts}/${maxValidationRetries}`);

      // Prefer MCP validation (direct, no LLM), fall back to local parse/validate
      let validation: ValidationResult;
      const mcpResult = await this.validateWithMcp(currentOperation);
      const validationMethod: "mcp" | "local" =
        mcpResult !== null ? "mcp" : "local";
      if (mcpResult !== null) {
        validation = mcpResult;
        this.log(`[MCP] Validation used: Apollo MCP Server`);
      } else {
        validation = this.validateOperation(currentOperation);
        this.log(`[Local] Validation used: local GraphQL parser/validator`);
      }

      this.logger?.onValidationAttempt?.(
        attempts,
        maxValidationRetries,
        validation.valid,
        validation.errors,
        currentOperation,
        validationMethod,
      );

      if (validation.valid) {
        this.log("Validation PASSED");
        return { operation: currentOperation, attempts };
      }

      this.log("Validation FAILED with errors:");
      for (const err of validation.errors) {
        this.log(`  - ${err}`);
      }

      if (attempts >= maxValidationRetries) {
        this.log("Max retries reached, returning best effort operation");
        break;
      }

      // Try to fix errors with LLM (tool-enabled when MCP is available)
      this.log("Attempting to fix errors via LLM...");
      currentOperation = await this.fixOperationErrors(
        currentOperation,
        validation.errors,
        context,
        inputText,
      );
      this.log("\nFixed operation:");
      this.log(currentOperation);
      attempts++;
    }

    // Return the operation even if validation failed
    return { operation: currentOperation, attempts };
  }

  /**
   * Step 11: Validate a GraphQL operation
   */
  private validateOperation(operation: string): ValidationResult {
    const errors: string[] = [];

    // Parse validation
    try {
      const ast = parse(operation);

      // Schema validation if schema is available
      if (this.schema) {
        const validationErrors = validate(this.schema, ast);
        for (const err of validationErrors) {
          errors.push(err.message);
        }
      }
    } catch (e) {
      const error = e as GraphQLError | Error;
      errors.push(error.message);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Step 12: Use LLM to fix operation errors
   */
  private async fixOperationErrors(
    operation: string,
    errors: string[],
    context: EmbeddingDocument[],
    inputText: string,
  ): Promise<string> {
    // Re-derive required args from the root field (first context doc is the root field)
    const rootFieldDoc = context[0];
    const requiredArgs = rootFieldDoc
      ? (rootFieldDoc.metadata.arguments ?? []).filter(
          (a: { name: string; type: string }) => a.type.trim().endsWith("!"),
        )
      : [];

    let requiredArgsInstruction = "";
    if (requiredArgs.length > 0) {
      const argList = requiredArgs
        .map((a: { name: string; type: string }) => `  - ${a.name}: ${a.type}`)
        .join("\n");
      requiredArgsInstruction = `\n\nCRITICAL: The following arguments are REQUIRED and must be present in the fixed operation:\n${argList}`;
    }

    // Extract type→missingFields map from validation errors.
    // Both MCP (normalized) and local graphql-js use the same format:
    //   "Cannot query field "schema" on type "Graph"."
    const missingFieldsByType = new Map<string, Set<string>>();
    for (const err of errors) {
      const match = err.match(
        /Cannot query field ["'`]?(\w+)["'`]? on type ["'`]?(\w+)["'`]/i,
      );
      if (match?.[1] && match?.[2]) {
        const fieldName = match[1];
        const typeName = match[2];
        const existing = missingFieldsByType.get(typeName) ?? new Set<string>();
        existing.add(fieldName);
        missingFieldsByType.set(typeName, existing);
      }
    }

    const mcpClient = this.getMcpClient();

    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `You are a GraphQL expert. Fix the errors in the provided GraphQL operation. Return ONLY the corrected operation in a \`\`\`graphql code block. Use ONLY the fields shown in the schema context — never invent or guess field names.${requiredArgsInstruction}`,
      },
    ];

    // Provide original schema context from vector store
    for (const doc of context) {
      messages.push({
        role: "assistant",
        content: doc.content,
      });
    }

    // If the vector search returned no documents, fall back to keyword search so the
    // LLM has at least some schema context to work with.
    if (mcpClient && context.length === 0) {
      this.log(
        `[Fix] No vector search results — falling back to MCP search for: "${inputText}"`,
      );
      this.logger?.onToolCall?.("search", inputText);
      const searchResult = await mcpClient.search(inputText);
      this.logger?.onToolResult?.("search", searchResult.length);
      if (searchResult) {
        this.log(`[Fix] Search fallback: ${searchResult.length} chars`);
        messages.push({
          role: "assistant",
          content: `Schema search results for "${inputText}":\n${searchResult}`,
        });
      }
    }

    // Introspect any types that have "does not have a field" errors so the LLM
    // knows exactly which fields are available on that type.
    if (mcpClient && missingFieldsByType.size > 0) {
      for (const [typeName] of missingFieldsByType.entries()) {
        this.log(`[Fix] Introspecting type: ${typeName}`);
        this.logger?.onToolCall?.("introspect", typeName);
        const typeInfo = await mcpClient.introspect(typeName);
        this.logger?.onToolResult?.("introspect", typeInfo.length);
        if (typeInfo) {
          this.log(
            `[Fix] Schema for ${typeName} (${
              typeInfo.length
            } chars): ${typeInfo.substring(0, 120)}`,
          );
          messages.push({
            role: "assistant",
            content: `Fields available on type ${typeName} (use ONLY these fields — do not guess):\n${typeInfo}`,
          });
        } else {
          this.log(`[Fix] introspect("${typeName}") returned empty`);
        }
      }
    }

    // Provide the broken operation and errors
    const requiredArgsSuffix =
      requiredArgs.length > 0
        ? `\n\nRemember: ALL required arguments must be included: ${requiredArgs
            .map((a: { name: string; type: string }) => `${a.name} (${a.type})`)
            .join(", ")}`
        : "";

    const typeNote =
      missingFieldsByType.size > 0
        ? `\n\nThe introspection results above show the exact fields available on each failing type. Use ONLY those fields — do not invent or guess field names.`
        : "";

    const userPrompt = `The following GraphQL operation has errors:

\`\`\`graphql
${operation}
\`\`\`

Errors:
${errors.map((e) => `- ${e}`).join("\n")}

Original request: "${inputText}"
${typeNote}
Rewrite the operation using only fields that actually exist in the schema context provided above.${requiredArgsSuffix}`;

    messages.push({
      role: "user",
      content: userPrompt,
    });

    this.log(
      `Sending fix request to LLM with ${context.length} schema documents`,
    );
    if (missingFieldsByType.size > 0) {
      this.log(
        `[Fix] Injected live schema for: ${[...missingFieldsByType.keys()].join(
          ", ",
        )}`,
      );
    }

    const response = await this.callLLMWithMcpTools(messages, {
      temperature: 0.1,
      maxTokens: 2000,
    });

    this.log("\nLLM fix response:");
    this.log(response);

    // Extract fixed operation
    const fixedOperation =
      this.extractCodeBlock(response, "graphql") ||
      this.extractCodeBlock(response, "") ||
      response.trim();

    return fixedOperation;
  }

  // --- Public playground methods for step-by-step execution ---

  /**
   * Run only steps 3-4: Search vector store for relevant root operation fields.
   * Returns raw search results with similarity scores.
   */
  async searchRootFieldsOnly(
    inputVector: number[],
    minSimilarityScore?: number,
    maxDocuments?: number,
  ): Promise<FilteredSearchResult[]> {
    const minScore = minSimilarityScore ?? this.minSimilarityScore;
    const maxDocs = maxDocuments ?? this.maxDocuments;

    this.embeddingDimensions = inputVector.length;

    let currentScore = minScore;
    let searchResults = await this.searchRootFields(
      inputVector,
      currentScore,
      maxDocs,
    );

    while (searchResults.length === 0 && currentScore - 0.05 >= 0) {
      currentScore = Math.round((currentScore - 0.05) * 100) / 100;
      this.log(
        `No results at similarity >= ${(currentScore + 0.05).toFixed(
          2,
        )}, retrying with >= ${currentScore.toFixed(2)}`,
      );
      searchResults = await this.searchRootFields(
        inputVector,
        currentScore,
        maxDocs,
      );
    }

    return searchResults;
  }

  /**
   * Run only steps 5-6: Use LLM to determine the root operation type.
   */
  async determineOperationType(
    results: FilteredSearchResult[],
    inputText: string,
  ): Promise<RootOperationType> {
    return this.determineRootOperationType(results, inputText);
  }

  /**
   * Run only steps 7-8: Filter by operation type and select the most relevant field.
   */
  async selectRootField(
    results: FilteredSearchResult[],
    operationType: RootOperationType,
    inputText: string,
  ): Promise<{
    field: EmbeddingDocument;
    filteredResults: FilteredSearchResult[];
  }> {
    const filteredResults = this.filterByOperationType(results, operationType);
    if (filteredResults.length === 0) {
      throw new Error(`No ${operationType} fields found in search results`);
    }
    const field = await this.selectMostRelevantField(
      filteredResults,
      inputText,
    );
    return { field, filteredResults };
  }
}
