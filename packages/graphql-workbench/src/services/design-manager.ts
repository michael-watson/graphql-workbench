import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { parse as parseYaml } from "yaml";

import {
  validateStandaloneSchema,
  type ValidationError,
  type ValidationResult,
} from "./schema-validator";
import { validateFederatedSchema } from "./rover-validator";

export interface SubgraphEntry {
  name: string;
  schemaPath: string;
  routingUrl?: string;
}

export interface DesignEntry {
  type: "federated" | "standalone";
  configPath: string;
  subgraphs?: SubgraphEntry[];
  lastValidation?: ValidationResult;
  /** Table name used for embeddings (default: ${designName}_embeddings) */
  embeddingTableName?: string;
  /** Whether this design has been embedded */
  isEmbedded?: boolean;
  /** Federation version (for federated designs) */
  federationVersion?: string;
  /** Line number where federation_version is defined (1-indexed) */
  federationVersionLine?: number;
}

export class DesignManager {
  private outputChannel: vscode.OutputChannel;
  private diagnostics: vscode.DiagnosticCollection;
  private context: vscode.ExtensionContext;
  private designs: Map<string, DesignEntry> = new Map();
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> =
    new Map();

  private readonly _onDidChangeDesigns = new vscode.EventEmitter<void>();
  readonly onDidChangeDesigns = this._onDidChangeDesigns.event;

  /** Event fired when a design's embedding should be updated */
  private readonly _onShouldReEmbed = new vscode.EventEmitter<DesignEntry>();
  readonly onShouldReEmbed = this._onShouldReEmbed.event;

  /** Event fired when a design's embeddings should be cleared (design deleted) */
  private readonly _onShouldClearEmbeddings = new vscode.EventEmitter<{
    configPath: string;
    tableName: string;
  }>();
  readonly onShouldClearEmbeddings = this._onShouldClearEmbeddings.event;

  constructor(
    outputChannel: vscode.OutputChannel,
    diagnostics: vscode.DiagnosticCollection,
    context: vscode.ExtensionContext,
  ) {
    this.outputChannel = outputChannel;
    this.diagnostics = diagnostics;
    this.context = context;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] [DesignManager] ${message}`);
  }

  getDesigns(): DesignEntry[] {
    return Array.from(this.designs.values());
  }

  getDesign(configPath: string): DesignEntry | undefined {
    return this.designs.get(configPath);
  }

  /**
   * Get the default embedding table name for a design
   */
  getDefaultTableName(configPath: string): string {
    const design = this.designs.get(configPath);
    if (!design) {
      return "embeddings";
    }

    // Get design name from path
    let designName: string;
    if (design.type === "federated") {
      // Use parent directory name for federated designs
      designName = path.basename(path.dirname(configPath));
    } else {
      // Use file name without extension for standalone
      designName = path.basename(configPath, ".graphql");
    }

    // Sanitize for use as table name (lowercase, alphanumeric + underscore)
    const sanitized = designName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    return `${sanitized}_embeddings`;
  }

  /**
   * Set the embedding status for a design
   */
  async setEmbeddingStatus(
    configPath: string,
    isEmbedded: boolean,
    tableName?: string,
  ): Promise<void> {
    const design = this.designs.get(configPath);
    if (!design) {
      return;
    }

    design.isEmbedded = isEmbedded;
    design.embeddingTableName =
      tableName || this.getDefaultTableName(configPath);

    // Persist to global state
    await this.saveEmbeddingState();
    this._onDidChangeDesigns.fire();
  }

  /**
   * Clear embedding status for a design
   */
  async clearEmbeddingStatus(configPath: string): Promise<void> {
    const design = this.designs.get(configPath);
    if (!design) {
      return;
    }

    design.isEmbedded = false;
    design.embeddingTableName = undefined;

    await this.saveEmbeddingState();
    this._onDidChangeDesigns.fire();
  }

  private async saveEmbeddingState(): Promise<void> {
    const state: Record<string, { tableName: string; isEmbedded: boolean }> =
      {};
    for (const [configPath, design] of this.designs) {
      if (design.isEmbedded && design.embeddingTableName) {
        state[configPath] = {
          tableName: design.embeddingTableName,
          isEmbedded: true,
        };
      }
    }
    await this.context.globalState.update("designEmbeddingState", state);
  }

  private loadEmbeddingState(): void {
    const state = this.context.globalState.get<
      Record<string, { tableName: string; isEmbedded: boolean }>
    >("designEmbeddingState", {});

    for (const [configPath, embeddingInfo] of Object.entries(state)) {
      const design = this.designs.get(configPath);
      if (design) {
        design.embeddingTableName = embeddingInfo.tableName;
        design.isEmbedded = embeddingInfo.isEmbedded;
      }
    }
  }

  /**
   * Check existing tables in the vector store and restore embedding state
   * for designs whose expected table names match existing tables.
   * This helps recover state after VS Code restarts.
   */
  async restoreEmbeddingStateFromTables(
    existingTables: string[],
  ): Promise<void> {
    const tableSet = new Set(existingTables);
    let restoredCount = 0;

    for (const [configPath, design] of this.designs) {
      // Skip if already marked as embedded
      if (design.isEmbedded) {
        continue;
      }

      // Check if the default table for this design exists
      const defaultTableName = this.getDefaultTableName(configPath);
      if (tableSet.has(defaultTableName)) {
        this.log(
          `Restoring embedding state for ${configPath}: found table "${defaultTableName}"`,
        );
        design.embeddingTableName = defaultTableName;
        design.isEmbedded = true;
        restoredCount++;
      }
    }

    if (restoredCount > 0) {
      await this.saveEmbeddingState();
      this._onDidChangeDesigns.fire();
      this.log(`Restored embedding state for ${restoredCount} design(s)`);
    }
  }

  async discoverDesigns(): Promise<void> {
    this.log("Discovering designs...");

    // Track previously embedded designs to detect deletions
    const previouslyEmbedded = new Map<string, string>();
    for (const [configPath, design] of this.designs) {
      if (design.isEmbedded && design.embeddingTableName) {
        previouslyEmbedded.set(configPath, design.embeddingTableName);
      }
    }

    this.designs.clear();

    // Find all supergraph.yaml files
    const supergraphFiles = await vscode.workspace.findFiles(
      "**/supergraph.yaml",
      "**/node_modules/**",
    );

    // Track .graphql files referenced by federated designs using canonical paths
    // to handle case-insensitive filesystems, symlinks, and Unicode normalization
    const federatedSchemaFiles = new Set<string>();

    for (const uri of supergraphFiles) {
      const entry = await this.parseFederatedDesign(uri.fsPath);
      if (entry) {
        this.designs.set(entry.configPath, entry);
        if (entry.subgraphs) {
          for (const sub of entry.subgraphs) {
            const absPath = path.isAbsolute(sub.schemaPath)
              ? sub.schemaPath
              : path.resolve(path.dirname(uri.fsPath), sub.schemaPath);
            federatedSchemaFiles.add(this.canonicalPath(absPath));
          }
        }
      }
    }

    // Find standalone .graphql files (not referenced by federated designs)
    const graphqlFiles = await vscode.workspace.findFiles(
      "**/*.graphql",
      "**/node_modules/**",
    );

    for (const uri of graphqlFiles) {
      if (federatedSchemaFiles.has(this.canonicalPath(uri.fsPath))) {
        continue;
      }
      // Check if file contains type definitions (not just operations)
      if (await this.isSchemaFile(uri)) {
        this.designs.set(uri.fsPath, {
          type: "standalone",
          configPath: uri.fsPath,
        });
      }
    }

    // Restore embedding state from previous session
    this.loadEmbeddingState();

    // Detect deleted designs that were embedded and fire cleanup events
    for (const [configPath, tableName] of previouslyEmbedded) {
      if (!this.designs.has(configPath)) {
        this.log(
          `Embedded design was deleted: ${configPath}, clearing table: ${tableName}`,
        );
        this._onShouldClearEmbeddings.fire({ configPath, tableName });
      }
    }

    this.log(
      `Discovered ${this.designs.size} designs (${
        supergraphFiles.length
      } federated, ${this.designs.size - supergraphFiles.length} standalone)`,
    );
    this._onDidChangeDesigns.fire();
  }

  private async parseFederatedDesign(
    yamlPath: string,
  ): Promise<DesignEntry | null> {
    try {
      const uri = vscode.Uri.file(yamlPath);
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString("utf-8");
      const config = parseYaml(text);

      if (!config?.subgraphs) {
        return null;
      }

      const dir = path.dirname(yamlPath);
      const subgraphs: SubgraphEntry[] = [];

      for (const [name, value] of Object.entries(config.subgraphs)) {
        const sub = value as {
          routing_url?: string;
          schema?: { file?: string; subgraph_url?: string };
        };
        const schemaFile = sub?.schema?.file;
        if (schemaFile) {
          subgraphs.push({
            name,
            schemaPath: path.isAbsolute(schemaFile)
              ? schemaFile
              : path.resolve(dir, schemaFile),
            routingUrl: sub?.routing_url,
          });
        }
      }

      // Extract federation version and find its line number
      let federationVersion: string | undefined;
      let federationVersionLine: number | undefined;

      if (config.federation_version) {
        federationVersion = String(config.federation_version);

        // Find the line number by searching the raw text
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].match(/^\s*federation_version\s*:/)) {
            federationVersionLine = i + 1; // 1-indexed
            break;
          }
        }
      }

      return {
        type: "federated",
        configPath: yamlPath,
        subgraphs,
        federationVersion,
        federationVersionLine,
      };
    } catch (error) {
      this.log(
        `Failed to parse ${yamlPath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Resolve to a canonical filesystem path for reliable comparison.
   * Handles symlinks, case-insensitive filesystems, and Unicode normalization.
   */
  private canonicalPath(p: string): string {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  }

  private async isSchemaFile(uri: vscode.Uri): Promise<boolean> {
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(content).toString("utf-8");
      // Look for type system definition keywords
      return /\b(type|interface|enum|union|scalar|input|schema|extend)\s/m.test(
        text,
      );
    } catch {
      return false;
    }
  }

  async validateDesign(configPath: string): Promise<ValidationResult> {
    const design = this.designs.get(configPath);
    if (!design) {
      return {
        valid: false,
        errors: [{ message: "Design not found", severity: "error" }],
        timestamp: Date.now(),
      };
    }

    let result: ValidationResult;

    if (design.type === "federated") {
      this.log(`Validating federated design: ${design.configPath}`);
      result = await validateFederatedSchema(
        design.configPath,
        design.subgraphs,
        { log: (msg) => this.log(msg) },
      );
    } else {
      result = await validateStandaloneSchema(design.configPath);
    }

    design.lastValidation = result;
    this.log(
      `Validation result: valid=${result.valid}, errors=${result.errors.length}`,
    );
    for (const err of result.errors) {
      this.log(
        `  [${err.severity}] ${err.message} (file=${err.file ?? "none"}, line=${
          err.line ?? "?"
        }, col=${err.column ?? "?"})`,
      );
    }
    this.publishDiagnostics(design, result);
    this._onDidChangeDesigns.fire();
    return result;
  }

  private publishDiagnostics(
    design: DesignEntry,
    result: ValidationResult,
  ): void {
    // Group errors by file
    const errorsByFile = new Map<string, ValidationError[]>();

    for (const error of result.errors) {
      const file = error.file || design.configPath;
      const existing = errorsByFile.get(file) || [];
      existing.push(error);
      errorsByFile.set(file, existing);
    }

    // Clear previous diagnostics for this design's files
    const filesToClear = new Set<string>();
    filesToClear.add(design.configPath);
    if (design.subgraphs) {
      for (const sub of design.subgraphs) {
        filesToClear.add(sub.schemaPath);
      }
    }
    for (const file of filesToClear) {
      this.diagnostics.set(vscode.Uri.file(file), []);
    }

    // Set new diagnostics
    for (const [file, errors] of errorsByFile) {
      this.log(`Publishing ${errors.length} diagnostic(s) to file: ${file}`);
      const diagnostics = errors.map((error) => {
        const startLine = error.line ?? 1;
        const startCol = error.column ?? 1;

        // Use end position if available, otherwise highlight to end of start line
        const endLine = error.endLine !== undefined ? error.endLine : startLine;
        const endCol =
          error.endColumn !== undefined ? error.endColumn : startCol;

        const range = new vscode.Range(startLine, startCol, endLine, endCol);

        const severity =
          error.severity === "warning"
            ? vscode.DiagnosticSeverity.Warning
            : error.severity === "info"
            ? vscode.DiagnosticSeverity.Information
            : vscode.DiagnosticSeverity.Error;

        const diag = new vscode.Diagnostic(range, error.message, severity);
        diag.source = "graphql-workbench-design";
        return diag;
      });

      this.diagnostics.set(vscode.Uri.file(file), diagnostics);
    }
  }

  handleFileSaved(uri: vscode.Uri): void {
    const filePath = uri.fsPath;

    // Debounce per file
    const existing = this.debounceTimers.get(filePath);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      filePath,
      setTimeout(() => {
        this.debounceTimers.delete(filePath);
        this.onFileChanged(filePath);
      }, 300),
    );
  }

  private async onFileChanged(filePath: string): Promise<void> {
    this.log(`File changed: ${filePath}`);
    const fileName = path.basename(filePath);

    // If it's a supergraph.yaml, re-parse and validate
    if (fileName === "supergraph.yaml") {
      this.log(`Detected supergraph.yaml change, re-parsing...`);
      const entry = await this.parseFederatedDesign(filePath);
      if (entry) {
        this.designs.set(filePath, entry);
        await this.validateDesign(filePath);
      }
      return;
    }

    // Find designs that reference this file
    let matched = false;
    for (const design of this.designs.values()) {
      // Standalone design where configPath is the .graphql file itself
      if (design.type === "standalone" && design.configPath === filePath) {
        this.log(`Matched standalone design: ${design.configPath}`);
        matched = true;
        await this.validateDesign(design.configPath);
        // Trigger re-embed if this design was embedded
        if (design.isEmbedded) {
          this.log(`Design is embedded, triggering re-embed`);
          this._onShouldReEmbed.fire(design);
        }
        continue;
      }
      // Federated design where the file is a subgraph schema
      if (design.subgraphs) {
        for (const sub of design.subgraphs) {
          if (sub.schemaPath === filePath) {
            this.log(
              `Matched federated subgraph "${sub.name}" in design: ${design.configPath}`,
            );
            matched = true;
            await this.validateDesign(design.configPath);
            // Trigger re-embed if this design was embedded
            if (design.isEmbedded) {
              this.log(`Federated design is embedded, triggering re-embed`);
              this._onShouldReEmbed.fire(design);
            }
            break;
          }
        }
      }
    }

    if (!matched) {
      this.log(`No design matched for file: ${filePath}`);
    }
  }

  startWatching(): void {
    const graphqlWatcher =
      vscode.workspace.createFileSystemWatcher("**/*.graphql");
    const yamlWatcher =
      vscode.workspace.createFileSystemWatcher("**/supergraph.yaml");

    // Create/delete triggers rediscovery
    graphqlWatcher.onDidCreate(() => this.discoverDesigns());
    graphqlWatcher.onDidDelete(() => this.discoverDesigns());
    yamlWatcher.onDidCreate(() => this.discoverDesigns());
    yamlWatcher.onDidDelete(() => this.discoverDesigns());

    this.fileWatchers.push(graphqlWatcher, yamlWatcher);
  }

  dispose(): void {
    for (const watcher of this.fileWatchers) {
      watcher.dispose();
    }
    this.fileWatchers = [];
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this._onDidChangeDesigns.dispose();
    this._onShouldReEmbed.dispose();
    this._onShouldClearEmbeddings.dispose();
  }
}
