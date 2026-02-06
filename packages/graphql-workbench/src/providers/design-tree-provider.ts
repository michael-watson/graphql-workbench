import * as vscode from "vscode";
import * as path from "path";
import { DesignTreeItem } from "./design-tree-items";
import type { DesignManager, DesignEntry } from "../services/design-manager";

async function loadGraphQL() {
  const graphql = await import("graphql");
  return { parse: graphql.parse };
}

interface TypeEntry {
  name: string;
  line: number;
}

interface TypeGroup {
  name: string;
  entries: TypeEntry[];
}

export class DesignTreeProvider
  implements vscode.TreeDataProvider<DesignTreeItem>
{
  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<DesignTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private designManager: DesignManager) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DesignTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(
    element?: DesignTreeItem
  ): Promise<DesignTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    switch (element.itemType) {
      case "design-federated":
        return this.getFederatedChildren(element);
      case "subgraph":
        return this.getSubgraphChildren(element);
      case "design-standalone":
        return this.getStandaloneChildren(element);
      case "schema-file":
        return this.getSchemaTypeGroups(
          element.schemaFilePath || element.designPath,
          element.designPath
        );
      case "schema-type-group":
        return this.getTypeGroupEntries(element);
      default:
        return [];
    }
  }

  private getRootItems(): DesignTreeItem[] {
    const designs = this.designManager.getDesigns();
    return designs.map((design) => {
      if (design.type === "federated") {
        const dir = path.basename(path.dirname(design.configPath));
        return new DesignTreeItem(
          dir,
          "design-federated",
          vscode.TreeItemCollapsibleState.Expanded,
          design.configPath
        );
      } else {
        const fileName = path.basename(design.configPath);
        return new DesignTreeItem(
          fileName,
          "design-standalone",
          vscode.TreeItemCollapsibleState.Collapsed,
          design.configPath
        );
      }
    });
  }

  private getFederatedChildren(element: DesignTreeItem): DesignTreeItem[] {
    const design = this.designManager.getDesign(element.designPath);
    if (!design?.subgraphs) {
      return [];
    }

    const items: DesignTreeItem[] = [];

    // Add embedding status at the top
    items.push(this.createEmbeddingStatusItem(design, element.designPath));

    // Add federation version if available
    if (design.federationVersion) {
      items.push(
        new DesignTreeItem(
          `Federation ${design.federationVersion}`,
          "federation-version",
          vscode.TreeItemCollapsibleState.None,
          element.designPath,
          undefined, // subgraphName
          undefined, // schemaFilePath
          undefined, // groupName
          design.federationVersionLine // line
        )
      );
    }

    // Add supergraph and API schema viewers
    items.push(
      new DesignTreeItem(
        "Supergraph Schema",
        "supergraph-schema",
        vscode.TreeItemCollapsibleState.None,
        element.designPath
      )
    );
    items.push(
      new DesignTreeItem(
        "API Schema",
        "api-schema",
        vscode.TreeItemCollapsibleState.None,
        element.designPath
      )
    );

    // Add subgraphs
    for (const sub of design.subgraphs) {
      items.push(
        new DesignTreeItem(
          sub.name,
          "subgraph",
          vscode.TreeItemCollapsibleState.Collapsed,
          element.designPath,
          sub.name,
          sub.schemaPath
        )
      );
    }

    return items;
  }

  private async getStandaloneChildren(
    element: DesignTreeItem
  ): Promise<DesignTreeItem[]> {
    const design = this.designManager.getDesign(element.designPath);
    const items: DesignTreeItem[] = [];

    // Add embedding status at the top
    if (design) {
      items.push(this.createEmbeddingStatusItem(design, element.designPath));
    }

    // Add schema type groups
    const typeGroups = await this.getSchemaTypeGroups(
      element.designPath,
      element.designPath
    );
    items.push(...typeGroups);

    return items;
  }

  private createEmbeddingStatusItem(
    design: DesignEntry,
    designPath: string
  ): DesignTreeItem {
    const defaultTableName = this.designManager.getDefaultTableName(designPath);
    const tableName = design.embeddingTableName || defaultTableName;

    return new DesignTreeItem(
      "Embedding",
      "embedding-status",
      vscode.TreeItemCollapsibleState.None,
      designPath,
      undefined, // subgraphName
      undefined, // schemaFilePath
      undefined, // groupName
      undefined, // line
      tableName,
      design.isEmbedded ?? false
    );
  }

  private getSubgraphChildren(element: DesignTreeItem): DesignTreeItem[] {
    if (!element.schemaFilePath) {
      return [];
    }

    const fileName = path.basename(element.schemaFilePath);
    return [
      new DesignTreeItem(
        fileName,
        "schema-file",
        vscode.TreeItemCollapsibleState.Collapsed,
        element.designPath,
        element.subgraphName,
        element.schemaFilePath
      ),
    ];
  }

  private async getSchemaTypeGroups(
    filePath: string,
    designPath: string
  ): Promise<DesignTreeItem[]> {
    const groups = await this.parseSchemaTypes(filePath);
    return groups.map(
      (group) =>
        new DesignTreeItem(
          `${group.name} (${group.entries.length})`,
          "schema-type-group",
          vscode.TreeItemCollapsibleState.Collapsed,
          designPath,
          undefined,
          filePath,
          group.name
        )
    );
  }

  private async getTypeGroupEntries(
    element: DesignTreeItem
  ): Promise<DesignTreeItem[]> {
    const filePath = element.schemaFilePath || element.designPath;
    const groups = await this.parseSchemaTypes(filePath);
    const group = groups.find((g) =>
      element.label?.toString().startsWith(g.name)
    );

    if (!group) {
      return [];
    }

    return group.entries.map(
      (entry) =>
        new DesignTreeItem(
          entry.name,
          "schema-type-entry",
          vscode.TreeItemCollapsibleState.None,
          element.designPath,
          undefined,
          filePath,
          element.groupName,
          entry.line
        )
    );
  }

  private async parseSchemaTypes(filePath: string): Promise<TypeGroup[]> {
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString("utf-8");

      if (!text.trim()) {
        return [];
      }

      const { parse } = await loadGraphQL();
      const ast = parse(text);

      const groups = new Map<string, TypeEntry[]>();

      for (const def of ast.definitions) {
        const defLine = def.loc?.startToken?.line ?? 1;

        switch (def.kind) {
          case "ObjectTypeDefinition":
          case "ObjectTypeExtension": {
            const name = def.name.value;
            if (name === "Query") {
              const fields = def.fields?.map((f) => ({
                name: f.name.value,
                line: f.loc?.startToken?.line ?? defLine,
              })) || [];
              appendGroup(groups, "Queries", fields);
            } else if (name === "Mutation") {
              const fields = def.fields?.map((f) => ({
                name: f.name.value,
                line: f.loc?.startToken?.line ?? defLine,
              })) || [];
              appendGroup(groups, "Mutations", fields);
            } else if (name === "Subscription") {
              const fields = def.fields?.map((f) => ({
                name: f.name.value,
                line: f.loc?.startToken?.line ?? defLine,
              })) || [];
              appendGroup(groups, "Subscriptions", fields);
            } else {
              appendGroup(groups, "Types", [{ name, line: defLine }]);
            }
            break;
          }
          case "InterfaceTypeDefinition":
          case "InterfaceTypeExtension":
            appendGroup(groups, "Interfaces", [{ name: def.name.value, line: defLine }]);
            break;
          case "EnumTypeDefinition":
          case "EnumTypeExtension":
            appendGroup(groups, "Enums", [{ name: def.name.value, line: defLine }]);
            break;
          case "UnionTypeDefinition":
          case "UnionTypeExtension":
            appendGroup(groups, "Unions", [{ name: def.name.value, line: defLine }]);
            break;
          case "InputObjectTypeDefinition":
          case "InputObjectTypeExtension":
            appendGroup(groups, "Inputs", [{ name: def.name.value, line: defLine }]);
            break;
          case "ScalarTypeDefinition":
          case "ScalarTypeExtension":
            appendGroup(groups, "Scalars", [{ name: def.name.value, line: defLine }]);
            break;
        }
      }

      // Return in a consistent order, only non-empty groups
      const order = [
        "Queries",
        "Mutations",
        "Subscriptions",
        "Types",
        "Interfaces",
        "Enums",
        "Unions",
        "Inputs",
        "Scalars",
      ];
      const result: TypeGroup[] = [];
      for (const name of order) {
        const entries = groups.get(name);
        if (entries && entries.length > 0) {
          result.push({ name, entries });
        }
      }
      return result;
    } catch {
      return [];
    }
  }
}

function appendGroup(
  groups: Map<string, TypeEntry[]>,
  name: string,
  entries: TypeEntry[]
): void {
  const existing = groups.get(name) || [];
  existing.push(...entries);
  groups.set(name, existing);
}
