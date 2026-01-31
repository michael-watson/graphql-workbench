import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";
import type { IntrospectionQuery } from "graphql";

async function loadGraphQL() {
  const graphql = await import("graphql");
  return {
    getIntrospectionQuery: graphql.getIntrospectionQuery,
    buildClientSchema: graphql.buildClientSchema,
    printSchema: graphql.printSchema,
  };
}

export async function embedEndpointCommand(
  manager: EmbeddingManager
): Promise<void> {
  try {
    // Prompt for endpoint URL
    const endpoint = await vscode.window.showInputBox({
      prompt: "Enter the GraphQL endpoint URL",
      placeHolder: "https://api.example.com/graphql",
      validateInput: (value) => {
        if (!value) {
          return "Endpoint URL is required";
        }
        try {
          new URL(value);
          return null;
        } catch {
          return "Please enter a valid URL";
        }
      },
    });

    if (!endpoint) {
      return;
    }

    // Optionally prompt for headers
    const addHeaders = await vscode.window.showQuickPick(["No", "Yes"], {
      placeHolder: "Do you need to add authorization headers?",
    });

    let headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (addHeaders === "Yes") {
      const headerInput = await vscode.window.showInputBox({
        prompt: "Enter headers as JSON",
        placeHolder: '{"Authorization": "Bearer token"}',
        validateInput: (value) => {
          if (!value) {
            return null;
          }
          try {
            JSON.parse(value);
            return null;
          } catch {
            return "Please enter valid JSON";
          }
        },
      });

      if (headerInput) {
        headers = { ...headers, ...JSON.parse(headerInput) };
      }
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

    // Introspect and embed
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Embedding GraphQL Schema from Endpoint",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Introspecting endpoint..." });

        const { getIntrospectionQuery, buildClientSchema, printSchema } = await loadGraphQL();

        // Run introspection query
        const introspectionQuery = getIntrospectionQuery();
        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({ query: introspectionQuery }),
        });

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: ${response.statusText}`
          );
        }

        const result = (await response.json()) as {
          data?: IntrospectionQuery;
          errors?: Array<{ message: string }>;
        };

        if (result.errors && result.errors.length > 0) {
          throw new Error(
            `GraphQL errors: ${result.errors.map((e) => e.message).join(", ")}`
          );
        }

        if (!result.data) {
          throw new Error("No data returned from introspection query");
        }

        progress.report({ message: "Building schema..." });

        // Build schema from introspection result
        const schema = buildClientSchema(result.data);
        const schemaSDL = printSchema(schema);

        progress.report({ message: "Embedding schema..." });

        const embedResult = await manager.embedSchema(schemaSDL, effectiveTableName);
        const storeInfo = manager.getStoreInfo();

        const durationSec = (embedResult.durationMs / 1000).toFixed(1);
        let message = `Embedded ${embedResult.embeddedCount} documents in ${durationSec}s from ${endpoint} into table "${effectiveTableName}"`;
        if (embedResult.skippedCount > 0) {
          message += `. WARNING: ${embedResult.skippedCount} documents skipped (exceeded token limit)`;
        }
        if (storeInfo?.type === "pglite") {
          message += `. Stored at: ${storeInfo.location}`;
        }

        if (embedResult.skippedCount > 0) {
          vscode.window.showWarningMessage(message);
        } else {
          vscode.window.showInformationMessage(message);
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to embed schema from endpoint: ${message}`
    );
  }
}
