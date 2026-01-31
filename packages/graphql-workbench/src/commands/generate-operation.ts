import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";

export async function generateOperationCommand(
  manager: EmbeddingManager
): Promise<void> {
  try {
    // Prompt for table name
    const currentTable = manager.getTableName();
    const tableName = await vscode.window.showInputBox({
      prompt: "Enter the embeddings table to query",
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

    // Prompt for natural language query
    const query = await vscode.window.showInputBox({
      prompt: "Describe the GraphQL operation you want to generate",
      placeHolder: "e.g., get all users with their posts",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Please enter a description";
        }
        return null;
      },
    });

    if (!query) {
      return;
    }

    // Generate the operation
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating GraphQL Operation",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: `Searching embedded schema in table "${effectiveTableName}"...` });

        const result = await manager.generateOperation(query, effectiveTableName);

        if (!result) {
          return;
        }

        progress.report({ message: "Creating document..." });

        // Build document content with operation and optional variables
        let documentContent = result.operation;

        // Add variables as a comment if present
        if (result.variables && Object.keys(result.variables).length > 0) {
          const variablesJson = JSON.stringify(result.variables, null, 2);
          documentContent += `\n\n# Example variables:\n# ${variablesJson.split("\n").join("\n# ")}`;
        }

        // Create a new untitled document with the generated operation
        const document = await vscode.workspace.openTextDocument({
          language: "graphql",
          content: documentContent,
        });

        await vscode.window.showTextDocument(document, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });

        // Build info message
        const parts: string[] = [];

        if (result.operationType) {
          parts.push(`Type: ${result.operationType}`);
        }
        if (result.rootField) {
          parts.push(`Field: ${result.rootField}`);
        }
        if (result.validationAttempts && result.validationAttempts > 1) {
          parts.push(`Validation attempts: ${result.validationAttempts}`);
        }

        vscode.window.showInformationMessage(
          `Generated operation. ${parts.join(", ")}`
        );
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to generate operation: ${message}`
    );
  }
}
