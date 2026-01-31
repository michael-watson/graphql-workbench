import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSchema } from "graphql-embedding-parser";
import type { StoredDocument, EmbeddingDocument } from "graphql-embedding-core";
import { DynamicOperationGenerator } from "../src/dynamic-generator.js";
import { MockLLMProvider } from "./fixtures/mock-llm.js";
import { MockVectorStore } from "./fixtures/mock-vector-store.js";

const GRAPHS_DIR = join(__dirname, "../../../graphs");

const EMBEDDING_DIMS = 16;
const ZERO_VECTOR = new Array(EMBEDDING_DIMS).fill(0) as number[];

function toStoredDocuments(docs: EmbeddingDocument[]): StoredDocument[] {
  return docs.map((doc) => ({
    ...doc,
    embedding: ZERO_VECTOR,
  }));
}

interface TestCase {
  schema: string;
  input: string;
  expectedType: "query" | "mutation";
  expectedField: string;
}

const TEST_CASES: TestCase[] = [
  {
    schema: "thespacedevs_ll2.graphql",
    input: "upcoming rocket launches",
    expectedType: "query",
    expectedField: "launchesUpcoming",
  },
  {
    schema: "thespacedevs_ll2.graphql",
    input: "list all space agencies",
    expectedType: "query",
    expectedField: "agencies",
  },
  {
    schema: "thespacedevs_ll2.graphql",
    input: "information about a specific astronaut",
    expectedType: "query",
    expectedField: "astronaut",
  },
  {
    schema: "thespacedevs_ll2.graphql",
    input: "SpaceX starship dashboard",
    expectedType: "query",
    expectedField: "starshipDashboard",
  },
  {
    schema: "thespacedevs_ll2.graphql",
    input: "docking events at the space station",
    expectedType: "query",
    expectedField: "dockingEvents",
  },
  {
    schema: "github.graphql",
    input: "create a new issue",
    expectedType: "mutation",
    expectedField: "createIssue",
  },
  {
    schema: "github.graphql",
    input: "search for repositories",
    expectedType: "query",
    expectedField: "search",
  },
  {
    schema: "github.graphql",
    input: "get user profile information",
    expectedType: "query",
    expectedField: "user",
  },
  {
    schema: "graphos_platform.graphql",
    input: "view my organization",
    expectedType: "query",
    expectedField: "organization",
  },
];

describe("Root field selection", () => {
  // Pre-parsed schemas: only root field docs + type docs needed for the generator
  const schemaDocSets = new Map<string, {
    rootFieldDocs: EmbeddingDocument[];
    allDocs: EmbeddingDocument[];
  }>();

  beforeAll(() => {
    const schemaFiles = [...new Set(TEST_CASES.map((tc) => tc.schema))];
    for (const file of schemaFiles) {
      const schema = readFileSync(join(GRAPHS_DIR, file), "utf-8");
      const allDocs = parseSchema(schema);
      const rootFieldDocs = allDocs.filter(
        (d) => d.metadata.isRootOperationField
      );
      schemaDocSets.set(file, { rootFieldDocs, allDocs });
    }
  });

  it.each(TEST_CASES)(
    '$schema: "$input" -> $expectedType.$expectedField',
    async ({ schema, input, expectedType, expectedField }) => {
      const { rootFieldDocs, allDocs } = schemaDocSets.get(schema)!;

      // Find the expected field document to get its ID
      // Filter by operation type too since some fields exist on both Query and Mutation
      const expectedOpType =
        expectedType === "query" ? "Query" : "Mutation";
      const expectedDoc = rootFieldDocs.find(
        (d) =>
          d.name === expectedField &&
          d.metadata.rootOperationType === expectedOpType
      );
      expect(expectedDoc).toBeDefined();

      // Load root field docs AND type/input/enum docs for type discovery (step 9)
      const typeDocs = allDocs.filter(
        (d) =>
          d.type === "object" ||
          d.type === "input" ||
          d.type === "enum" ||
          d.type === "interface" ||
          d.type === "union" ||
          d.type === "scalar"
      );
      const storedDocs = toStoredDocuments([...rootFieldDocs, ...typeDocs]);
      const vectorStore = new MockVectorStore(storedDocs);

      const operationKeyword = expectedType === "mutation" ? "mutation" : "query";

      const llm = new MockLLMProvider(
        new Map([
          // Step 5-6: determine operation type
          [/which root field.*most relevant\?/i, expectedOpType],
          // Step 8: select most relevant field
          [/Respond with ONLY the id/i, expectedDoc!.id],
          // Step 10: generate operation
          [
            /can you generate me a valid GraphQL operation/i,
            `\`\`\`graphql\n${operationKeyword} { ${expectedField} { __typename } }\n\`\`\``,
          ],
        ])
      );

      const generator = new DynamicOperationGenerator({
        llmProvider: llm,
        vectorStore,
        minSimilarityScore: 0,
        maxDocuments: 5000,
        maxValidationRetries: 1,
      });

      const result = await generator.generateDynamicOperation({
        inputVector: ZERO_VECTOR,
        inputText: input,
      });

      expect(result.operationType).toBe(expectedType);
      expect(result.rootField).toBe(expectedField);
    }
  );
});
