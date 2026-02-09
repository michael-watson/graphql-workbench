import * as vscode from "vscode";
import type { DesignManager } from "../services/design-manager";
import type { EntityStore } from "../services/entity-store";
import type { EntityInfo } from "../services/entity-extractor";

/**
 * Provides completion items for entity references in federated subgraph schemas.
 *
 * When editing a .graphql file that belongs to a federated design, suggests
 * entity extension stubs from other subgraphs so users can reference them
 * without manually looking up key fields.
 */
export class FederationCompletionProvider
  implements vscode.CompletionItemProvider
{
  constructor(
    private designManager: DesignManager,
    private entityStore: EntityStore,
  ) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionItem[] | undefined> {
    // Only trigger at the start of a line (not mid-type)
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);
    if (textBeforeCursor.trim().length > 0) {
      return undefined;
    }

    // Find which federated design and subgraph this file belongs to
    const filePath = document.uri.fsPath;
    const match = this.findDesignAndSubgraph(filePath);
    if (!match) {
      return undefined;
    }

    const { designId, subgraphName } = match;

    // Get entities from other subgraphs
    let entities: EntityInfo[];
    try {
      entities = await this.entityStore.getEntitiesExcludingSubgraph(
        designId,
        subgraphName,
      );
    } catch {
      return undefined;
    }

    if (entities.length === 0) {
      return undefined;
    }

    // Deduplicate: one completion per unique (typeName, keyFields) pair
    const deduped = this.deduplicateEntities(entities);

    // Filter out entities already referenced in the current document
    const docText = document.getText();
    const filtered = this.filterAlreadyReferenced(deduped, docText);

    if (filtered.length === 0) {
      return undefined;
    }

    // Build completion items
    return filtered.map((entity) => this.buildCompletionItem(entity));
  }

  private findDesignAndSubgraph(
    filePath: string,
  ): { designId: string; subgraphName: string } | undefined {
    for (const design of this.designManager.getDesigns()) {
      if (design.type !== "federated" || !design.subgraphs) {
        continue;
      }

      for (const sub of design.subgraphs) {
        if (sub.schemaPath === filePath) {
          return {
            designId: design.configPath,
            subgraphName: sub.name,
          };
        }
      }
    }

    return undefined;
  }

  /**
   * Deduplicate entities so there is one entry per unique (typeName, keyFields).
   * Multiple subgraphs may define the same entity with the same key.
   */
  private deduplicateEntities(entities: EntityInfo[]): EntityInfo[] {
    const seen = new Map<string, EntityInfo>();
    for (const entity of entities) {
      const key = `${entity.typeName}\0${entity.keyFields}`;
      if (!seen.has(key)) {
        seen.set(key, entity);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Filter out entities whose (typeName, keyFields) already appear in the document.
   * Only matches exact key fields — having the same type name with a different
   * @key does NOT filter out this entity.
   */
  private filterAlreadyReferenced(
    entities: EntityInfo[],
    docText: string,
  ): EntityInfo[] {
    // Collect (typeName, keyFields) pairs already in the document
    // Matches: type Foo @key(fields: "bar") or extend type Foo @key(fields: "bar")
    const existingKeys = new Set<string>();
    const typeKeyPattern =
      /(?:extend\s+)?type\s+(\w+)[^{]*@key\s*\(\s*fields\s*:\s*"([^"]+)"\s*\)/g;
    let match;
    while ((match = typeKeyPattern.exec(docText)) !== null) {
      existingKeys.add(`${match[1]}\0${match[2]}`);
    }

    return entities.filter((entity) => {
      const key = `${entity.typeName}\0${entity.keyFields}`;
      return !existingKeys.has(key);
    });
  }

  private buildCompletionItem(entity: EntityInfo): vscode.CompletionItem {
    const item = new vscode.CompletionItem(
      entity.typeName,
      vscode.CompletionItemKind.Struct,
    );

    item.detail = `Entity reference — @key(fields: "${entity.keyFields}")`;

    // Build only the key fields for the stub
    const keyFieldNames = entity.keyFields
      .split(/\s+/)
      .filter((f) => f.length > 0);
    const keyFieldLines = keyFieldNames
      .map((fieldName) => {
        const field = entity.fields.find((f) => f.name === fieldName);
        const fieldType = field ? field.type : "ID!";
        return `  ${fieldName}: ${fieldType}`;
      })
      .join("\n");

    // Snippet: type stub with @key and only the key fields + cursor
    item.insertText = new vscode.SnippetString(
      `type ${entity.typeName} @key(fields: "${entity.keyFields}") {\n${keyFieldLines}\n  $0\n}`,
    );

    // Documentation: show the key fields that will be inserted
    const markdown = new vscode.MarkdownString();
    markdown.appendText(`Entity reference\n\n`);
    markdown.appendCodeblock(
      `type ${entity.typeName} @key(fields: "${entity.keyFields}") {\n${keyFieldLines}\n}`,
      "graphql",
    );

    item.documentation = markdown;

    // Sort entities alphabetically; use key fields as tiebreaker
    item.sortText = `0_entity_${entity.typeName}_${entity.keyFields}`;

    return item;
  }
}
