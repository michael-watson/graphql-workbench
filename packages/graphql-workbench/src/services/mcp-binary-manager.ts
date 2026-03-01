import * as vscode from "vscode";
import * as path from "path";
import * as https from "https";
import * as fs from "fs";
import * as child_process from "child_process";

interface GitHubRelease {
  tag_name: string;
  assets: Array<{ name: string; browser_download_url: string }>;
}

export class McpBinaryManager {
  private readonly binDir: string;
  private readonly binaryName: string;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {
    this.binDir = path.join(context.globalStorageUri.fsPath, "mcp", "bin");
    this.binaryName = process.platform === "win32" ? "apollo-mcp-server.exe" : "apollo-mcp-server";
  }

  getBinaryPath(): string {
    return path.join(this.binDir, this.binaryName);
  }

  isBinaryAvailable(): boolean {
    const binaryPath = this.getBinaryPath();
    try {
      fs.accessSync(binaryPath, fs.constants.X_OK);
      return true;
    } catch {
      try {
        fs.accessSync(binaryPath, fs.constants.R_OK);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Ensures the MCP binary is available. Prompts user to download if missing.
   * Returns the binary path if available, null if user declines or download fails.
   */
  async ensureBinaryAvailable(): Promise<string | null> {
    if (this.isBinaryAvailable()) {
      return this.getBinaryPath();
    }

    const choice = await vscode.window.showInformationMessage(
      "Apollo MCP Server binary not found. Download it now?",
      "Download",
      "Cancel"
    );

    if (choice !== "Download") {
      return null;
    }

    return this.downloadBinary();
  }

  /**
   * Downloads the latest Apollo MCP Server binary for the current platform.
   * Returns the binary path on success, null on failure.
   */
  async downloadBinary(): Promise<string | null> {
    const target = this.getPlatformTarget();
    if (!target) {
      vscode.window.showErrorMessage(
        `Unsupported platform: ${process.platform} ${process.arch}`
      );
      return null;
    }

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Downloading Apollo MCP Server",
        cancellable: false,
      },
      async (progress) => {
        try {
          progress.report({ message: "Fetching latest release info..." });
          const release = await this.fetchLatestRelease();
          const version = release.tag_name;

          const archiveName = `apollo-mcp-server-${version}-${target}.tar.gz`;
          const asset = release.assets.find((a) => a.name === archiveName);
          if (!asset) {
            vscode.window.showErrorMessage(
              `No binary found for platform ${target} in release ${version}`
            );
            return null;
          }

          await fs.promises.mkdir(this.binDir, { recursive: true });

          const archivePath = path.join(this.binDir, archiveName);
          progress.report({ message: `Downloading ${archiveName}...` });
          await this.downloadFile(asset.browser_download_url, archivePath);

          progress.report({ message: "Extracting binary..." });
          await this.extractTarGz(archivePath, this.binDir);

          // Remove archive after extraction
          await fs.promises.unlink(archivePath).catch(() => {});

          const binaryPath = this.getBinaryPath();
          if (!fs.existsSync(binaryPath)) {
            throw new Error(`Binary not found at expected path after extraction: ${binaryPath}`);
          }

          // Make executable on Unix
          if (process.platform !== "win32") {
            await fs.promises.chmod(binaryPath, 0o755);
          }

          await this.context.globalState.update("mcpBinaryVersion", version);
          this.output.appendLine(`[McpBinaryManager] Downloaded binary v${version} to ${binaryPath}`);

          vscode.window.showInformationMessage(
            `Apollo MCP Server ${version} downloaded successfully.`
          );
          return binaryPath;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.output.appendLine(`[McpBinaryManager] Download failed: ${message}`);
          vscode.window.showErrorMessage(`Failed to download Apollo MCP Server: ${message}`);
          return null;
        }
      }
    );
  }

  private getPlatformTarget(): string | null {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "darwin") {
      return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    }
    if (platform === "linux") {
      return arch === "arm64"
        ? "aarch64-unknown-linux-gnu"
        : "x86_64-unknown-linux-gnu";
    }
    if (platform === "win32") {
      return arch === "arm64"
        ? "aarch64-pc-windows-msvc"
        : "x86_64-pc-windows-msvc";
    }
    return null;
  }

  private fetchLatestRelease(): Promise<GitHubRelease> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path: "/repos/apollographql/apollo-mcp-server/releases/latest",
        headers: { "User-Agent": "graphql-workbench-vscode" },
      };

      https.get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data) as GitHubRelease);
          } catch {
            reject(new Error("Failed to parse GitHub release response"));
          }
        });
        res.on("error", reject);
      }).on("error", reject);
    });
  }

  private downloadFile(url: string, destPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const followRedirects = (redirectUrl: string, depth = 0): void => {
        if (depth > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        const parsedUrl = new URL(redirectUrl);
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: { "User-Agent": "graphql-workbench-vscode" },
        };

        https.get(options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302) {
            const location = res.headers.location;
            if (!location) {
              reject(new Error("Redirect without location header"));
              return;
            }
            followRedirects(location, depth + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} downloading binary`));
            return;
          }

          const file = fs.createWriteStream(destPath);
          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
          file.on("error", (err) => {
            fs.unlink(destPath, () => {});
            reject(err);
          });
        }).on("error", reject);
      };

      followRedirects(url);
    });
  }

  private extractTarGz(archivePath: string, outputDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      child_process.execFile(
        "tar",
        ["xzf", archivePath, "-C", outputDir, "--strip-components=1"],
        { timeout: 60000 },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    });
  }

}
