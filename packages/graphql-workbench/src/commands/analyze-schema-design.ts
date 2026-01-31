import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";

export async function analyzeSchemaDesignCommand(
  manager: EmbeddingManager
): Promise<void> {
  try {
    // Prompt for table name
    const currentTable = manager.getTableName();
    const tableName = await vscode.window.showInputBox({
      prompt: "Enter the embeddings table to analyze",
      placeHolder: manager.getDefaultTableName(),
      value: currentTable,
      validateInput: (value) => {
        if (!value) {
          return null; // Allow empty to use default
        }
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
          return "Table name must start with a letter or underscore and contain only letters, numbers, and underscores";
        }
        return null;
      },
    });

    if (tableName === undefined) {
      return; // User cancelled
    }

    const effectiveTableName = tableName || manager.getDefaultTableName();

    // Analyze schema design
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing Schema Design...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: `Analyzing table "${effectiveTableName}"...` });

        const result = await manager.analyzeSchemaDesign(effectiveTableName);

        progress.report({ message: "Opening report..." });

        // Open the markdown report in a new editor tab
        const document = await vscode.workspace.openTextDocument({
          language: "markdown",
          content: result.markdown,
        });

        await vscode.window.showTextDocument(document, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });

        vscode.window.showInformationMessage(
          `Schema design analysis complete. ${result.documentCount} documents analyzed across ${result.categories.length} categories: ${result.categories.join(", ")}`
        );
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to analyze schema design: ${message}`
    );
  }
}
