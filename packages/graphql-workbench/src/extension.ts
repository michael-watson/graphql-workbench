import * as vscode from "vscode";
import { EmbeddingManager } from "./services/embedding-manager";
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

let embeddingManager: EmbeddingManager | undefined;
let outputChannel: vscode.OutputChannel | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  console.log("GraphQL Workbench extension is activating");

  outputChannel = vscode.window.createOutputChannel("GraphQL Workbench");
  context.subscriptions.push(outputChannel);

  embeddingManager = new EmbeddingManager(context, outputChannel);

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

  context.subscriptions.push({
    dispose: async () => {
      if (embeddingManager) {
        await embeddingManager.dispose();
      }
    },
  });

  console.log("GraphQL Workbench extension activated");
}

export async function deactivate(): Promise<void> {
  if (embeddingManager) {
    await embeddingManager.dispose();
    embeddingManager = undefined;
  }
}
