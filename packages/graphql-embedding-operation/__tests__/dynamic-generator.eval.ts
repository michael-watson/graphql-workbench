import { describe, it, expect } from "vitest";
import type { StoredDocument } from "graphql-embedding-core";
import { DynamicOperationGenerator } from "../src/dynamic-generator.js";
import { MockLLMProvider } from "./fixtures/mock-llm.js";
import { MockVectorStore } from "./fixtures/mock-vector-store.js";

const EMBEDDING_DIMS = 16;
const ZERO_VECTOR = new Array(EMBEDDING_DIMS).fill(0) as number[];

/** Helper to create a minimal root field stored document */
function makeRootFieldDoc(
  name: string,
  opType: "Query" | "Mutation" | "Subscription",
  returnType = "String"
): StoredDocument {
  return {
    id: `field-${opType.toLowerCase()}-${name}`,
    type: "field",
    name,
    description: null,
    content: `${opType}.${name}:${returnType}`,
    metadata: {
      parentType: opType,
      fieldType: returnType,
      isRootOperationField: true,
      rootOperationType: opType,
    },
    embedding: ZERO_VECTOR,
  };
}

/** Helper to create a minimal type stored document */
function makeTypeDoc(
  name: string,
  fields: string[] = ["id:ID!", "name:String"]
): StoredDocument {
  const content = `type ${name}{${fields.join(" ")}}`;
  return {
    id: `type-${name.toLowerCase()}`,
    type: "object",
    name,
    description: null,
    content,
    metadata: {
      kind: "ObjectTypeDefinition",
      fields: fields.map((f) => f.split(":")[0]!),
    },
    embedding: ZERO_VECTOR,
  };
}

function createDefaultLLM(
  opTypeResponse: string,
  fieldIdResponse: string,
  operationResponse: string
): MockLLMProvider {
  return new MockLLMProvider(
    new Map([
      [/which root field.*most relevant\?/i, opTypeResponse],
      [/Respond with ONLY the id/i, fieldIdResponse],
      [/can you generate me a valid GraphQL operation/i, operationResponse],
      [/Please fix the operation|has errors/i, operationResponse],
    ])
  );
}

describe("Operation type determination", () => {
  const docs: StoredDocument[] = [
    makeRootFieldDoc("getUser", "Query"),
    makeRootFieldDoc("createUser", "Mutation"),
    makeTypeDoc("User"),
  ];

  it('LLM returning "Query" -> operationType: "query"', async () => {
    const llm = createDefaultLLM(
      "Query",
      "field-query-getUser",
      "```graphql\nquery { getUser { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 1,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get user info",
    });

    expect(result.operationType).toBe("query");
  });

  it('LLM returning "Mutation" -> operationType: "mutation"', async () => {
    const llm = createDefaultLLM(
      "Mutation",
      "field-mutation-createUser",
      "```graphql\nmutation { createUser { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 1,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "create a user",
    });

    expect(result.operationType).toBe("mutation");
  });

  it('LLM returning text containing "mutation" -> operationType: "mutation"', async () => {
    const llm = createDefaultLLM(
      "I think the best choice is Mutation",
      "field-mutation-createUser",
      "```graphql\nmutation { createUser { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 1,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "create a user",
    });

    expect(result.operationType).toBe("mutation");
  });

  it('LLM returning ambiguous text -> defaults to "query"', async () => {
    const llm = createDefaultLLM(
      "I'm not sure, maybe fetch something",
      "field-query-getUser",
      "```graphql\nquery { getUser { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 1,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get something",
    });

    expect(result.operationType).toBe("query");
  });
});

describe("Field selection fallback behavior", () => {
  const docs: StoredDocument[] = [
    makeRootFieldDoc("getUser", "Query", "User"),
    makeRootFieldDoc("getPost", "Query", "Post"),
    makeRootFieldDoc("getPosts", "Query", "[Post]"),
    makeTypeDoc("User"),
    makeTypeDoc("Post"),
  ];

  it("exact ID match works", async () => {
    const llm = createDefaultLLM(
      "Query",
      "field-query-getPost",
      "```graphql\nquery { getPost { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 1,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get a post",
    });

    expect(result.rootField).toBe("getPost");
  });

  it("partial ID match falls back correctly", async () => {
    const llm = createDefaultLLM(
      "Query",
      "field-query-getUs", // partial match
      "```graphql\nquery { getUser { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 1,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get user info",
    });

    expect(result.rootField).toBe("getUser");
  });

  it("unrecognized ID falls back to highest-scored result", async () => {
    const llm = createDefaultLLM(
      "Query",
      "completely-wrong-id",
      "```graphql\nquery { getUser { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 1,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get something",
    });

    // Should fall back to first (highest scored) query field
    expect(result.rootField).toBe("getUser");
  });
});

describe("Validation retry loop", () => {
  const docs: StoredDocument[] = [
    makeRootFieldDoc("getUser", "Query", "User"),
    makeTypeDoc("User"),
  ];

  it("valid operation on first try -> validationAttempts: 1", async () => {
    const llm = createDefaultLLM(
      "Query",
      "field-query-getUser",
      "```graphql\nquery { getUser { name } }\n```"
    );
    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 5,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get user",
    });

    expect(result.validationAttempts).toBe(1);
  });

  it("invalid then valid -> retries correctly", async () => {
    let callCount = 0;
    const llm = new MockLLMProvider(
      new Map([
        [/which root field.*most relevant\?/i, "Query"],
        [/Respond with ONLY the id/i, "field-query-getUser"],
        [
          /can you generate me a valid GraphQL operation/i,
          // First call returns invalid operation
          "```graphql\nquery { getUser { name }\n```", // missing closing brace
        ],
        [
          /has errors|Please fix/i,
          "```graphql\nquery { getUser { name } }\n```",
        ],
      ])
    );

    // Override complete to track the generation call and return invalid first
    const origComplete = llm.complete.bind(llm);
    llm.complete = async (messages, options) => {
      const userMsg = [...messages].reverse().find((m) => m.role === "user");
      if (
        userMsg?.content.includes("can you generate me a valid GraphQL operation")
      ) {
        callCount++;
        if (callCount === 1) {
          llm["_callHistory"].push({ messages, options });
          return "```graphql\nquery { getUser { name }\n```"; // invalid
        }
      }
      return origComplete(messages, options);
    };

    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: 5,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get user",
    });

    expect(result.validationAttempts).toBeGreaterThan(1);
  });

  it("always invalid -> returns after max retries", async () => {
    const maxRetries = 3;
    const llm = createDefaultLLM(
      "Query",
      "field-query-getUser",
      // Always returns invalid GraphQL (missing closing brace)
      "```graphql\nquery { getUser { name }\n```"
    );

    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: new MockVectorStore(docs),
      minSimilarityScore: 0,
      maxValidationRetries: maxRetries,
    });

    const result = await generator.generateDynamicOperation({
      inputVector: ZERO_VECTOR,
      inputText: "get user",
    });

    expect(result.validationAttempts).toBe(maxRetries);
  });
});

describe("Empty search results", () => {
  it('throws "No relevant root fields found" when vector store returns nothing', async () => {
    const llm = createDefaultLLM("Query", "", "");
    const emptyStore = new MockVectorStore([]);

    const generator = new DynamicOperationGenerator({
      llmProvider: llm,
      vectorStore: emptyStore,
      minSimilarityScore: 0,
    });

    await expect(
      generator.generateDynamicOperation({
        inputVector: ZERO_VECTOR,
        inputText: "anything",
      })
    ).rejects.toThrow("No relevant root fields found");
  });
});
