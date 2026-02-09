import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";
import {
  openExplorerPanelCommand,
  sendToExplorerPanel,
} from "./open-explorer-panel";

export async function generateOperationCommand(
  manager: EmbeddingManager,
  extensionUri: vscode.Uri,
  preselectedTableName?: string
): Promise<void> {
  try {
    let effectiveTableName: string;
    let isRemoteTable = false;

    if (preselectedTableName) {
      // Use the preselected table name directly (always local — design workbench path)
      effectiveTableName = preselectedTableName;
    } else {
      // Fetch available tables from local and remote stores in parallel
      let localTables: string[] = [];
      let remoteTables: string[] = [];
      try {
        [localTables, remoteTables] = await Promise.all([
          manager.listTables().catch(() => [] as string[]),
          manager.listRemoteTables().catch(() => [] as string[]),
        ]);
      } catch {
        // If both fail, fall through to manual entry
      }

      const hasAnyTables = localTables.length > 0 || remoteTables.length > 0;

      if (hasAnyTables) {
        const ENTER_CUSTOM = "Enter table name manually…";
        const items: vscode.QuickPickItem[] = [
          ...localTables.map((t) => ({ label: t, description: "Local" })),
          ...remoteTables.map((t) => ({ label: t, description: "Remote (read-only)" })),
          { label: ENTER_CUSTOM },
        ];

        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: "Select an embedding table to query",
        });

        if (!picked) {
          return; // User cancelled
        }

        if (picked.label === ENTER_CUSTOM) {
          const custom = await vscode.window.showInputBox({
            prompt: "Enter the embeddings table name",
            placeHolder: manager.getDefaultTableName(),
            value: manager.getDefaultTableName(),
            validateInput: (value) => {
              if (!value) {
                return null;
              }
              if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
                return "Table name must start with a letter or underscore and contain only letters, numbers, and underscores";
              }
              return null;
            },
          });
          if (custom === undefined) {
            return;
          }
          effectiveTableName = custom || manager.getDefaultTableName();
        } else {
          effectiveTableName = picked.label;
          isRemoteTable = picked.description === "Remote (read-only)";
        }
      } else {
        const tableName = await vscode.window.showInputBox({
          prompt: "Enter the embeddings table to query",
          placeHolder: manager.getDefaultTableName(),
          value: manager.getDefaultTableName(),
          validateInput: (value) => {
            if (!value) {
              return null;
            }
            if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
              return "Table name must start with a letter or underscore and contain only letters, numbers, and underscores";
            }
            return null;
          },
        });
        if (tableName === undefined) {
          return;
        }
        effectiveTableName = tableName || manager.getDefaultTableName();
      }
    }

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

        const result = await manager.generateOperation(
          query,
          effectiveTableName,
          isRemoteTable ? { useRemoteStore: true } : undefined
        );

        if (!result) {
          return;
        }

        progress.report({ message: "Opening Explorer panel..." });

        // Prepend the prompt as a comment
        const operationWithComment = `# Prompt: ${query}\n${result.operation}`;

        // Open/reveal the Explorer panel and send the operation to it
        openExplorerPanelCommand(manager, extensionUri);
        sendToExplorerPanel({
          type: "setGeneratedOperation",
          tableName: effectiveTableName,
          operation: operationWithComment,
          variables: result.variables ?? {},
          prompt: query,
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
