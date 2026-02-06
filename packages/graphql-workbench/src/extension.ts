import * as vscode from "vscode";
import { EmbeddingManager } from "./services/embedding-manager";
import { DesignManager } from "./services/design-manager";
import { DesignTreeProvider } from "./providers/design-tree-provider";
import { embedFileCommand } from "./commands/embed-file";
import { embedEndpointCommand } from "./commands/embed-endpoint";
import { generateOperationCommand } from "./commands/generate-operation";
import { clearEmbeddingsCommand } from "./commands/clear-embeddings";
import { introspectEndpointCommand } from "./commands/introspect-endpoint";
import {
  lintSchemaCommand,
  LintCodeActionProvider,
} from "./commands/lint-schema";
import { analyzeSchemaDesignCommand } from "./commands/analyze-schema-design";
import { openExplorerPanelCommand } from "./commands/open-explorer-panel";
import {
  refreshDesignsCommand,
  createDesignCommand,
  createFederatedDesignCommand,
  addSubgraphCommand,
  openSchemaCommand,
  validateDesignCommand,
  deleteDesignCommand,
  analyzeSchemaFromTreeCommand,
  lintSchemaFromTreeCommand,
  renameSubgraphCommand,
  deleteSubgraphCommand,
  viewSupergraphSchemaCommand,
  viewApiSchemaCommand,
  embedDesignCommand,
  generateOperationForDesignCommand,
  clearDesignEmbeddingsCommand,
  reEmbedDesignCommand,
  embeddingStatusClickCommand,
} from "./commands/design-workbench-commands";
import type { DesignTreeItem } from "./providers/design-tree-items";

let embeddingManager: EmbeddingManager | undefined;
let designManager: DesignManager | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  console.log("GraphQL Workbench extension is activating");

  outputChannel = vscode.window.createOutputChannel("GraphQL Workbench");
  context.subscriptions.push(outputChannel);

  embeddingManager = new EmbeddingManager(context, outputChannel);

  // --- Existing commands ---

  const embedFile = vscode.commands.registerCommand(
    "graphql-workbench.embedFile",
    async (uri?: vscode.Uri) => {
      await embedFileCommand(embeddingManager!, uri);
    }
  );

  const embedEndpoint = vscode.commands.registerCommand(
    "graphql-workbench.embedEndpoint",
    async () => {
      await embedEndpointCommand(embeddingManager!);
    }
  );

  const generateOperation = vscode.commands.registerCommand(
    "graphql-workbench.generateOperation",
    async () => {
      await generateOperationCommand(embeddingManager!, context.extensionUri);
    }
  );

  const clearEmbeddings = vscode.commands.registerCommand(
    "graphql-workbench.clearEmbeddings",
    async () => {
      await clearEmbeddingsCommand(embeddingManager!);
    }
  );

  const introspectEndpoint = vscode.commands.registerCommand(
    "graphql-workbench.introspectEndpoint",
    async () => {
      await introspectEndpointCommand();
    }
  );

  const lintDiagnostics = vscode.languages.createDiagnosticCollection(
    "graphql-workbench-lint"
  );

  const lintSchema = vscode.commands.registerCommand(
    "graphql-workbench.lintSchema",
    async (uri?: vscode.Uri) => {
      await lintSchemaCommand(lintDiagnostics, uri);
    }
  );

  const analyzeSchemaDesign = vscode.commands.registerCommand(
    "graphql-workbench.analyzeSchemaDesign",
    async () => {
      await analyzeSchemaDesignCommand(embeddingManager!);
    }
  );

  const openExplorerPanel = vscode.commands.registerCommand(
    "graphql-workbench.openExplorerPanel",
    () => {
      openExplorerPanelCommand(embeddingManager!, context.extensionUri);
    }
  );

  const dismissLintViolation = vscode.commands.registerCommand(
    "graphql-workbench.dismissLintViolation",
    (uri: vscode.Uri, diagnostic: vscode.Diagnostic) => {
      const current = lintDiagnostics.get(uri);
      if (current) {
        const updated = current.filter(
          (d) =>
            !(
              d.range.isEqual(diagnostic.range) &&
              d.message === diagnostic.message
            )
        );
        lintDiagnostics.set(uri, updated);
      }
    }
  );

  const dismissAllLintViolations = vscode.commands.registerCommand(
    "graphql-workbench.dismissAllLintViolations",
    (uri: vscode.Uri) => {
      lintDiagnostics.delete(uri);
    }
  );

  const lintCodeActions = vscode.languages.registerCodeActionsProvider(
    [
      { language: "graphql" },
      { pattern: "**/*.graphql" },
      { pattern: "**/*.gql" },
    ],
    new LintCodeActionProvider(lintDiagnostics),
    {
      providedCodeActionKinds: LintCodeActionProvider.providedCodeActionKinds,
    }
  );

  context.subscriptions.push(
    embedFile,
    embedEndpoint,
    generateOperation,
    clearEmbeddings,
    introspectEndpoint,
    lintDiagnostics,
    lintSchema,
    analyzeSchemaDesign,
    openExplorerPanel,
    dismissLintViolation,
    dismissAllLintViolations,
    lintCodeActions
  );

  // --- Schema Design Workbench ---

  const designDiagnostics = vscode.languages.createDiagnosticCollection(
    "graphql-workbench-design"
  );
  context.subscriptions.push(designDiagnostics);

  designManager = new DesignManager(outputChannel, designDiagnostics, context);

  const treeProvider = new DesignTreeProvider(designManager);
  const treeView = vscode.window.createTreeView(
    "schema-design-workbench.designs",
    {
      treeDataProvider: treeProvider,
      showCollapseAll: true,
    }
  );
  context.subscriptions.push(treeView);

  designManager.onDidChangeDesigns(() => treeProvider.refresh());

  // Design workbench commands
  const refreshDesigns = vscode.commands.registerCommand(
    "graphql-workbench.refreshDesigns",
    async () => {
      await refreshDesignsCommand(designManager!);
    }
  );

  const createDesign = vscode.commands.registerCommand(
    "graphql-workbench.createDesign",
    async () => {
      await createDesignCommand();
    }
  );

  const createFederatedDesign = vscode.commands.registerCommand(
    "graphql-workbench.createFederatedDesign",
    async () => {
      await createFederatedDesignCommand();
    }
  );

  const addSubgraph = vscode.commands.registerCommand(
    "graphql-workbench.addSubgraph",
    async (item: DesignTreeItem) => {
      await addSubgraphCommand(item);
    }
  );

  const openSchema = vscode.commands.registerCommand(
    "graphql-workbench.openSchema",
    async (item: DesignTreeItem) => {
      await openSchemaCommand(item);
    }
  );

  const validateDesign = vscode.commands.registerCommand(
    "graphql-workbench.validateDesign",
    async (item: DesignTreeItem) => {
      await validateDesignCommand(designManager!, item);
    }
  );

  const deleteDesign = vscode.commands.registerCommand(
    "graphql-workbench.deleteDesign",
    async (item: DesignTreeItem) => {
      await deleteDesignCommand(designManager!, item);
    }
  );

  const analyzeSchemaFromTree = vscode.commands.registerCommand(
    "graphql-workbench.analyzeSchemaFromTree",
    async (item: DesignTreeItem) => {
      await analyzeSchemaFromTreeCommand(embeddingManager!, item);
    }
  );

  const lintSchemaFromTree = vscode.commands.registerCommand(
    "graphql-workbench.lintSchemaFromTree",
    async (item: DesignTreeItem) => {
      await lintSchemaFromTreeCommand(lintDiagnostics, item);
    }
  );

  const goToLine = vscode.commands.registerCommand(
    "graphql-workbench.goToLine",
    async (filePath: string, line: number) => {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      const position = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
    }
  );

  const renameSubgraph = vscode.commands.registerCommand(
    "graphql-workbench.renameSubgraph",
    async (item: DesignTreeItem) => {
      await renameSubgraphCommand(designManager!, item);
    }
  );

  const deleteSubgraph = vscode.commands.registerCommand(
    "graphql-workbench.deleteSubgraph",
    async (item: DesignTreeItem) => {
      await deleteSubgraphCommand(designManager!, item);
    }
  );

  const viewSupergraphSchema = vscode.commands.registerCommand(
    "graphql-workbench.viewSupergraphSchema",
    async (designPath: string) => {
      await viewSupergraphSchemaCommand(designPath);
    }
  );

  const viewApiSchema = vscode.commands.registerCommand(
    "graphql-workbench.viewApiSchema",
    async (designPath: string) => {
      await viewApiSchemaCommand(designPath);
    }
  );

  const embedDesign = vscode.commands.registerCommand(
    "graphql-workbench.embedDesign",
    async (item: DesignTreeItem) => {
      await embedDesignCommand(designManager!, embeddingManager!, item);
    }
  );

  const generateOperationForDesign = vscode.commands.registerCommand(
    "graphql-workbench.generateOperationForDesign",
    async (item: DesignTreeItem) => {
      await generateOperationForDesignCommand(
        designManager!,
        embeddingManager!,
        context.extensionUri,
        item
      );
    }
  );

  const clearDesignEmbeddings = vscode.commands.registerCommand(
    "graphql-workbench.clearDesignEmbeddings",
    async (item: DesignTreeItem) => {
      await clearDesignEmbeddingsCommand(designManager!, embeddingManager!, item);
    }
  );

  const reEmbedDesign = vscode.commands.registerCommand(
    "graphql-workbench.reEmbedDesign",
    async (item: DesignTreeItem) => {
      await reEmbedDesignCommand(designManager!, embeddingManager!, item);
    }
  );

  const embeddingStatusClick = vscode.commands.registerCommand(
    "graphql-workbench.embeddingStatusClick",
    async (item: DesignTreeItem) => {
      await embeddingStatusClickCommand(designManager!, embeddingManager!, item);
    }
  );

  context.subscriptions.push(
    refreshDesigns,
    createDesign,
    createFederatedDesign,
    addSubgraph,
    openSchema,
    validateDesign,
    deleteDesign,
    analyzeSchemaFromTree,
    lintSchemaFromTree,
    goToLine,
    renameSubgraph,
    deleteSubgraph,
    viewSupergraphSchema,
    viewApiSchema,
    embedDesign,
    generateOperationForDesign,
    clearDesignEmbeddings,
    reEmbedDesign,
    embeddingStatusClick
  );

  // Validate on save
  const onSaveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
    const config = vscode.workspace.getConfiguration("graphqlWorkbench");
    if (!config.get<boolean>("validateOnSave", true)) {
      return;
    }

    const fileName = doc.fileName;
    if (fileName.endsWith(".graphql") || fileName.endsWith("supergraph.yaml")) {
      designManager?.handleFileSaved(doc.uri);
    }
  });
  context.subscriptions.push(onSaveListener);

  // Auto re-embed when embedded designs change
  // Clear embeddings when an embedded design is deleted
  const onClearEmbeddingsListener = designManager.onShouldClearEmbeddings(
    async ({ configPath, tableName }) => {
      outputChannel?.appendLine(
        `[DesignManager] Clearing embeddings for deleted design: ${configPath}`
      );
      try {
        await embeddingManager!.clearEmbeddings(tableName);
        outputChannel?.appendLine(
          `[DesignManager] Cleared embeddings from table: ${tableName}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        outputChannel?.appendLine(
          `[DesignManager] Failed to clear embeddings: ${message}`
        );
      }
    }
  );
  context.subscriptions.push(onClearEmbeddingsListener);

  const onReEmbedListener = designManager.onShouldReEmbed(async (design) => {
    if (!design.isEmbedded || !design.embeddingTableName) {
      return;
    }

    outputChannel?.appendLine(
      `[DesignManager] Auto re-embedding design (incremental): ${design.configPath}`
    );

    try {
      let schemaSDL: string;

      if (design.type === "federated") {
        // For federated designs, compose the API schema
        const { composeApiSchema } = await import(
          "./services/rover-validator.js"
        );
        const result = await composeApiSchema(design.configPath);
        if (!result.success || !result.schema) {
          outputChannel?.appendLine(
            `[DesignManager] Failed to compose API schema for re-embed: ${result.error}`
          );
          return;
        }
        schemaSDL = result.schema;
      } else {
        // For standalone designs, read the schema file
        const uri = vscode.Uri.file(design.configPath);
        const content = await vscode.workspace.fs.readFile(uri);
        schemaSDL = Buffer.from(content).toString("utf-8");
      }

      if (!schemaSDL.trim()) {
        return;
      }

      // Use incremental embedding to only update changed documents
      const result = await embeddingManager!.embedSchemaIncremental(
        schemaSDL,
        design.embeddingTableName
      );
      outputChannel?.appendLine(
        `[DesignManager] Incremental re-embed complete: ${result.added} added, ${result.deleted} deleted, ${result.unchanged} unchanged (${result.durationMs}ms)`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      outputChannel?.appendLine(
        `[DesignManager] Auto re-embed failed: ${message}`
      );
    }
  });
  context.subscriptions.push(onReEmbedListener);

  // React to setting changes
  const onConfigChange = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("graphqlWorkbench.enableDesignWorkbench")) {
      const enabled = vscode.workspace
        .getConfiguration("graphqlWorkbench")
        .get<boolean>("enableDesignWorkbench", true);
      if (enabled) {
        designManager?.startWatching();
        designManager?.discoverDesigns();
      }
    }
    if (e.affectsConfiguration("graphqlWorkbench.roverPath")) {
      // Reset rover availability cache when path changes
      import("./services/rover-validator.js").then((mod) =>
        mod.resetRoverCache()
      );
    }
  });
  context.subscriptions.push(onConfigChange);

  // Cleanup
  context.subscriptions.push({
    dispose: async () => {
      if (embeddingManager) {
        await embeddingManager.dispose();
      }
      if (designManager) {
        designManager.dispose();
      }
    },
  });

  // Start design workbench
  const config = vscode.workspace.getConfiguration("graphqlWorkbench");
  if (config.get<boolean>("enableDesignWorkbench", true)) {
    designManager.startWatching();
    designManager.discoverDesigns().then(async () => {
      // Try to restore embedding state from existing tables
      // This helps recover state after VS Code restarts
      try {
        const existingTables = await embeddingManager!.listTables();
        if (existingTables.length > 0) {
          await designManager!.restoreEmbeddingStateFromTables(existingTables);
        }
      } catch {
        // Ignore errors - embedding manager may not be initialized yet
      }
    });
  }

  console.log("GraphQL Workbench extension activated");
}

export async function deactivate(): Promise<void> {
  if (embeddingManager) {
    await embeddingManager.dispose();
    embeddingManager = undefined;
  }
  if (designManager) {
    designManager.dispose();
    designManager = undefined;
  }
}
