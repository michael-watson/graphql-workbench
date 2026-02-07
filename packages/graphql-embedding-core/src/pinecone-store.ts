import type {
  VectorStore,
  StoredDocument,
  SearchResult,
  SearchOptions,
  MetadataFilter,
  ColumnFilter,
} from "./interfaces.js";

export interface PineconeVectorStoreOptions {
  apiKey: string;
  indexHost: string;
  namespace?: string;
  dimensions: number;
}

const BATCH_SIZE = 100;
const SCHEMA_SDL_ID = "__schema_sdl__";
const NEAR_ZERO = 1e-7;

// Metadata fields that must be promoted to top-level Pinecone metadata
// so they can be used in Pinecone filters. All other metadata fields
// remain serialized in the metadata_json string.
const PROMOTED_METADATA_FIELDS = [
  "parentType",
  "fieldType",
  "isRootOperationField",
  "rootOperationType",
  "kind",
  "chunkIndex",
  "totalChunks",
] as const;

export class PineconeVectorStore implements VectorStore {
  private readonly apiKey: string;
  private readonly indexHost: string;
  private readonly namespace: string;
  private readonly dimensions: number;

  constructor(options: PineconeVectorStoreOptions) {
    this.apiKey = options.apiKey;
    let host = options.indexHost.replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(host)) {
      host = `https://${host}`;
    }
    this.indexHost = host;
    this.namespace = options.namespace ?? "graphql_embeddings";
    this.dimensions = options.dimensions;
  }

  private get headers(): Record<string, string> {
    return {
      "Api-Key": this.apiKey,
      "X-Pinecone-Api-Version": "2025-10",
    };
  }

  private async postRequest<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.indexHost}${path}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Pinecone request failed (POST ${url}): ${detail}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Pinecone API error (${response.status} POST ${path}): ${text}`,
      );
    }
    return (await response.json()) as T;
  }

  private async getRequest<T>(
    path: string,
    params?: Record<string, string[]>,
  ): Promise<T> {
    const parsed = new URL(`${this.indexHost}${path}`);
    if (params) {
      for (const [key, values] of Object.entries(params)) {
        for (const v of values) {
          parsed.searchParams.append(key, v);
        }
      }
    }
    const url = parsed.toString();
    let response: Response;
    try {
      response = await fetch(url, {
        method: "GET",
        headers: this.headers,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Pinecone request failed (GET ${url}): ${detail}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Pinecone API error (${response.status} GET ${path}): ${text}`,
      );
    }
    return (await response.json()) as T;
  }

  async initialize(): Promise<void> {
    // Verify connectivity by describing index stats
    await this.postRequest<unknown>("/describe_index_stats", {});
  }

  private buildVectorMetadata(doc: StoredDocument): Record<string, unknown> {
    const meta: Record<string, unknown> = {
      type: doc.type,
      name: doc.name,
      description: doc.description ?? "",
      content: doc.content,
      metadata_json: JSON.stringify(doc.metadata),
    };
    // Promote commonly-filtered metadata fields to top-level so Pinecone can filter on them
    if (doc.metadata) {
      for (const field of PROMOTED_METADATA_FIELDS) {
        const value = (doc.metadata as Record<string, unknown>)[field];
        if (value !== undefined && value !== null) {
          meta[field] = value;
        }
      }
    }
    return meta;
  }

  async store(documents: StoredDocument[]): Promise<void> {
    // Batch upsert in chunks
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);
      const vectors = batch.map((doc) => ({
        id: doc.id,
        values: doc.embedding,
        metadata: this.buildVectorMetadata(doc),
      }));

      await this.postRequest("/vectors/upsert", {
        vectors,
        namespace: this.namespace,
      });
    }
  }

  async search(
    embedding: number[],
    limitOrOptions?: number | SearchOptions,
  ): Promise<SearchResult[]> {
    const { limit, metadataFilters, columnFilters } =
      this.parseSearchOptions(limitOrOptions);

    const filter = this.buildFilter(metadataFilters, columnFilters);

    // Pinecone rejects all-zero vectors; replace with near-zero if needed
    // (the DynamicOperationGenerator uses zero vectors for exact metadata lookups)
    const isZeroVector = embedding.every((v) => v === 0);
    const queryVector = isZeroVector
      ? embedding.map(() => NEAR_ZERO)
      : embedding;

    const body: Record<string, unknown> = {
      vector: queryVector,
      namespace: this.namespace,
      topK: limit,
      includeMetadata: true,
      includeValues: false,
    };
    if (filter) {
      body["filter"] = filter;
    }

    const result = await this.postRequest<{
      matches?: Array<{
        id: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    }>("/query", body);

    return (result.matches ?? [])
      .filter((m) => m.id !== SCHEMA_SDL_ID)
      .map((match) => {
        const meta = match.metadata;
        return {
          document: {
            id: match.id,
            type: (meta?.["type"] as StoredDocument["type"]) ?? "object",
            name: (meta?.["name"] as string) ?? "",
            description: (meta?.["description"] as string) || null,
            content: (meta?.["content"] as string) ?? "",
            metadata: meta?.["metadata_json"]
              ? JSON.parse(meta["metadata_json"] as string)
              : {},
          },
          score: match.score,
        };
      });
  }

  private parseSearchOptions(limitOrOptions?: number | SearchOptions): {
    limit: number;
    metadataFilters: MetadataFilter[];
    columnFilters: ColumnFilter[];
  } {
    if (typeof limitOrOptions === "number" || limitOrOptions == null) {
      return {
        limit: limitOrOptions ?? 10,
        metadataFilters: [],
        columnFilters: [],
      };
    }
    return {
      limit: limitOrOptions.limit ?? 10,
      metadataFilters: limitOrOptions.metadataFilters ?? [],
      columnFilters: limitOrOptions.columnFilters ?? [],
    };
  }

  private buildFilter(
    metadataFilters: MetadataFilter[],
    columnFilters: ColumnFilter[],
  ): Record<string, unknown> | undefined {
    const conditions: Record<string, unknown>[] = [];

    for (const f of metadataFilters) {
      // Metadata fields are stored inside metadata_json, but type/name/description/content
      // are top-level Pinecone metadata fields. For metadata sub-fields, we can't filter
      // directly since they're serialized as JSON. We'll handle the common top-level fields.
      switch (f.operator) {
        case "eq":
          conditions.push({ [f.field]: { $eq: f.value } });
          break;
        case "neq":
          conditions.push({ [f.field]: { $ne: f.value } });
          break;
        case "in":
          conditions.push({ [f.field]: { $in: f.value } });
          break;
        case "exists":
          // Pinecone doesn't have a direct $exists operator;
          // use $ne with empty string as a proxy for top-level metadata fields
          conditions.push({ [f.field]: { $ne: "" } });
          break;
      }
    }

    for (const f of columnFilters) {
      // In Pinecone, "columns" like name/type are stored as top-level metadata
      switch (f.operator) {
        case "eq":
          conditions.push({ [f.column]: { $eq: f.value } });
          break;
        case "in":
          conditions.push({ [f.column]: { $in: f.value } });
          break;
      }
    }

    if (conditions.length === 0) {
      return undefined;
    }
    if (conditions.length === 1) {
      return conditions[0];
    }
    return { $and: conditions };
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    await this.postRequest("/vectors/delete", {
      ids,
      namespace: this.namespace,
    });
  }

  async clear(): Promise<void> {
    await this.postRequest("/vectors/delete", {
      deleteAll: true,
      namespace: this.namespace,
    });
  }

  async count(): Promise<number> {
    const result = await this.postRequest<{
      namespaces?: Record<string, { vectorCount?: number }>;
    }>("/describe_index_stats", {});

    const ns = result.namespaces?.[this.namespace];
    const count = ns?.vectorCount ?? 0;
    // Subtract 1 if the sentinel SDL record exists
    if (count > 0) {
      const sdlCheck = await this.getRequest<{
        vectors?: Record<string, unknown>;
      }>("/vectors/fetch", {
        ids: [SCHEMA_SDL_ID],
        namespace: [this.namespace],
      });
      if (sdlCheck.vectors && sdlCheck.vectors[SCHEMA_SDL_ID]) {
        return count - 1;
      }
    }
    return count;
  }

  async listTables(): Promise<string[]> {
    const result = await this.postRequest<{
      namespaces?: Record<string, { vectorCount?: number }>;
    }>("/describe_index_stats", {});

    return Object.entries(result.namespaces ?? {})
      .filter(([, info]) => (info.vectorCount ?? 0) > 0)
      .map(([name]) => name);
  }

  async storeSchemaSDL(sdl: string): Promise<void> {
    // Store SDL as metadata on a near-zero sentinel record
    // (Pinecone rejects all-zero vectors)
    const zeroVector = new Array(this.dimensions).fill(1e-7);
    await this.postRequest("/vectors/upsert", {
      vectors: [
        {
          id: SCHEMA_SDL_ID,
          values: zeroVector,
          metadata: {
            type: "__meta__",
            name: "__schema_sdl__",
            description: "",
            content: "",
            metadata_json: "",
            schema_sdl: sdl,
          },
        },
      ],
      namespace: this.namespace,
    });
  }

  async getSchemaSDL(): Promise<string | null> {
    const result = await this.getRequest<{
      vectors?: Record<string, { metadata?: Record<string, unknown> }>;
    }>("/vectors/fetch", {
      ids: [SCHEMA_SDL_ID],
      namespace: [this.namespace],
    });

    const record = result.vectors?.[SCHEMA_SDL_ID];
    if (record?.metadata?.["schema_sdl"]) {
      return record.metadata["schema_sdl"] as string;
    }
    return null;
  }

  async close(): Promise<void> {
    // No-op: REST-based, no persistent connection
  }
}
