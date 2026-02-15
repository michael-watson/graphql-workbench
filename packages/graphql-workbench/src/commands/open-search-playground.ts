import * as vscode from "vscode";
import type { EmbeddingManager } from "../services/embedding-manager";

let currentPanel: vscode.WebviewPanel | undefined;

export function openSearchPlaygroundCommand(
  manager: EmbeddingManager
): void {
  if (currentPanel) {
    currentPanel.reveal();
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "graphqlSearchPlayground",
    "Search Playground",
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

        case "search": {
          const tableName = message.tableName as string;
          const prompt = message.prompt as string;

          if (!prompt || !prompt.trim()) {
            panel.webview.postMessage({
              type: "error",
              error: "Please enter a search query",
            });
            return;
          }

          panel.webview.postMessage({ type: "searching" });

          try {
            const result = await manager.runPlaygroundSearch(
              prompt,
              tableName,
              (step) => {
                panel.webview.postMessage({
                  type: "playgroundStep",
                  ...step,
                });
              }
            );

            panel.webview.postMessage({
              type: "playgroundComplete",
              result,
            });
          } catch (err) {
            const errorMsg =
              err instanceof Error ? err.message : String(err);
            panel.webview.postMessage({
              type: "error",
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
  ].join("; ");

  return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Search Playground</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      background: var(--vscode-editor-background);
      overflow-y: auto;
      padding: 16px;
    }

    h2 {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    .input-section {
      margin-bottom: 16px;
      padding: 12px;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .input-row:last-child {
      margin-bottom: 0;
    }

    label {
      min-width: 120px;
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
    }

    select, input[type="text"] {
      flex: 1;
      padding: 6px 8px;
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
      padding: 6px 16px;
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

    .section {
      margin-bottom: 16px;
      padding: 12px;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
    }

    .section.hidden {
      display: none;
    }

    .settings-badge {
      display: inline-block;
      padding: 2px 8px;
      font-size: 11px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      margin-left: 8px;
      font-weight: normal;
      text-transform: none;
      letter-spacing: normal;
    }

    .results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }

    .results-table th {
      text-align: left;
      padding: 6px 8px;
      border-bottom: 2px solid var(--vscode-panel-border);
      font-weight: 600;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      position: sticky;
      top: 0;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    }

    .results-table td {
      padding: 4px 8px;
      border-bottom: 1px solid var(--vscode-panel-border);
      vertical-align: top;
    }

    .results-table tr:hover td {
      background: var(--vscode-list-hoverBackground);
    }

    .score-bar {
      display: inline-block;
      height: 8px;
      border-radius: 4px;
      margin-right: 6px;
      vertical-align: middle;
    }

    .score-high { background: var(--vscode-charts-green, #4caf50); }
    .score-medium { background: var(--vscode-charts-yellow, #ff9800); }
    .score-low { background: var(--vscode-charts-red, #f44336); }

    .content-preview {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }

    .op-type-badge {
      display: inline-block;
      padding: 4px 16px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 14px;
    }

    .op-type-query { background: #1565c022; color: var(--vscode-charts-blue, #42a5f5); border: 1px solid var(--vscode-charts-blue, #42a5f5); }
    .op-type-mutation { background: #e6510022; color: var(--vscode-charts-orange, #ff7043); border: 1px solid var(--vscode-charts-orange, #ff7043); }
    .op-type-subscription { background: #7b1fa222; color: var(--vscode-charts-purple, #ab47bc); border: 1px solid var(--vscode-charts-purple, #ab47bc); }

    .field-card {
      padding: 12px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 4px;
      margin-top: 8px;
      background: var(--vscode-editor-background);
    }

    .field-card .field-name {
      font-weight: 600;
      font-size: 14px;
      font-family: var(--vscode-editor-font-family);
      margin-bottom: 4px;
    }

    .field-card .field-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
    }

    .field-card .field-content {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 2px;
      max-height: 200px;
      overflow-y: auto;
    }

    .field-card .field-args {
      margin-top: 8px;
    }

    .field-card .field-args span {
      display: inline-block;
      padding: 2px 6px;
      margin: 2px;
      font-size: 11px;
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      border-radius: 2px;
    }

    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid var(--vscode-descriptionForeground);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      vertical-align: middle;
      margin-right: 8px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .loading-text {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    .error-text {
      color: var(--vscode-errorForeground);
    }

    .empty-text {
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 12px 0;
    }

    .result-count {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
    }

    .table-scroll {
      max-height: 400px;
      overflow-y: auto;
    }
  </style>
</head>
<body>

  <div class="input-section">
    <div class="input-row">
      <label for="tableSelect">Embedding Table</label>
      <select id="tableSelect">
        <option value="">Loading tables...</option>
      </select>
    </div>
    <div class="input-row">
      <label for="promptInput">Search Query</label>
      <input type="text" id="promptInput" placeholder="e.g., get all users with their posts" />
      <button id="searchBtn">Search</button>
    </div>
  </div>

  <!-- Section 1: Vector Search Results -->
  <div class="section hidden" id="searchResultsSection">
    <h2>
      Vector Search Results
      <span class="settings-badge" id="settingsBadge"></span>
    </h2>
    <div id="searchResultsContent"></div>
  </div>

  <!-- Section 2: Operation Type -->
  <div class="section hidden" id="operationTypeSection">
    <h2>Operation Type Classification</h2>
    <div id="operationTypeContent"></div>
  </div>

  <!-- Section 3: Root Field Selection -->
  <div class="section hidden" id="rootFieldSection">
    <h2>Root Field Selection</h2>
    <div id="rootFieldContent"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const tableSelect = document.getElementById('tableSelect');
    const promptInput = document.getElementById('promptInput');
    const searchBtn = document.getElementById('searchBtn');
    const searchResultsSection = document.getElementById('searchResultsSection');
    const searchResultsContent = document.getElementById('searchResultsContent');
    const settingsBadge = document.getElementById('settingsBadge');
    const operationTypeSection = document.getElementById('operationTypeSection');
    const operationTypeContent = document.getElementById('operationTypeContent');
    const rootFieldSection = document.getElementById('rootFieldSection');
    const rootFieldContent = document.getElementById('rootFieldContent');

    // --- Message handler ---
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;

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
          break;
        }

        case 'searching': {
          searchBtn.disabled = true;
          searchBtn.textContent = 'Searching...';
          // Reset all sections
          searchResultsSection.classList.remove('hidden');
          searchResultsContent.innerHTML = '<span class="spinner"></span><span class="loading-text">Running vector search...</span>';
          settingsBadge.textContent = '';
          operationTypeSection.classList.add('hidden');
          rootFieldSection.classList.add('hidden');
          break;
        }

        case 'playgroundStep': {
          handleStep(msg);
          break;
        }

        case 'playgroundComplete': {
          searchBtn.disabled = false;
          searchBtn.textContent = 'Search';
          break;
        }

        case 'error': {
          searchBtn.disabled = false;
          searchBtn.textContent = 'Search';
          searchResultsSection.classList.remove('hidden');
          searchResultsContent.innerHTML = '<div class="error-text">' + escapeHtml(msg.error) + '</div>';
          break;
        }
      }
    });

    function handleStep(msg) {
      switch (msg.step) {
        case 'searchResults': {
          const data = msg.data;
          settingsBadge.textContent = 'minSimilarity: ' + data.minSimilarityScore + ' | maxDocs: ' + data.maxDocuments;

          if (data.results.length === 0) {
            searchResultsContent.innerHTML = '<div class="empty-text">No root fields found matching the query.</div>';
            return;
          }

          let html = '<div class="result-count">' + data.results.length + ' root field(s) found</div>';
          html += '<div class="table-scroll"><table class="results-table">';
          html += '<thead><tr><th>Score</th><th>Name</th><th>Type</th><th>Return Type</th><th>Content</th></tr></thead>';
          html += '<tbody>';

          for (const r of data.results) {
            const scoreClass = r.score >= 0.7 ? 'score-high' : r.score >= 0.5 ? 'score-medium' : 'score-low';
            const scoreWidth = Math.max(10, Math.round(r.score * 80));
            html += '<tr>';
            html += '<td><span class="score-bar ' + scoreClass + '" style="width:' + scoreWidth + 'px"></span>' + r.score.toFixed(4) + '</td>';
            html += '<td><strong>' + escapeHtml(r.name) + '</strong></td>';
            html += '<td>' + escapeHtml(r.rootOperationType) + '</td>';
            html += '<td>' + escapeHtml(r.fieldType) + '</td>';
            html += '<td><span class="content-preview">' + escapeHtml(r.content.substring(0, 120)) + '</span></td>';
            html += '</tr>';
          }

          html += '</tbody></table></div>';
          searchResultsContent.innerHTML = html;

          // Show operation type section with loading
          operationTypeSection.classList.remove('hidden');
          operationTypeContent.innerHTML = '<span class="spinner"></span><span class="loading-text">LLM determining operation type...</span>';
          break;
        }

        case 'operationType': {
          const opType = msg.data.operationType;
          const cssClass = 'op-type-' + opType.toLowerCase();
          operationTypeContent.innerHTML = '<span class="op-type-badge ' + cssClass + '">' + escapeHtml(opType) + '</span>';

          // Show root field section with loading
          rootFieldSection.classList.remove('hidden');
          rootFieldContent.innerHTML = '<span class="spinner"></span><span class="loading-text">LLM selecting root field...</span>';
          break;
        }

        case 'selectedField': {
          const field = msg.data.selectedField;
          if (!field) {
            const errMsg = msg.data.error || 'No field selected';
            rootFieldContent.innerHTML = '<div class="error-text">' + escapeHtml(errMsg) + '</div>';
            return;
          }

          let html = '<div class="field-card">';
          html += '<div class="field-name">' + escapeHtml(field.parentType) + '.' + escapeHtml(field.name) + '</div>';
          html += '<div class="field-meta">Return type: <strong>' + escapeHtml(field.fieldType) + '</strong>';
          if (msg.data.filteredCount) {
            html += ' | Selected from ' + msg.data.filteredCount + ' candidate(s)';
          }
          html += '</div>';

          if (field.arguments && field.arguments.length > 0) {
            html += '<div class="field-args">Arguments: ';
            for (const arg of field.arguments) {
              html += '<span>' + escapeHtml(arg.name) + ': ' + escapeHtml(arg.type) + '</span>';
            }
            html += '</div>';
          }

          html += '<div class="field-content">' + escapeHtml(field.content) + '</div>';
          html += '</div>';

          rootFieldContent.innerHTML = html;
          break;
        }
      }
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // --- Event listeners ---
    searchBtn.addEventListener('click', () => {
      vscode.postMessage({
        type: 'search',
        tableName: tableSelect.value,
        prompt: promptInput.value.trim(),
      });
    });

    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        searchBtn.click();
      }
    });

    // --- Init ---
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}
