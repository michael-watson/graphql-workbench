import type { EntityInfo, EntityField } from "./entity-extractor";

/**
 * PGLite-backed storage for federation entity data.
 * Uses a plain SQL table (no pgvector needed) to store extracted entity
 * information from composed supergraph schemas, scoped per design.
 *
 * Note: PGLite's `exec()` is for raw DDL without parameters.
 * All parameterized queries must use `query()`.
 */
export class EntityStore {
  private pglite: any;
  private initialized = false;

  constructor(pgliteInstance: unknown) {
    this.pglite = pgliteInstance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Drop and recreate to start fresh each session
    await this.pglite.exec(`
      DROP TABLE IF EXISTS federation_entities;
      CREATE TABLE federation_entities (
        id SERIAL PRIMARY KEY,
        design_id TEXT NOT NULL,
        type_name TEXT NOT NULL,
        key_fields TEXT NOT NULL,
        subgraph_name TEXT NOT NULL,
        fields_json TEXT NOT NULL
      );
      CREATE INDEX idx_fed_entities_design ON federation_entities(design_id);
    `);

    this.initialized = true;
  }

  /**
   * Replace all entity data for a design (DELETE + INSERT).
   */
  async replaceEntities(
    designId: string,
    entities: EntityInfo[],
  ): Promise<void> {
    await this.pglite.query(
      `DELETE FROM federation_entities WHERE design_id = $1`,
      [designId],
    );

    for (const entity of entities) {
      await this.pglite.query(
        `INSERT INTO federation_entities (design_id, type_name, key_fields, subgraph_name, fields_json)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          designId,
          entity.typeName,
          entity.keyFields,
          entity.subgraphName,
          JSON.stringify(entity.fields),
        ],
      );
    }
  }

  /**
   * Get all entities for a design.
   */
  async getEntitiesForDesign(designId: string): Promise<EntityInfo[]> {
    const result = await this.pglite.query(
      `SELECT type_name, key_fields, subgraph_name, fields_json
       FROM federation_entities
       WHERE design_id = $1`,
      [designId],
    );

    return this.rowsToEntities(result.rows);
  }

  /**
   * Get entities for a design, excluding those owned by a specific subgraph.
   */
  async getEntitiesExcludingSubgraph(
    designId: string,
    subgraphName: string,
  ): Promise<EntityInfo[]> {
    const result = await this.pglite.query(
      `SELECT type_name, key_fields, subgraph_name, fields_json
       FROM federation_entities
       WHERE design_id = $1 AND subgraph_name != $2`,
      [designId, subgraphName],
    );

    return this.rowsToEntities(result.rows);
  }

  /**
   * Clear all entity data for a design.
   */
  async clearDesign(designId: string): Promise<void> {
    await this.pglite.query(
      `DELETE FROM federation_entities WHERE design_id = $1`,
      [designId],
    );
  }

  /**
   * Clear all entity data.
   */
  async clearAll(): Promise<void> {
    await this.pglite.exec(`DELETE FROM federation_entities`);
  }

  private rowsToEntities(
    rows: Array<{
      type_name: string;
      key_fields: string;
      subgraph_name: string;
      fields_json: string;
    }>,
  ): EntityInfo[] {
    return rows.map((row) => ({
      typeName: row.type_name,
      keyFields: row.key_fields,
      subgraphName: row.subgraph_name,
      fields: JSON.parse(row.fields_json) as EntityField[],
    }));
  }
}
