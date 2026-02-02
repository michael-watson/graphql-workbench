import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";

let currentPanel: vscode.WebviewPanel | undefined;

export function openExplorerPanelCommand(
  manager: EmbeddingManager,
  extensionUri: vscode.Uri
): void {
  if (currentPanel) {
    currentPanel.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "graphqlExplorer",
    "GraphQL Explorer",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  currentPanel = panel;

  const nonce = getNonce();
  panel.webview.html = getWebviewHtml(panel.webview, nonce);

  panel.onDidDispose(() => {
    currentPanel = undefined;
  });

  panel.webview.onDidReceiveMessage(
    async (message: { type: string; [key: string]: unknown }) => {
      switch (message.type) {
        case "ready":
        case "requestTables": {
          try {
            const tables = await manager.listTables();
            panel.webview.postMessage({ type: "tables", tables });
          } catch {
            panel.webview.postMessage({ type: "tables", tables: [] });
          }
          break;
        }

        case "requestSchema": {
          const tableName = message.tableName as string | undefined;
          const sdl = await manager.getSchemaSDL(tableName);
          panel.webview.postMessage({ type: "schema", sdl: sdl ?? null });
          break;
        }

        case "generate": {
          const tableName = message.tableName as string;
          const prompt = message.prompt as string;

          if (!prompt || !prompt.trim()) {
            panel.webview.postMessage({
              type: "operationError",
              error: "Please enter a description",
            });
            return;
          }

          panel.webview.postMessage({ type: "generating" });

          try {
            const result = await manager.generateOperation(prompt, tableName);
            if (!result) {
              panel.webview.postMessage({
                type: "operationError",
                error:
                  "No operation generated. Make sure a schema is embedded.",
              });
              return;
            }

            const operationWithComment = `# Prompt: ${prompt}\n${result.operation}`;

            panel.webview.postMessage({
              type: "operationResult",
              operation: operationWithComment,
              variables: result.variables ?? {},
              prompt,
            });
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : String(err);
            panel.webview.postMessage({
              type: "operationError",
              error: errorMsg,
            });
          }
          break;
        }
      }
    },
    undefined,
    []
  );
}

export function sendToExplorerPanel(
  message: Record<string, unknown>
): void {
  if (currentPanel) {
    currentPanel.webview.postMessage(message);
  }
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getWebviewHtml(webview: vscode.Webview, nonce: string): string {
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    `frame-src https://explorer.embed.apollographql.com`,
    `connect-src https://explorer.embed.apollographql.com`,
  ].join("; ");

  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GraphQL Explorer</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
    }
    .toolbar {
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      border-bottom: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    .toolbar-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    label {
      min-width: 110px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
    }
    select, input[type="text"] {
      flex: 1;
      padding: 4px 8px;
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
      font-family: inherit;
      font-size: inherit;
    }
    select:focus, input[type="text"]:focus {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }
    button {
      padding: 4px 14px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      white-space: nowrap;
    }
    button:hover {
      background: var(--vscode-button-hoverBackground);
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .explorer-container {
      flex: 1;
      position: relative;
      min-height: 0;
    }
    .explorer-container iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
    .status {
      padding: 4px 12px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      border-top: 1px solid var(--vscode-panel-border);
      flex-shrink: 0;
    }
    .status.error {
      color: var(--vscode-errorForeground);
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <div class="toolbar-row">
      <label for="tableSelect">Embedding Table</label>
      <select id="tableSelect">
        <option value="">Loading tables…</option>
      </select>
    </div>
    <div class="toolbar-row">
      <label for="endpointInput">Endpoint URL</label>
      <input type="text" id="endpointInput" placeholder="http://localhost:4000/graphql" value="http://localhost:4000/graphql" />
    </div>
    <div class="toolbar-row">
      <label for="promptInput">Describe op</label>
      <input type="text" id="promptInput" placeholder="e.g., get all users with their posts" />
      <button id="generateBtn">Generate</button>
    </div>
  </div>

  <div class="explorer-container" id="explorerContainer"></div>
  <div class="status" id="statusBar">Ready</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const tableSelect = document.getElementById('tableSelect');
    const endpointInput = document.getElementById('endpointInput');
    const promptInput = document.getElementById('promptInput');
    const generateBtn = document.getElementById('generateBtn');
    const explorerContainer = document.getElementById('explorerContainer');
    const statusBar = document.getElementById('statusBar');

    let currentSchema = null;
    let explorerIframe = null;
    let endpointDebounceTimer = null;
    let pendingTableChange = false;
    // Pending operation to apply once the Explorer iframe is ready
    let pendingGeneratedOp = null;

    // --- Explorer iframe management ---
    function buildExplorerUrl(endpointUrl) {
      const params = new URLSearchParams({
        endpointUrl: endpointUrl,
        theme: 'dark',
        docsPanelState: 'closed',
        displayOptions: JSON.stringify({
          showHeadersAndEnvVars: false,
          docsPanelState: 'closed',
          theme: 'dark',
        }),
      });
      return 'https://explorer.embed.apollographql.com?' + params.toString();
    }

    function loadExplorer(endpointUrl) {
      if (!endpointUrl) return;
      // Remove existing iframe
      if (explorerIframe) {
        explorerContainer.removeChild(explorerIframe);
        explorerIframe = null;
      }
      const iframe = document.createElement('iframe');
      iframe.src = buildExplorerUrl(endpointUrl);
      iframe.id = 'explorerFrame';
      explorerContainer.appendChild(iframe);
      explorerIframe = iframe;
    }

    // Listen for postMessage from Apollo Explorer iframe
    window.addEventListener('message', (event) => {
      // Messages from the VS Code extension host
      if (event.data && typeof event.data === 'object' && event.data.type) {
        handleExtensionMessage(event.data);
        return;
      }

      // Messages from the Apollo Explorer iframe
      if (event.data && typeof event.data === 'object') {
        const data = event.data;
        if (data.name === 'ExplorerListeningForHandshake') {
          sendToExplorer({
            name: 'HandshakeResponse',
            parentHtmlId: 'explorerFrame',
          });
        }
        if (data.name === 'ExplorerListeningForSchema') {
          if (currentSchema) {
            sendToExplorer({
              name: 'SchemaResponse',
              schema: currentSchema,
            });
            // Apply any pending generated operation after schema is delivered
            if (pendingGeneratedOp) {
              const op = pendingGeneratedOp;
              pendingGeneratedOp = null;
              setTimeout(() => {
                setOperation(op.operation, op.variables);
                setStatus('Operation generated');
              }, 300);
            }
          }
        }
      }
    });

    function sendToExplorer(message) {
      if (explorerIframe && explorerIframe.contentWindow) {
        explorerIframe.contentWindow.postMessage(message, 'https://explorer.embed.apollographql.com');
      }
    }

    function setOperation(operation, variables) {
      sendToExplorer({
        name: 'SetOperation',
        operation: operation,
        variables: JSON.stringify(variables || {}),
      });
    }

    // --- Extension message handler ---
    function handleExtensionMessage(msg) {
      switch (msg.type) {
        case 'tables': {
          const tables = msg.tables || [];
          tableSelect.innerHTML = '';
          if (tables.length === 0) {
            tableSelect.innerHTML = '<option value="">No tables found</option>';
          } else {
            tables.forEach(t => {
              const opt = document.createElement('option');
              opt.value = t;
              opt.textContent = t;
              tableSelect.appendChild(opt);
            });
          }
          // If there's a pending generated op, select its table; otherwise use the first
          if (tables.length > 0) {
            const targetTable = (pendingGeneratedOp && pendingGeneratedOp.tableName) || tables[0];
            tableSelect.value = targetTable;
            if (pendingGeneratedOp) {
              pendingTableChange = true;
            }
            vscode.postMessage({ type: 'requestSchema', tableName: targetTable });
          }
          break;
        }
        case 'schema': {
          currentSchema = msg.sdl;
          if (currentSchema) {
            setStatus('Schema loaded');
            if (pendingTableChange) {
              // Reload the Explorer so it picks up the new schema via handshake
              pendingTableChange = false;
              loadExplorer(endpointInput.value.trim());
            } else if (explorerIframe) {
              sendToExplorer({ name: 'SchemaResponse', schema: currentSchema });
              // Apply pending operation on existing explorer
              if (pendingGeneratedOp) {
                const op = pendingGeneratedOp;
                pendingGeneratedOp = null;
                setTimeout(() => {
                  setOperation(op.operation, op.variables);
                  setStatus('Operation generated');
                }, 300);
              }
            }
          } else {
            setStatus('No schema available for this table');
            pendingTableChange = false;
            pendingGeneratedOp = null;
          }
          break;
        }
        case 'generating': {
          generateBtn.disabled = true;
          generateBtn.textContent = 'Generating…';
          setStatus('Generating operation…');
          break;
        }
        case 'operationResult': {
          generateBtn.disabled = false;
          generateBtn.textContent = 'Generate';
          setStatus('Operation generated');
          setOperation(msg.operation, msg.variables);
          break;
        }
        case 'operationError': {
          generateBtn.disabled = false;
          generateBtn.textContent = 'Generate';
          setStatus(msg.error, true);
          break;
        }
        case 'setGeneratedOperation': {
          // Received from the generate-operation command
          const op = { operation: msg.operation, variables: msg.variables, tableName: msg.tableName };
          const currentTable = tableSelect.value;

          // Update the prompt input to show what was generated
          if (msg.prompt) {
            promptInput.value = msg.prompt;
          }

          if (msg.tableName && msg.tableName !== currentTable) {
            // Different table — store pending, select table, request schema (will reload explorer)
            pendingGeneratedOp = op;
            const optionExists = Array.from(tableSelect.options).some(o => o.value === msg.tableName);
            if (optionExists) {
              tableSelect.value = msg.tableName;
              pendingTableChange = true;
              vscode.postMessage({ type: 'requestSchema', tableName: msg.tableName });
            }
            // If option doesn't exist yet, the tables handler will pick it up
          } else if (explorerIframe && currentSchema) {
            // Same table and explorer is ready — apply immediately
            setOperation(op.operation, op.variables);
            setStatus('Operation generated');
          } else {
            // Explorer not ready yet — store as pending
            pendingGeneratedOp = op;
          }
          break;
        }
      }
    }

    function setStatus(text, isError) {
      statusBar.textContent = text;
      statusBar.className = isError ? 'status error' : 'status';
    }

    // --- Event listeners ---
    tableSelect.addEventListener('change', () => {
      const tableName = tableSelect.value;
      if (tableName) {
        pendingTableChange = true;
        vscode.postMessage({ type: 'requestSchema', tableName });
      }
    });

    endpointInput.addEventListener('input', () => {
      clearTimeout(endpointDebounceTimer);
      endpointDebounceTimer = setTimeout(() => {
        loadExplorer(endpointInput.value.trim());
      }, 1000);
    });

    generateBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'generate',
        tableName: tableSelect.value,
        prompt: promptInput.value.trim(),
      });
    });

    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        generateBtn.click();
      }
    });

    // --- Init ---
    loadExplorer(endpointInput.value.trim());
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
