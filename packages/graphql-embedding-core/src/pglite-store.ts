import type { PGlite } from "@electric-sql/pglite";
import type {
  VectorStore,
  StoredDocument,
  SearchResult,
  SearchOptions,
  MetadataFilter,
  ColumnFilter,
} from "./interfaces.js";

export interface PGLiteVectorStoreOptions {
  client: PGlite;
  tableName?: string;
  dimensions: number;
}

export class PGLiteVectorStore implements VectorStore {
  private readonly client: PGlite;
  private readonly tableName: string;
  private readonly dimensions: number;

  constructor(options: PGLiteVectorStoreOptions) {
    this.client = options.client;
    this.tableName = options.tableName ?? "graphql_embeddings";
    this.dimensions = options.dimensions;
  }

  private get metaTableName(): string {
    return `${this.tableName}_meta`;
  }

  async initialize(): Promise<void> {
    await this.client.exec(`
      CREATE EXTENSION IF NOT EXISTS vector;

      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        embedding vector(${this.dimensions}) NOT NULL
      );

      CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
      ON ${this.tableName}
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);

      CREATE TABLE IF NOT EXISTS ${this.metaTableName} (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  async store(documents: StoredDocument[]): Promise<void> {
    for (const doc of documents) {
      const embeddingStr = `[${doc.embedding.join(",")}]`;

      await this.client.query(
        `
        INSERT INTO ${this.tableName} (id, type, name, description, content, metadata, embedding)
        VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
        ON CONFLICT (id) DO UPDATE SET
          type = EXCLUDED.type,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          content = EXCLUDED.content,
          metadata = EXCLUDED.metadata,
          embedding = EXCLUDED.embedding
      `,
        [
          doc.id,
          doc.type,
          doc.name,
          doc.description,
          doc.content,
          JSON.stringify(doc.metadata),
          embeddingStr,
        ]
      );
    }
  }

  async search(embedding: number[], limitOrOptions?: number | SearchOptions): Promise<SearchResult[]> {
    const { limit, metadataFilters, columnFilters } = this.parseSearchOptions(limitOrOptions);
    const embeddingStr = `[${embedding.join(",")}]`;
    const params: unknown[] = [embeddingStr, limit];
    const whereClauses = this.buildWhereClauses(metadataFilters, columnFilters, params);
    const whereSQL = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const result = await this.client.query<{
      id: string;
      type: string;
      name: string;
      description: string | null;
      content: string;
      metadata: Record<string, unknown>;
      score: number;
    }>(
      `
      SELECT
        id, type, name, description, content, metadata,
        1 - (embedding <=> $1::vector) as score
      FROM ${this.tableName}
      ${whereSQL}
      ORDER BY embedding <=> $1::vector
      LIMIT $2
    `,
      params
    );

    return result.rows.map((row) => ({
      document: {
        id: row.id,
        type: row.type as StoredDocument["type"],
        name: row.name,
        description: row.description,
        content: row.content,
        metadata: row.metadata,
      },
      score: row.score,
    }));
  }

  private parseSearchOptions(limitOrOptions?: number | SearchOptions): {
    limit: number;
    metadataFilters: MetadataFilter[];
    columnFilters: ColumnFilter[];
  } {
    if (typeof limitOrOptions === "number" || limitOrOptions == null) {
      return { limit: limitOrOptions ?? 10, metadataFilters: [], columnFilters: [] };
    }
    return {
      limit: limitOrOptions.limit ?? 10,
      metadataFilters: limitOrOptions.metadataFilters ?? [],
      columnFilters: limitOrOptions.columnFilters ?? [],
    };
  }

  private static readonly SAFE_NAME = /^[a-zA-Z0-9_]+$/;

  private buildWhereClauses(
    metadataFilters: MetadataFilter[],
    columnFilters: ColumnFilter[],
    params: unknown[]
  ): string[] {
    const clauses: string[] = [];

    for (const f of metadataFilters) {
      if (!PGLiteVectorStore.SAFE_NAME.test(f.field)) {
        throw new Error(`Invalid metadata field name: ${f.field}`);
      }
      const accessor = `metadata->>'${f.field}'`;
      switch (f.operator) {
        case "eq": {
          params.push(String(f.value));
          clauses.push(`${accessor} = $${params.length}`);
          break;
        }
        case "neq": {
          params.push(String(f.value));
          clauses.push(`${accessor} != $${params.length}`);
          break;
        }
        case "in": {
          const values = f.value as string[];
          const placeholders = values.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          clauses.push(`${accessor} IN (${placeholders.join(", ")})`);
          break;
        }
        case "exists": {
          clauses.push(`metadata ? '${f.field}'`);
          break;
        }
      }
    }

    for (const f of columnFilters) {
      if (!PGLiteVectorStore.SAFE_NAME.test(f.column)) {
        throw new Error(`Invalid column name: ${f.column}`);
      }
      switch (f.operator) {
        case "eq": {
          params.push(f.value as string);
          clauses.push(`${f.column} = $${params.length}`);
          break;
        }
        case "in": {
          const values = f.value as string[];
          const placeholders = values.map((v) => {
            params.push(v);
            return `$${params.length}`;
          });
          clauses.push(`${f.column} IN (${placeholders.join(", ")})`);
          break;
        }
      }
    }

    return clauses;
  }

  async delete(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await this.client.query(
      `DELETE FROM ${this.tableName} WHERE id IN (${placeholders})`,
      ids
    );
  }

  async clear(): Promise<void> {
    await this.client.exec(`TRUNCATE TABLE ${this.tableName}`);
    await this.client.exec(`DELETE FROM ${this.metaTableName} WHERE key = 'schema_sdl'`);
  }

  async count(): Promise<number> {
    const result = await this.client.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${this.tableName}`
    );
    return parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async storeSchemaSDL(sdl: string): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.metaTableName} (key, value) VALUES ('schema_sdl', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [sdl]
    );
  }

  async getSchemaSDL(): Promise<string | null> {
    const result = await this.client.query<{ value: string }>(
      `SELECT value FROM ${this.metaTableName} WHERE key = 'schema_sdl'`
    );
    return result.rows[0]?.value ?? null;
  }

  async listTables(): Promise<string[]> {
    const result = await this.client.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM information_schema.columns
       WHERE column_name = 'embedding' AND table_schema = 'public'
       ORDER BY table_name`
    );
    return result.rows.map((row) => row.table_name);
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}
