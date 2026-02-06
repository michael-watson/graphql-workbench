import * as vscode from "vscode";
import * as path from "path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { DesignManager } from "../services/design-manager";
import type { DesignTreeItem } from "../providers/design-tree-items";
import type { EmbeddingManager } from "../services/embedding-manager";
import {
  composeSupergraphSchema,
  composeApiSchema,
} from "../services/rover-validator";

export async function refreshDesignsCommand(
  designManager: DesignManager,
): Promise<void> {
  try {
    await designManager.discoverDesigns();
    vscode.window.showInformationMessage(
      `Found ${designManager.getDesigns().length} schema design(s).`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to refresh designs: ${message}`);
  }
}

export async function createDesignCommand(): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    const fileName = await vscode.window.showInputBox({
      prompt: "Enter schema file name",
      placeHolder: "schema.graphql",
      value: "schema.graphql",
      validateInput: (value) => {
        if (!value) {
          return "File name is required";
        }
        if (!value.endsWith(".graphql")) {
          return 'File name must end with ".graphql"';
        }
        return null;
      },
    });

    if (!fileName) {
      return;
    }

    const filePath = path.join(workspaceFolders[0].uri.fsPath, fileName);
    const uri = vscode.Uri.file(filePath);

    const scaffold = `type Query {
  hello: String!
}
`;

    await vscode.workspace.fs.writeFile(uri, Buffer.from(scaffold, "utf-8"));
    await vscode.window.showTextDocument(uri);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to create design: ${message}`);
  }
}

export async function createFederatedDesignCommand(): Promise<void> {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }

    const dirName = await vscode.window.showInputBox({
      prompt: "Enter directory name for the federated design",
      placeHolder: "supergraph",
      value: "supergraph",
    });

    if (!dirName) {
      return;
    }

    const dirPath = path.join(workspaceFolders[0].uri.fsPath, dirName);
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(dirPath));

    const subgraphSchemaPath = path.join(dirPath, "products.graphql");
    const subgraphContent = `type Query {
  products: [Product!]!
}

type Product @key(fields: "id") {
  id: ID!
  name: String!
}
`;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(subgraphSchemaPath),
      Buffer.from(subgraphContent, "utf-8"),
    );

    const yamlPath = path.join(dirPath, "supergraph.yaml");
    const yamlContent = `federation_version: 2
subgraphs:
  products:
    routing_url: http://localhost:4001/graphql
    schema:
      file: ./products.graphql
`;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(yamlPath),
      Buffer.from(yamlContent, "utf-8"),
    );

    await vscode.window.showTextDocument(vscode.Uri.file(yamlPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to create federated design: ${message}`,
    );
  }
}

export async function addSubgraphCommand(item: DesignTreeItem): Promise<void> {
  try {
    const name = await vscode.window.showInputBox({
      prompt: "Enter subgraph name",
      placeHolder: "reviews",
    });

    if (!name) {
      return;
    }

    const dir = path.dirname(item.designPath);
    const schemaFileName = `${name}.graphql`;
    const schemaPath = path.join(dir, schemaFileName);

    // Create the subgraph schema file
    const schemaContent = `type Query {
  _placeholder: String
}
`;
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(schemaPath),
      Buffer.from(schemaContent, "utf-8"),
    );

    // Append to supergraph.yaml
    const yamlUri = vscode.Uri.file(item.designPath);
    const yamlContent = await vscode.workspace.fs.readFile(yamlUri);
    const yamlText = Buffer.from(yamlContent).toString("utf-8");

    const newSubgraph = `  ${name}:
    routing_url: http://localhost:4001/graphql
    schema:
      file: ./${schemaFileName}
`;

    await vscode.workspace.fs.writeFile(
      yamlUri,
      Buffer.from(yamlText + newSubgraph, "utf-8"),
    );

    await vscode.window.showTextDocument(vscode.Uri.file(schemaPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to add subgraph: ${message}`);
  }
}

export async function openSchemaCommand(item: DesignTreeItem): Promise<void> {
  const filePath = item.schemaFilePath || item.designPath;
  await vscode.window.showTextDocument(vscode.Uri.file(filePath));
}

export async function validateDesignCommand(
  designManager: DesignManager,
  item: DesignTreeItem,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Validating schema design...",
        cancellable: false,
      },
      async () => {
        const result = await designManager.validateDesign(item.designPath);
        if (result.valid) {
          vscode.window.showInformationMessage("Schema validation passed.");
        } else {
          vscode.window.showWarningMessage(
            `Schema validation found ${result.errors.length} error(s). See the Problems panel.`,
          );
        }
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Validation failed: ${message}`);
  }
}

export async function deleteDesignCommand(
  designManager: DesignManager,
  item: DesignTreeItem,
): Promise<void> {
  const confirm = await vscode.window.showWarningMessage(
    `Delete design "${item.label}"? This will remove the file(s) from disk.`,
    { modal: true },
    "Delete",
  );

  if (confirm !== "Delete") {
    return;
  }

  try {
    const design = designManager.getDesign(item.designPath);
    if (design?.type === "federated") {
      // Delete the entire directory containing the supergraph.yaml
      const dir = path.dirname(item.designPath);
      await vscode.workspace.fs.delete(vscode.Uri.file(dir), {
        recursive: true,
      });
    } else {
      await vscode.workspace.fs.delete(vscode.Uri.file(item.designPath));
    }
    await designManager.discoverDesigns();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to delete design: ${message}`);
  }
}

export async function analyzeSchemaFromTreeCommand(
  embeddingManager: EmbeddingManager,
  item: DesignTreeItem,
): Promise<void> {
  try {
    const filePath = item.schemaFilePath || item.designPath;
    const uri = vscode.Uri.file(filePath);
    const fileContent = await vscode.workspace.fs.readFile(uri);
    const sdl = Buffer.from(fileContent).toString("utf-8");

    if (!sdl.trim()) {
      vscode.window.showErrorMessage("The schema file is empty.");
      return;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Analyzing Schema Design...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: "Embedding schema..." });
        await embeddingManager.embedSchema(sdl);

        progress.report({ message: "Running analysis..." });
        const result = await embeddingManager.analyzeSchemaDesign();

        progress.report({ message: "Opening report..." });
        const document = await vscode.workspace.openTextDocument({
          language: "markdown",
          content: result.markdown,
        });

        await vscode.window.showTextDocument(document, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });

        vscode.window.showInformationMessage(
          `Schema design analysis complete. ${result.documentCount} documents analyzed across ${result.categories.length} categories.`,
        );
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to analyze schema design: ${message}`,
    );
  }
}

export async function lintSchemaFromTreeCommand(
  diagnostics: vscode.DiagnosticCollection,
  item: DesignTreeItem,
): Promise<void> {
  const filePath = item.schemaFilePath || item.designPath;
  // Delegate to the existing lint command with the file URI
  await vscode.commands.executeCommand(
    "graphql-workbench.lintSchema",
    vscode.Uri.file(filePath),
  );
}

export async function renameSubgraphCommand(
  designManager: DesignManager,
  item: DesignTreeItem,
): Promise<void> {
  if (!item.subgraphName || !item.schemaFilePath) {
    return;
  }

  try {
    const newName = await vscode.window.showInputBox({
      prompt: "Enter new subgraph name",
      value: item.subgraphName,
      validateInput: (value) => {
        if (!value) {
          return "Name is required";
        }
        if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(value)) {
          return "Name must start with a letter or underscore and contain only letters, numbers, underscores, and hyphens";
        }
        return null;
      },
    });

    if (!newName || newName === item.subgraphName) {
      return;
    }

    const yamlUri = vscode.Uri.file(item.designPath);
    const yamlContent = await vscode.workspace.fs.readFile(yamlUri);
    const yamlText = Buffer.from(yamlContent).toString("utf-8");
    const config = parseYaml(yamlText);

    if (!config?.subgraphs?.[item.subgraphName]) {
      vscode.window.showErrorMessage(
        `Subgraph "${item.subgraphName}" not found in supergraph.yaml`,
      );
      return;
    }

    // Get the old subgraph config
    const oldSubgraphConfig = config.subgraphs[item.subgraphName];
    const oldSchemaFile = oldSubgraphConfig?.schema?.file;

    // Rename the key in the YAML
    delete config.subgraphs[item.subgraphName];
    config.subgraphs[newName] = oldSubgraphConfig;

    // Update schema file reference if it matches the old name pattern
    const dir = path.dirname(item.designPath);
    if (oldSchemaFile) {
      const oldFileName = path.basename(oldSchemaFile, ".graphql");
      if (oldFileName === item.subgraphName) {
        // Rename the schema file
        const newSchemaFileName = `${newName}.graphql`;
        config.subgraphs[newName].schema.file = `./${newSchemaFileName}`;

        const oldSchemaPath = path.join(
          dir,
          oldSchemaFile.replace(/^\.\//, ""),
        );
        const newSchemaPath = path.join(dir, newSchemaFileName);

        try {
          await vscode.workspace.fs.rename(
            vscode.Uri.file(oldSchemaPath),
            vscode.Uri.file(newSchemaPath),
          );
        } catch {
          // File rename failed, keep the old file reference
          config.subgraphs[newName].schema.file = oldSchemaFile;
        }
      }
    }

    // Write updated YAML
    const newYamlText = stringifyYaml(config);
    await vscode.workspace.fs.writeFile(
      yamlUri,
      Buffer.from(newYamlText, "utf-8"),
    );

    await designManager.discoverDesigns();
    vscode.window.showInformationMessage(`Renamed subgraph to "${newName}"`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to rename subgraph: ${message}`);
  }
}

export async function deleteSubgraphCommand(
  designManager: DesignManager,
  item: DesignTreeItem,
): Promise<void> {
  if (!item.subgraphName || !item.schemaFilePath) {
    return;
  }

  const confirm = await vscode.window.showWarningMessage(
    `Delete subgraph "${item.subgraphName}"? This will remove the entry from supergraph.yaml and optionally delete the schema file.`,
    { modal: true },
    "Delete Entry Only",
    "Delete Entry and File",
  );

  if (!confirm) {
    return;
  }

  try {
    const yamlUri = vscode.Uri.file(item.designPath);
    const yamlContent = await vscode.workspace.fs.readFile(yamlUri);
    const yamlText = Buffer.from(yamlContent).toString("utf-8");
    const config = parseYaml(yamlText);

    if (!config?.subgraphs?.[item.subgraphName]) {
      vscode.window.showErrorMessage(
        `Subgraph "${item.subgraphName}" not found in supergraph.yaml`,
      );
      return;
    }

    // Remove the subgraph from config
    delete config.subgraphs[item.subgraphName];

    // Write updated YAML
    const newYamlText = stringifyYaml(config);
    await vscode.workspace.fs.writeFile(
      yamlUri,
      Buffer.from(newYamlText, "utf-8"),
    );

    // Optionally delete the schema file
    if (confirm === "Delete Entry and File") {
      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(item.schemaFilePath));
      } catch {
        vscode.window.showWarningMessage(
          `Could not delete schema file: ${item.schemaFilePath}`,
        );
      }
    }

    await designManager.discoverDesigns();
    vscode.window.showInformationMessage(
      `Deleted subgraph "${item.subgraphName}"`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to delete subgraph: ${message}`);
  }
}

export async function viewSupergraphSchemaCommand(
  designPath: string,
): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Composing supergraph schema...",
        cancellable: false,
      },
      async () => {
        const result = await composeSupergraphSchema(designPath);

        if (!result.success || !result.schema) {
          vscode.window.showErrorMessage(
            `Failed to compose supergraph: ${result.error}`,
          );
          return;
        }

        const uri = vscode.Uri.parse("untitled:supergraph-schema.graphql");
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });

        await editor.edit((editBuilder) => {
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          );
          editBuilder.replace(fullRange, result.schema!);
        });
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(
      `Failed to view supergraph schema: ${message}`,
    );
  }
}

export async function viewApiSchemaCommand(designPath: string): Promise<void> {
  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Composing API schema...",
        cancellable: false,
      },
      async () => {
        const result = await composeApiSchema(designPath);

        if (!result.success || !result.schema) {
          vscode.window.showErrorMessage(
            `Failed to compose API schema: ${result.error}`,
          );
          return;
        }

        const uri = vscode.Uri.parse("untitled:api-schema.graphql");
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, {
          preview: true,
          viewColumn: vscode.ViewColumn.Beside,
        });

        await editor.edit((editBuilder) => {
          const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length),
          );
          editBuilder.replace(fullRange, result.schema!);
        });
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to view API schema: ${message}`);
  }
}

export async function embedDesignCommand(
  designManager: DesignManager,
  embeddingManager: EmbeddingManager,
  item: DesignTreeItem,
): Promise<void> {
  const design = designManager.getDesign(item.designPath);
  if (!design) {
    vscode.window.showErrorMessage("Design not found.");
    return;
  }

  // Get the default table name as a suggestion
  const defaultTableName = designManager.getDefaultTableName(item.designPath);
  const existingTableName = design.embeddingTableName;

  // Prompt user for table name
  const tableName = await vscode.window.showInputBox({
    prompt: "Enter the embeddings table name",
    placeHolder: defaultTableName,
    value: existingTableName || defaultTableName,
    validateInput: (value) => {
      if (!value || !value.trim()) {
        return "Table name is required";
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
        return "Table name must start with a letter or underscore and contain only letters, numbers, and underscores";
      }
      return null;
    },
  });

  if (tableName === undefined) {
    // User cancelled
    return;
  }

  try {
    // Check if the table already exists
    const existingTables = await embeddingManager.listTables();
    const tableExists = existingTables.includes(tableName);

    let action: "embed" | "use-existing" | "clear-and-embed" = "embed";

    if (tableExists) {
      // Table exists - ask user what to do
      const choice = await vscode.window.showQuickPick(
        [
          {
            label: "$(sync) Use Existing & Sync Changes",
            description: "Keep existing embeddings and sync any schema changes",
            action: "use-existing" as const,
          },
          {
            label: "$(trash) Clear & Re-embed",
            description: "Delete all existing embeddings and start fresh",
            action: "clear-and-embed" as const,
          },
          {
            label: "$(close) Cancel",
            description: "Do nothing",
            action: "cancel" as const,
          },
        ],
        {
          placeHolder: `Table "${tableName}" already exists. What would you like to do?`,
        },
      );

      if (!choice || choice.action === "cancel") {
        return;
      }
      action = choice.action;
    }

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Embedding schema...",
        cancellable: false,
      },
      async (progress) => {
        let schemaSDL: string;

        if (design.type === "federated") {
          // For federated designs, compose the API schema (without federation directives)
          progress.report({ message: "Composing API schema..." });
          const result = await composeApiSchema(item.designPath);
          if (!result.success || !result.schema) {
            throw new Error(result.error || "Failed to compose API schema");
          }
          schemaSDL = result.schema;
        } else {
          // For standalone designs, read the schema file directly
          const uri = vscode.Uri.file(item.designPath);
          const content = await vscode.workspace.fs.readFile(uri);
          schemaSDL = Buffer.from(content).toString("utf-8");
        }

        if (!schemaSDL.trim()) {
          throw new Error("Schema is empty");
        }

        if (action === "clear-and-embed") {
          progress.report({ message: "Clearing existing embeddings..." });
          await embeddingManager.clearEmbeddings(tableName);
          progress.report({ message: `Embedding to table: ${tableName}...` });
          const result = await embeddingManager.embedSchema(schemaSDL, tableName);
          vscode.window.showInformationMessage(
            `Cleared and re-embedded ${result.embeddedCount} documents to table "${tableName}" in ${result.durationMs}ms.`,
          );
        } else if (action === "use-existing") {
          progress.report({ message: "Syncing schema changes..." });
          const result = await embeddingManager.embedSchemaIncremental(
            schemaSDL,
            tableName,
          );
          if (result.added === 0 && result.deleted === 0) {
            vscode.window.showInformationMessage(
              `Schema is up to date. No changes needed (${result.unchanged} documents).`,
            );
          } else {
            vscode.window.showInformationMessage(
              `Synced embeddings: ${result.added} added, ${result.deleted} removed, ${result.unchanged} unchanged (${result.durationMs}ms).`,
            );
          }
        } else {
          progress.report({ message: `Embedding to table: ${tableName}...` });
          const result = await embeddingManager.embedSchema(schemaSDL, tableName);
          vscode.window.showInformationMessage(
            `Embedded ${result.embeddedCount} documents to table "${tableName}" in ${result.durationMs}ms.`,
          );
        }

        // Update the design's embedding status
        await designManager.setEmbeddingStatus(
          item.designPath,
          true,
          tableName,
        );
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to embed schema: ${message}`);
  }
}

export async function generateOperationForDesignCommand(
  designManager: DesignManager,
  embeddingManager: EmbeddingManager,
  extensionUri: vscode.Uri,
  item: DesignTreeItem,
): Promise<void> {
  const design = designManager.getDesign(item.designPath);
  if (!design) {
    vscode.window.showErrorMessage("Design not found.");
    return;
  }

  if (!design.isEmbedded) {
    const choice = await vscode.window.showWarningMessage(
      "This design has not been embedded yet. Would you like to embed it first?",
      "Embed Now",
      "Cancel",
    );

    if (choice === "Embed Now") {
      await embedDesignCommand(designManager, embeddingManager, item);
      // Check if embedding succeeded
      const updatedDesign = designManager.getDesign(item.designPath);
      if (!updatedDesign?.isEmbedded) {
        return;
      }
    } else {
      return;
    }
  }

  // Switch to the design's embedding table
  const tableName =
    design.embeddingTableName ||
    designManager.getDefaultTableName(item.designPath);

  // Import and call the generate operation command
  const { generateOperationCommand } = await import("./generate-operation.js");
  await generateOperationCommand(embeddingManager, extensionUri, tableName);
}

export async function clearDesignEmbeddingsCommand(
  designManager: DesignManager,
  embeddingManager: EmbeddingManager,
  item: DesignTreeItem,
): Promise<void> {
  const design = designManager.getDesign(item.designPath);
  if (!design) {
    vscode.window.showErrorMessage("Design not found.");
    return;
  }

  if (!design.isEmbedded) {
    vscode.window.showInformationMessage(
      "This design is not currently embedded.",
    );
    return;
  }

  const tableName =
    design.embeddingTableName ||
    designManager.getDefaultTableName(item.designPath);

  const confirm = await vscode.window.showWarningMessage(
    `Clear all embeddings from table "${tableName}"?`,
    { modal: true },
    "Clear",
  );

  if (confirm !== "Clear") {
    return;
  }

  try {
    await embeddingManager.clearEmbeddings(tableName);
    await designManager.clearEmbeddingStatus(item.designPath);
    vscode.window.showInformationMessage(
      `Cleared embeddings from table "${tableName}".`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to clear embeddings: ${message}`);
  }
}

export async function reEmbedDesignCommand(
  designManager: DesignManager,
  embeddingManager: EmbeddingManager,
  item: DesignTreeItem,
): Promise<void> {
  const design = designManager.getDesign(item.designPath);
  if (!design) {
    vscode.window.showErrorMessage("Design not found.");
    return;
  }

  // Get the existing or default table name
  const defaultTableName = designManager.getDefaultTableName(item.designPath);
  const existingTableName = design.embeddingTableName;
  const tableName = existingTableName || defaultTableName;

  const confirm = await vscode.window.showWarningMessage(
    `Re-embed schema? This will clear the existing embeddings in "${tableName}" and create new ones.`,
    { modal: true },
    "Re-embed",
  );

  if (confirm !== "Re-embed") {
    return;
  }

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Re-embedding schema...",
        cancellable: false,
      },
      async (progress) => {
        // Clear existing embeddings if any
        if (design.isEmbedded) {
          progress.report({ message: "Clearing existing embeddings..." });
          await embeddingManager.clearEmbeddings(tableName);
        }

        let schemaSDL: string;

        if (design.type === "federated") {
          progress.report({ message: "Composing API schema..." });
          const result = await composeApiSchema(item.designPath);
          if (!result.success || !result.schema) {
            throw new Error(result.error || "Failed to compose API schema");
          }
          schemaSDL = result.schema;
        } else {
          const uri = vscode.Uri.file(item.designPath);
          const content = await vscode.workspace.fs.readFile(uri);
          schemaSDL = Buffer.from(content).toString("utf-8");
        }

        if (!schemaSDL.trim()) {
          throw new Error("Schema is empty");
        }

        progress.report({ message: `Embedding to table: ${tableName}...` });
        const result = await embeddingManager.embedSchema(schemaSDL, tableName);

        await designManager.setEmbeddingStatus(
          item.designPath,
          true,
          tableName,
        );

        vscode.window.showInformationMessage(
          `Re-embedded ${result.embeddedCount} documents to table "${tableName}" in ${result.durationMs}ms.`,
        );
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`Failed to re-embed schema: ${message}`);
  }
}

/**
 * Command for clicking on embedding status row - prompts to embed if not embedded
 */
export async function embeddingStatusClickCommand(
  designManager: DesignManager,
  embeddingManager: EmbeddingManager,
  item: DesignTreeItem,
): Promise<void> {
  const design = designManager.getDesign(item.designPath);
  if (!design) {
    return;
  }

  if (!design.isEmbedded) {
    // Not embedded - trigger the embed command
    await embedDesignCommand(designManager, embeddingManager, item);
  }
  // If already embedded, clicking does nothing (use context menu for actions)
}
