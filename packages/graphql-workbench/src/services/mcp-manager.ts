import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";
import type { DesignEntry } from "./design-manager";
import type { DesignManager } from "./design-manager";
import type { McpBinaryManager } from "./mcp-binary-manager";

interface McpServerEntry {
  port: number;
  process: child_process.ChildProcess | null;
  configFilePath: string;
  schemaFilePath: string;
}

const BASE_PORT = 9001;

export class McpManager {
  private servers: Map<string, McpServerEntry> = new Map();
  private portAssignments: Map<string, number> = new Map(); // configPath → port
  private disabledDesigns: Set<string> = new Set();
  private nextPort = BASE_PORT;

  private readonly _onDidChangeMcpServers = new vscode.EventEmitter<void>();
  readonly onDidChangeMcpServers = this._onDidChangeMcpServers.event;

  private readonly configsDir: string;
  private readonly schemasDir: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
    private readonly designManager: DesignManager,
    private readonly binaryManager: McpBinaryManager,
  ) {
    this.configsDir = path.join(
      context.globalStorageUri.fsPath,
      "mcp",
      "configs",
    );
    this.schemasDir = path.join(
      context.globalStorageUri.fsPath,
      "mcp",
      "schemas",
    );
  }

  async initialize(): Promise<void> {
    // Restore persisted state
    const savedPorts = this.context.globalState.get<Record<string, number>>(
      "mcpPortAssignments",
      {},
    );
    for (const [configPath, port] of Object.entries(savedPorts)) {
      this.portAssignments.set(configPath, port);
      if (port >= this.nextPort) {
        this.nextPort = port + 1;
      }
    }

    const savedDisabled = this.context.globalState.get<string[]>(
      "mcpDisabledDesigns",
      [],
    );
    this.disabledDesigns = new Set(savedDisabled);

    // Restart server with fresh schema whenever validation passes (schema may have changed)
    this.designManager.onDidValidateDesign(async ({ design, result }) => {
      if (
        !this.isGloballyEnabled() ||
        this.disabledDesigns.has(design.configPath)
      ) {
        return;
      }
      if (result.valid) {
        await this.startOrRestartServer(design);
      }
    });

    // Start servers for new designs; stop servers for removed designs
    this.designManager.onDidChangeDesigns(async () => {
      if (!this.isGloballyEnabled()) {
        this._onDidChangeMcpServers.fire();
        return;
      }
      const currentPaths = new Set(
        this.designManager.getDesigns().map((d) => d.configPath),
      );
      for (const configPath of [...this.servers.keys()]) {
        if (!currentPaths.has(configPath)) {
          await this.stopServer(configPath);
        }
      }
      for (const design of this.designManager.getDesigns()) {
        if (
          !this.disabledDesigns.has(design.configPath) &&
          !this.isServerRunning(design.configPath)
        ) {
          await this.startOrRestartServer(design);
        }
      }
      this._onDidChangeMcpServers.fire();
    });

    await fs.promises.mkdir(this.configsDir, { recursive: true });
    await fs.promises.mkdir(this.schemasDir, { recursive: true });
  }

  isGloballyEnabled(): boolean {
    return vscode.workspace
      .getConfiguration("graphqlWorkbench")
      .get<boolean>("enableMcpServer", true);
  }

  isDesignEnabled(configPath: string): boolean {
    return !this.disabledDesigns.has(configPath);
  }

  isServerRunning(configPath: string): boolean {
    const entry = this.servers.get(configPath);
    return !!entry?.process && !entry.process.killed;
  }

  getServerPort(configPath: string): number | undefined {
    return (
      this.servers.get(configPath)?.port ?? this.portAssignments.get(configPath)
    );
  }

  getServerUrl(configPath: string): string | undefined {
    const port = this.getServerPort(configPath);
    return port !== undefined ? `http://127.0.0.1:${port}/mcp` : undefined;
  }

  async enableDesign(configPath: string): Promise<void> {
    this.disabledDesigns.delete(configPath);
    await this.saveDisabledState();
    const design = this.designManager.getDesign(configPath);
    if (design) {
      await this.startOrRestartServer(design);
    }
    this._onDidChangeMcpServers.fire();
  }

  async disableDesign(configPath: string): Promise<void> {
    this.disabledDesigns.add(configPath);
    await this.saveDisabledState();
    await this.stopServer(configPath);
    this._onDidChangeMcpServers.fire();
  }

  async startServer(configPath: string): Promise<void> {
    const design = this.designManager.getDesign(configPath);
    if (design) {
      await this.startOrRestartServer(design);
    }
  }

  async stopServer(configPath: string): Promise<void> {
    const entry = this.servers.get(configPath);
    if (!entry) {
      return;
    }
    if (entry.process && !entry.process.killed) {
      entry.process.kill();
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    this.servers.delete(configPath);
    this._onDidChangeMcpServers.fire();
  }

  async stopAllServers(): Promise<void> {
    for (const configPath of [...this.servers.keys()]) {
      await this.stopServer(configPath);
    }
  }

  async startAllEnabledServers(): Promise<void> {
    const designs = this.designManager.getDesigns();
    for (const design of designs) {
      if (!this.disabledDesigns.has(design.configPath)) {
        await this.startOrRestartServer(design);
      }
    }
  }

  private async startOrRestartServer(design: DesignEntry): Promise<void> {
    const binaryPath = await this.binaryManager.ensureBinaryAvailable();
    if (!binaryPath) {
      this.output.appendLine(
        `[McpManager] Binary not available, skipping server start for ${design.configPath}`,
      );
      return;
    }

    // Stop existing server if running
    await this.stopServer(design.configPath);

    try {
      const schemaPath = await this.getOrWriteSchemaFile(design);
      if (!schemaPath) {
        this.output.appendLine(
          `[McpManager] Could not get schema for ${design.configPath}, skipping`,
        );
        return;
      }

      const port = this.getOrAllocatePort(design.configPath);
      const configPath = await this.writeConfigFile(design, schemaPath, port);

      const proc = child_process.spawn(binaryPath, [configPath], {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout?.on("data", (data: Buffer) => {
        this.output.appendLine(
          `[McpManager:${path.basename(path.dirname(design.configPath))}] ${data
            .toString()
            .trim()}`,
        );
      });

      proc.stderr?.on("data", (data: Buffer) => {
        this.output.appendLine(
          `[McpManager:${path.basename(
            path.dirname(design.configPath),
          )} ERR] ${data.toString().trim()}`,
        );
      });

      proc.on("exit", (code) => {
        this.output.appendLine(
          `[McpManager] Server for ${design.configPath} exited with code ${code}`,
        );
        const entry = this.servers.get(design.configPath);
        if (entry) {
          entry.process = null;
          this._onDidChangeMcpServers.fire();
        }
      });

      this.servers.set(design.configPath, {
        port,
        process: proc,
        configFilePath: configPath,
        schemaFilePath: schemaPath,
      });

      this.output.appendLine(
        `[McpManager] Started MCP server for ${design.configPath} on port ${port}`,
      );
      this._onDidChangeMcpServers.fire();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(
        `[McpManager] Failed to start server for ${design.configPath}: ${message}`,
      );
    }
  }

  private async getOrWriteSchemaFile(
    design: DesignEntry,
  ): Promise<string | null> {
    if (design.type === "standalone") {
      return design.configPath;
    }

    // Federated: compose API schema
    try {
      const { composeApiSchema } = await import("./rover-validator.js");
      const result = await composeApiSchema(design.configPath);
      if (!result.success || !result.schema) {
        this.output.appendLine(
          `[McpManager] Failed to compose API schema for ${design.configPath}: ${result.error}`,
        );
        return null;
      }

      const designName = path.basename(path.dirname(design.configPath));
      const schemaFilePath = path.join(
        this.schemasDir,
        `${sanitizeName(designName)}-api.graphql`,
      );
      await fs.promises.writeFile(schemaFilePath, result.schema, "utf-8");
      return schemaFilePath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(
        `[McpManager] Error composing schema for ${design.configPath}: ${message}`,
      );
      return null;
    }
  }

  private async writeConfigFile(
    design: DesignEntry,
    schemaPath: string,
    port: number,
  ): Promise<string> {
    const designName =
      design.type === "federated"
        ? path.basename(path.dirname(design.configPath))
        : path.basename(design.configPath, ".graphql");

    const configFilePath = path.join(
      this.configsDir,
      `${sanitizeName(designName)}.yaml`,
    );

    const configContent = [
      `schema:`,
      `  source: local`,
      `  path: "${schemaPath.replace(/\\/g, "/")}"`,
      ``,
      `transport:`,
      `  type: streamable_http`,
      `  address: "127.0.0.1"`,
      `  port: ${port}`,
      ``,
      `introspection:`,
      `  introspect:`,
      `    enabled: true`,
      `    minify: true`,
      `  search:`,
      `    enabled: true`,
      `    minify: true`,
      `  validate:`,
      `    enabled: true`,
    ].join("\n");

    await fs.promises.writeFile(configFilePath, configContent, "utf-8");
    return configFilePath;
  }

  private getOrAllocatePort(configPath: string): number {
    if (this.portAssignments.has(configPath)) {
      return this.portAssignments.get(configPath)!;
    }
    const port = this.nextPort++;
    this.portAssignments.set(configPath, port);
    this.savePortAssignments();
    return port;
  }

  private async savePortAssignments(): Promise<void> {
    const assignments: Record<string, number> = {};
    for (const [configPath, port] of this.portAssignments) {
      assignments[configPath] = port;
    }
    await this.context.globalState.update("mcpPortAssignments", assignments);
  }

  private async saveDisabledState(): Promise<void> {
    await this.context.globalState.update("mcpDisabledDesigns", [
      ...this.disabledDesigns,
    ]);
  }

  dispose(): void {
    for (const entry of this.servers.values()) {
      if (entry.process && !entry.process.killed) {
        entry.process.kill();
      }
    }
    this.servers.clear();
    this._onDidChangeMcpServers.dispose();
  }
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
