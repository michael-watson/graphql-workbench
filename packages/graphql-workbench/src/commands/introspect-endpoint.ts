import * as vscode from "vscode";
import type { IntrospectionQuery } from "graphql";

async function loadGraphQL() {
  const graphql = await import("graphql");
  return {
    getIntrospectionQuery: graphql.getIntrospectionQuery,
    buildClientSchema: graphql.buildClientSchema,
    printSchema: graphql.printSchema,
  };
}

export async function introspectEndpointCommand(): Promise<void> {
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

    if (addHeaders === undefined) {
      return;
    }

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

      if (headerInput === undefined) {
        return;
      }

      if (headerInput) {
        headers = { ...headers, ...JSON.parse(headerInput) };
      }
    }

    // Introspect and save
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Introspecting endpoint...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Running introspection query..." });

        const { getIntrospectionQuery, buildClientSchema, printSchema } =
          await loadGraphQL();

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

        const schema = buildClientSchema(result.data);
        const sdl = printSchema(schema);

        // Prompt for save location
        const saveUri = await vscode.window.showSaveDialog({
          filters: { "GraphQL Schema": ["graphql"] },
          defaultUri: vscode.Uri.file("schema.graphql"),
        });

        if (!saveUri) {
          return;
        }

        await vscode.workspace.fs.writeFile(
          saveUri,
          Buffer.from(sdl, "utf-8")
        );

        // Open the saved file
        const doc = await vscode.workspace.openTextDocument(saveUri);
        await vscode.window.showTextDocument(doc);

        vscode.window.showInformationMessage(
          `Schema saved to ${saveUri.fsPath}`
        );
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to introspect endpoint: ${message}`
    );
  }
}
