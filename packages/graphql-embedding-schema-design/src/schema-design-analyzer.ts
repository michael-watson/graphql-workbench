import type {
  VectorStore,
  LLMProvider,
  SearchResult,
  ChatMessage,
} from "graphql-embedding-core";
import { OllamaProvider } from "graphql-embedding-core";
import type { SchemaDesignAnalyzerOptions, SchemaDesignReport } from "./types.js";
import { BEST_PRACTICES_CONTENT } from "./best-practices.js";

const BEST_PRACTICE_CATEGORIES = [
  "Naming Conventions",
  "Query Design",
  "Mutation Design",
  "Schema Expressiveness and Documentation",
  "Anti-Patterns",
];

/**
 * Analyzes embedded GraphQL schema documents against best practices
 * and produces a markdown report of recommendations.
 */
export class SchemaDesignAnalyzer {
  private readonly vectorStore: VectorStore;
  private readonly llmProvider: LLMProvider;
  private readonly dimensions: number;
  private readonly maxDocuments: number;

  constructor(options: SchemaDesignAnalyzerOptions) {
    this.vectorStore = options.vectorStore;
    this.llmProvider =
      options.llmProvider ?? new OllamaProvider({ model: "qwen2.5" });
    this.dimensions = options.dimensions;
    this.maxDocuments = options.maxDocuments ?? 500;
  }

  /**
   * Analyze the embedded schema and return a best practices report.
   */
  async analyze(): Promise<SchemaDesignReport> {
    const zeroVector = new Array(this.dimensions).fill(0) as number[];

    // Step 1: Retrieve all schema documents by category
    const [typeResults, rootOperationResults, fieldResults] = await Promise.all([
      this.vectorStore.search(zeroVector, {
        limit: this.maxDocuments,
        columnFilters: [
          {
            column: "type",
            operator: "in",
            value: ["object", "interface", "union", "enum", "scalar", "input"],
          },
        ],
      }),
      this.vectorStore.search(zeroVector, {
        limit: this.maxDocuments,
        columnFilters: [
          {
            column: "type",
            operator: "in",
            value: ["query", "mutation", "subscription"],
          },
        ],
      }),
      this.vectorStore.search(zeroVector, {
        limit: this.maxDocuments,
        columnFilters: [{ column: "type", operator: "eq", value: "field" }],
      }),
    ]);

    // Step 2: Organize documents
    const queryFields = rootOperationResults.filter(
      (r) => r.document.type === "query"
    );
    const mutationFields = rootOperationResults.filter(
      (r) => r.document.type === "mutation"
    );
    const subscriptionFields = rootOperationResults.filter(
      (r) => r.document.type === "subscription"
    );

    const fieldsByParent = new Map<string, SearchResult[]>();
    for (const r of fieldResults) {
      const parent = r.document.metadata.parentType ?? "Unknown";
      const existing = fieldsByParent.get(parent) ?? [];
      existing.push(r);
      fieldsByParent.set(parent, existing);
    }

    const totalDocuments =
      typeResults.length + rootOperationResults.length + fieldResults.length;

    // Step 3: Build schema summary
    const schemaSummary = this.buildSchemaSummary(
      typeResults,
      queryFields,
      mutationFields,
      subscriptionFields,
      fieldsByParent
    );

    // Step 4: LLM call
    const systemMessage = `You are a GraphQL schema design expert. Analyze the provided GraphQL schema against the following best practices and produce a detailed markdown report.

For each applicable best practice category, provide:
- Whether the schema follows the practice
- Specific examples from the schema of good or problematic patterns
- Concrete recommendations for improvement

Best practice categories to evaluate:
- Naming Conventions
- Query Design
- Mutation Design
- Schema Expressiveness and Documentation
- Anti-Patterns

${BEST_PRACTICES_CONTENT}`;

    const userMessage = `Analyze this GraphQL schema:

${schemaSummary}

Provide your analysis as a markdown document with sections for each best practice category, specific findings, and actionable recommendations.`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ];

    const markdown = await this.llmProvider.complete(messages);

    // Step 5: Return report
    const categories = this.determineEvaluatedCategories(
      queryFields,
      mutationFields,
      subscriptionFields
    );

    return {
      markdown,
      documentCount: totalDocuments,
      categories,
    };
  }

  private buildSchemaSummary(
    typeResults: SearchResult[],
    queryFields: SearchResult[],
    mutationFields: SearchResult[],
    subscriptionFields: SearchResult[],
    fieldsByParent: Map<string, SearchResult[]>
  ): string {
    const sections: string[] = [];

    if (typeResults.length > 0) {
      sections.push("## Type Definitions");
      for (const r of typeResults) {
        sections.push(r.document.content);
      }
    }

    if (queryFields.length > 0) {
      sections.push("## Root Query Fields");
      for (const r of queryFields) {
        sections.push(r.document.content);
      }
    }

    if (mutationFields.length > 0) {
      sections.push("## Root Mutation Fields");
      for (const r of mutationFields) {
        sections.push(r.document.content);
      }
    }

    if (subscriptionFields.length > 0) {
      sections.push("## Root Subscription Fields");
      for (const r of subscriptionFields) {
        sections.push(r.document.content);
      }
    }

    if (fieldsByParent.size > 0) {
      sections.push("## Fields by Parent Type");
      for (const [parent, fields] of fieldsByParent) {
        sections.push(`### ${parent}`);
        for (const r of fields) {
          sections.push(r.document.content);
        }
      }
    }

    return sections.join("\n\n");
  }

  private determineEvaluatedCategories(
    queryFields: SearchResult[],
    mutationFields: SearchResult[],
    subscriptionFields: SearchResult[]
  ): string[] {
    const categories = ["Naming Conventions", "Schema Expressiveness and Documentation", "Anti-Patterns"];
    if (queryFields.length > 0) {
      categories.push("Query Design");
    }
    if (mutationFields.length > 0) {
      categories.push("Mutation Design");
    }
    return categories;
  }
}
