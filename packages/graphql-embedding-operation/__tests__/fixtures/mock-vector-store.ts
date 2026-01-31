import type {
  VectorStore,
  StoredDocument,
  SearchResult,
  SearchOptions,
  MetadataFilter,
  ColumnFilter,
} from "graphql-embedding-core";

/**
 * In-memory mock vector store for testing.
 * Stores documents and returns them with synthetic descending scores.
 * Supports metadataFilters and columnFilters for in-memory filtering.
 */
export class MockVectorStore implements VectorStore {
  private documents: StoredDocument[] = [];

  constructor(documents?: StoredDocument[]) {
    if (documents) {
      this.documents = [...documents];
    }
  }

  async initialize(): Promise<void> {}

  async store(documents: StoredDocument[]): Promise<void> {
    this.documents.push(...documents);
  }

  async search(
    _embedding: number[],
    limitOrOptions?: number | SearchOptions
  ): Promise<SearchResult[]> {
    let limit = 50;
    let metadataFilters: MetadataFilter[] = [];
    let columnFilters: ColumnFilter[] = [];

    if (typeof limitOrOptions === "number") {
      limit = limitOrOptions;
    } else if (limitOrOptions) {
      limit = limitOrOptions.limit ?? 50;
      metadataFilters = limitOrOptions.metadataFilters ?? [];
      columnFilters = limitOrOptions.columnFilters ?? [];
    }

    let filtered = [...this.documents];

    // Apply metadata filters
    for (const filter of metadataFilters) {
      filtered = filtered.filter((doc) => {
        const metadata = doc.metadata as Record<string, unknown>;
        const value = metadata[filter.field];

        switch (filter.operator) {
          case "eq":
            return value === filter.value;
          case "neq":
            return value !== filter.value;
          case "in":
            if (Array.isArray(filter.value)) {
              return filter.value.includes(value as string);
            }
            return false;
          case "exists":
            return value !== undefined && value !== null;
          default:
            return true;
        }
      });
    }

    // Apply column filters
    for (const filter of columnFilters) {
      filtered = filtered.filter((doc) => {
        const value = doc[filter.column];
        switch (filter.operator) {
          case "eq":
            return value === filter.value;
          case "in":
            if (Array.isArray(filter.value)) {
              return filter.value.includes(value as string);
            }
            return false;
          default:
            return true;
        }
      });
    }

    // Return with synthetic descending scores (always > 0)
    const sliced = filtered.slice(0, limit);
    const count = Math.max(sliced.length, 1);
    const results: SearchResult[] = sliced.map((doc, index) => ({
      document: {
        id: doc.id,
        type: doc.type,
        name: doc.name,
        description: doc.description,
        content: doc.content,
        metadata: doc.metadata,
      },
      score: 1.0 - (index / count) * 0.5,
    }));

    return results;
  }

  async delete(ids: string[]): Promise<void> {
    this.documents = this.documents.filter((d) => !ids.includes(d.id));
  }

  async clear(): Promise<void> {
    this.documents = [];
  }

  async close(): Promise<void> {}

  async count(): Promise<number> {
    return this.documents.length;
  }
}
