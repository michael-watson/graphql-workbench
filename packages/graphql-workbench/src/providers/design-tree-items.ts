import * as vscode from "vscode";

export type DesignItemType =
  | "design-federated"
  | "design-standalone"
  | "subgraph"
  | "schema-file"
  | "schema-type-group"
  | "schema-type-entry"
  | "supergraph-schema"
  | "api-schema"
  | "embedding-status"
  | "federation-version";

export class DesignTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly itemType: DesignItemType,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly designPath: string,
    public readonly subgraphName?: string,
    public readonly schemaFilePath?: string,
    public readonly groupName?: string,
    public readonly line?: number,
    public readonly embeddingTableName?: string,
    public readonly isEmbedded?: boolean
  ) {
    super(label, collapsibleState);
    this.contextValue = itemType;

    switch (itemType) {
      case "design-federated":
        this.iconPath = new vscode.ThemeIcon("server-process");
        this.tooltip = `Federated design: ${designPath}`;
        break;
      case "design-standalone":
        this.iconPath = new vscode.ThemeIcon("file-code");
        this.tooltip = `Standalone schema: ${designPath}`;
        this.resourceUri = vscode.Uri.file(designPath);
        break;
      case "subgraph":
        this.iconPath = new vscode.ThemeIcon("package");
        this.tooltip = `Subgraph: ${subgraphName}`;
        break;
      case "schema-file":
        this.iconPath = new vscode.ThemeIcon("symbol-file");
        this.tooltip = schemaFilePath;
        this.resourceUri = schemaFilePath
          ? vscode.Uri.file(schemaFilePath)
          : undefined;
        this.command = schemaFilePath
          ? {
              command: "vscode.open",
              title: "Open Schema",
              arguments: [vscode.Uri.file(schemaFilePath)],
            }
          : undefined;
        break;
      case "schema-type-group":
        this.iconPath = new vscode.ThemeIcon("symbol-class");
        break;
      case "schema-type-entry":
        this.iconPath = getTypeEntryIcon(groupName);
        this.collapsibleState = vscode.TreeItemCollapsibleState.None;
        // Add click-to-navigate command
        if (schemaFilePath && line !== undefined) {
          this.command = {
            command: "graphql-workbench.goToLine",
            title: "Go to Definition",
            arguments: [schemaFilePath, line],
          };
        }
        break;
      case "supergraph-schema":
        this.iconPath = new vscode.ThemeIcon("combine");
        this.tooltip = "View composed supergraph schema (with federation directives)";
        this.command = {
          command: "graphql-workbench.viewSupergraphSchema",
          title: "View Supergraph Schema",
          arguments: [designPath],
        };
        break;
      case "api-schema":
        this.iconPath = new vscode.ThemeIcon("globe");
        this.tooltip = "View API schema (client-facing, without federation directives)";
        this.command = {
          command: "graphql-workbench.viewApiSchema",
          title: "View API Schema",
          arguments: [designPath],
        };
        break;
      case "embedding-status":
        if (isEmbedded) {
          this.iconPath = new vscode.ThemeIcon("database", new vscode.ThemeColor("charts.green"));
          this.tooltip = `Embedded in table: ${embeddingTableName}. Right-click for options.`;
          this.description = embeddingTableName;
        } else {
          this.iconPath = new vscode.ThemeIcon("circle-outline");
          this.tooltip = "Click to embed schema";
          this.description = "not embedded";
          // Add click-to-embed command when not embedded
          this.command = {
            command: "graphql-workbench.embeddingStatusClick",
            title: "Embed Schema",
            arguments: [this],
          };
        }
        break;
      case "federation-version":
        this.iconPath = new vscode.ThemeIcon("versions");
        this.tooltip = "Click to go to federation version in supergraph.yaml";
        // line parameter holds the federation version line number
        if (line !== undefined) {
          this.command = {
            command: "graphql-workbench.goToLine",
            title: "Go to Federation Version",
            arguments: [designPath, line],
          };
        }
        break;
    }
  }
}

function getTypeEntryIcon(
  groupName?: string
): vscode.ThemeIcon {
  switch (groupName) {
    case "Queries":
      return new vscode.ThemeIcon("search");
    case "Mutations":
      return new vscode.ThemeIcon("edit");
    case "Subscriptions":
      return new vscode.ThemeIcon("radio-tower");
    case "Types":
      return new vscode.ThemeIcon("symbol-class");
    case "Interfaces":
      return new vscode.ThemeIcon("symbol-interface");
    case "Enums":
      return new vscode.ThemeIcon("symbol-enum");
    case "Unions":
      return new vscode.ThemeIcon("symbol-misc");
    case "Inputs":
      return new vscode.ThemeIcon("symbol-field");
    case "Scalars":
      return new vscode.ThemeIcon("symbol-constant");
    default:
      return new vscode.ThemeIcon("symbol-variable");
  }
}
