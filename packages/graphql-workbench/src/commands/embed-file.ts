import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";

export async function embedFileCommand(
  manager: EmbeddingManager,
  uri?: vscode.Uri
): Promise<void> {
  try {
    // Get the file URI
    let fileUri = uri;

    if (!fileUri) {
      // If no URI provided, try to get from active editor
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor && activeEditor.document.fileName.endsWith(".graphql")) {
        fileUri = activeEditor.document.uri;
      } else {
        // Prompt user to select a file
        const files = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: {
            "GraphQL Schema": ["graphql", "gql"],
          },
          title: "Select GraphQL Schema File",
        });

        if (!files || files.length === 0) {
          return;
        }
        fileUri = files[0];
      }
    }

    // Read the file content
    const fileContent = await vscode.workspace.fs.readFile(fileUri);
    const schemaSDL = Buffer.from(fileContent).toString("utf-8");

    if (!schemaSDL.trim()) {
      vscode.window.showErrorMessage("The selected file is empty.");
      return;
    }

    // Prompt for table name
    const tableName = await vscode.window.showInputBox({
      prompt: "Enter a name for the embeddings table",
      placeHolder: manager.getDefaultTableName(),
      value: manager.getDefaultTableName(),
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

    // Check if table has existing data
    const existingCount = await manager.getDocumentCount(effectiveTableName);
    if (existingCount > 0) {
      const clearChoice = await vscode.window.showQuickPick(
        [
          { label: "Yes", description: `Clear ${existingCount} existing documents before embedding`, picked: true },
          { label: "No", description: "Keep existing documents and add new ones" },
        ],
        {
          placeHolder: `Table "${effectiveTableName}" already contains ${existingCount} documents. Clear before embedding?`,
        }
      );

      if (clearChoice === undefined) {
        return; // User cancelled
      }

      if (clearChoice.label === "Yes") {
        await manager.clearEmbeddings();
      }
    }

    // Embed the schema
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Embedding GraphQL Schema",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Parsing and embedding schema..." });

        const result = await manager.embedSchema(schemaSDL, effectiveTableName);
        const storeInfo = manager.getStoreInfo();

        const durationSec = (result.durationMs / 1000).toFixed(1);
        let message = `Embedded ${result.embeddedCount} documents in ${durationSec}s into table "${effectiveTableName}".`;
        if (result.skippedCount > 0) {
          message += ` WARNING: ${result.skippedCount} documents skipped (exceeded token limit).`;
        }
        if (storeInfo?.type === "pglite") {
          message += ` Stored at: ${storeInfo.location}`;
        }

        if (result.skippedCount > 0) {
          vscode.window.showWarningMessage(message);
        } else {
          vscode.window.showInformationMessage(message);
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to embed schema: ${message}`);
  }
}
