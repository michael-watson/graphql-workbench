import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";

export async function clearEmbeddingsCommand(
  manager: EmbeddingManager
): Promise<void> {
  try {
    // Confirm with user
    const confirm = await vscode.window.showWarningMessage(
      "Are you sure you want to clear all embeddings? This cannot be undone.",
      { modal: true },
      "Clear All"
    );

    if (confirm !== "Clear All") {
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Clearing Embeddings",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Removing all embeddings..." });

        await manager.clearEmbeddings();

        vscode.window.showInformationMessage(
          "All embeddings have been cleared."
        );
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to clear embeddings: ${message}`);
  }
}
