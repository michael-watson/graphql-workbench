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

    .extraction-card {
      margin-top: 4px;
    }

    .extraction-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      padding: 4px 0;
    }

    .extraction-label {
      min-width: 80px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      flex-shrink: 0;
    }

    .extraction-value {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 3px;
      background: var(--vscode-textCodeBlock-background);
    }

    .extraction-original {
      text-decoration: line-through;
      opacity: 0.6;
    }

    .extraction-extracted {
      color: var(--vscode-charts-green, #4caf50);
    }

    .extraction-note {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
      padding: 4px 0;
    }

    /* Related types */
    .type-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 6px;
    }

    .type-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
    }

    .type-chip-kind {
      font-size: 10px;
      opacity: 0.6;
      text-transform: uppercase;
    }

    /* Tool call timeline */
    .tool-timeline {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-top: 6px;
    }

    .tool-event {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 4px;
      font-size: 12px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
    }

    .tool-event-icon {
      font-size: 14px;
      line-height: 1.4;
      flex-shrink: 0;
    }

    .tool-event-body {
      flex: 1;
      min-width: 0;
    }

    .tool-event-title {
      font-weight: 600;
      font-family: var(--vscode-editor-font-family);
    }

    .tool-event-query {
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      word-break: break-all;
    }

    .tool-event-result {
      font-size: 11px;
      color: var(--vscode-charts-green, #4caf50);
      margin-top: 2px;
    }

    .tool-event.tool-calling {
      border-color: var(--vscode-charts-yellow, #ff9800);
      opacity: 0.8;
    }

    .tool-event.tool-complete {
      border-color: var(--vscode-charts-green, #4caf50);
    }

    .gen-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      color: var(--vscode-descriptionForeground);
      font-style: italic;
    }

    /* Validation attempts */
    .validation-attempt {
      padding: 8px 12px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
      margin-bottom: 6px;
    }

    .validation-attempt.valid {
      border-color: var(--vscode-charts-green, #4caf50);
      background: #4caf5010;
    }

    .validation-attempt.invalid {
      border-color: var(--vscode-charts-red, #f44336);
      background: #f4433610;
    }

    .validation-attempt-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 12px;
      margin-bottom: 4px;
    }

    .validation-badge {
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
    }

    .validation-badge.pass {
      background: #4caf5030;
      color: var(--vscode-charts-green, #4caf50);
    }

    .validation-badge.fail {
      background: #f4433630;
      color: var(--vscode-charts-red, #f44336);
    }

    .validation-errors {
      margin-top: 4px;
    }

    .validation-error {
      font-size: 11px;
      color: var(--vscode-errorForeground);
      padding: 2px 0;
      font-family: var(--vscode-editor-font-family);
    }

    /* Generated operation */
    .operation-block {
      position: relative;
      margin-top: 8px;
    }

    .operation-code {
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre;
      overflow-x: auto;
      background: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 4px;
      border: 1px solid var(--vscode-panel-border);
    }

    .copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 3px 10px;
      font-size: 11px;
      background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
      border: none;
      border-radius: 2px;
      cursor: pointer;
    }

    .copy-btn:hover {
      background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground));
    }

    .variables-block {
      margin-top: 8px;
    }

    .variables-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .attempt-op-toggle {
      margin-top: 6px;
      font-size: 11px;
    }

    .attempt-op-toggle summary {
      cursor: pointer;
      color: var(--vscode-descriptionForeground);
      user-select: none;
    }

    .attempt-op-toggle pre {
      margin-top: 6px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      white-space: pre-wrap;
      background: var(--vscode-textCodeBlock-background);
      padding: 8px;
      border-radius: 2px;
      max-height: 200px;
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

  <!-- Section 0: Query Extraction -->
  <div class="section hidden" id="extractionSection">
    <h2>Query Extraction</h2>
    <div id="extractionContent"></div>
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

  <!-- Section 4: Related Types -->
  <div class="section hidden" id="relatedTypesSection">
    <h2>Related Type Discovery</h2>
    <div id="relatedTypesContent"></div>
  </div>

  <!-- Section 5: Operation Generation (with tool call timeline) -->
  <div class="section hidden" id="generationSection">
    <h2>Operation Generation</h2>
    <div id="generationContent"></div>
  </div>

  <!-- Section 6: Validation Loop -->
  <div class="section hidden" id="validationSection">
    <h2>Validation Loop</h2>
    <div id="validationContent"></div>
  </div>

  <!-- Section 7: Generated Operation -->
  <div class="section hidden" id="operationSection">
    <h2>Generated Operation</h2>
    <div id="operationContent"></div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const tableSelect = document.getElementById('tableSelect');
    const promptInput = document.getElementById('promptInput');
    const searchBtn = document.getElementById('searchBtn');
    const extractionSection = document.getElementById('extractionSection');
    const extractionContent = document.getElementById('extractionContent');
    const searchResultsSection = document.getElementById('searchResultsSection');
    const searchResultsContent = document.getElementById('searchResultsContent');
    const settingsBadge = document.getElementById('settingsBadge');
    const operationTypeSection = document.getElementById('operationTypeSection');
    const operationTypeContent = document.getElementById('operationTypeContent');
    const rootFieldSection = document.getElementById('rootFieldSection');
    const rootFieldContent = document.getElementById('rootFieldContent');
    const relatedTypesSection = document.getElementById('relatedTypesSection');
    const relatedTypesContent = document.getElementById('relatedTypesContent');
    const generationSection = document.getElementById('generationSection');
    const generationContent = document.getElementById('generationContent');
    const validationSection = document.getElementById('validationSection');
    const validationContent = document.getElementById('validationContent');
    const operationSection = document.getElementById('operationSection');
    const operationContent = document.getElementById('operationContent');

    // Tracks pending tool calls (calling → complete pairing)
    const pendingToolCalls = new Map();

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
          pendingToolCalls.clear();
          // Reset all sections
          extractionSection.classList.remove('hidden');
          extractionContent.innerHTML = '<span class="spinner"></span><span class="loading-text">LLM extracting entities and keywords...</span>';
          searchResultsSection.classList.add('hidden');
          searchResultsContent.innerHTML = '';
          settingsBadge.textContent = '';
          operationTypeSection.classList.add('hidden');
          rootFieldSection.classList.add('hidden');
          relatedTypesSection.classList.add('hidden');
          relatedTypesContent.innerHTML = '';
          generationSection.classList.add('hidden');
          generationContent.innerHTML = '';
          validationSection.classList.add('hidden');
          validationContent.innerHTML = '';
          operationSection.classList.add('hidden');
          operationContent.innerHTML = '';
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
        case 'extractedQuery': {
          const data = msg.data;
          const extractionEnabled = data.extractionEnabled;
          const original = data.originalQuery;
          const extracted = data.extractedQuery;
          const changed = original !== extracted;

          let html = '<div class="extraction-card">';
          if (!extractionEnabled) {
            html += '<div class="extraction-row"><span class="extraction-label">Extraction disabled</span><span class="extraction-value">' + escapeHtml(original) + '</span></div>';
          } else if (changed) {
            html += '<div class="extraction-row"><span class="extraction-label">Original</span><span class="extraction-value extraction-original">' + escapeHtml(original) + '</span></div>';
            html += '<div class="extraction-row"><span class="extraction-label">Extracted</span><span class="extraction-value extraction-extracted">' + escapeHtml(extracted) + '</span></div>';
          } else {
            html += '<div class="extraction-row"><span class="extraction-label">Query</span><span class="extraction-value">' + escapeHtml(original) + '</span></div>';
            html += '<div class="extraction-note">No change — query terms already concise</div>';
          }
          html += '</div>';

          extractionContent.innerHTML = html;

          // Show search results section with loading
          searchResultsSection.classList.remove('hidden');
          searchResultsContent.innerHTML = '<span class="spinner"></span><span class="loading-text">Running vector search...</span>';
          break;
        }

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

          // Show related types section with loading
          relatedTypesSection.classList.remove('hidden');
          relatedTypesContent.innerHTML = '<span class="spinner"></span><span class="loading-text">Discovering related types...</span>';
          break;
        }

        case 'relatedTypes': {
          const types = msg.data.types || [];
          if (types.length === 0) {
            relatedTypesContent.innerHTML = '<div class="empty-text">No related object types found.</div>';
          } else {
            let html = '<div class="result-count">' + types.length + ' type(s) discovered</div>';
            html += '<div class="type-chips">';
            for (const t of types) {
              html += '<span class="type-chip"><span class="type-chip-kind">' + escapeHtml(t.type || 'type') + '</span>' + escapeHtml(t.name) + '</span>';
            }
            html += '</div>';
            relatedTypesContent.innerHTML = html;
          }

          // Show generation section
          generationSection.classList.remove('hidden');
          generationContent.innerHTML = '<div class="gen-status"><span class="spinner"></span>LLM generating operation' + (hasMcpTools() ? ' (MCP tools available: Search, Introspect)' : '') + '...</div><div class="tool-timeline" id="toolTimeline"></div>';
          break;
        }

        case 'generatingOperation': {
          generationSection.classList.remove('hidden');
          generationContent.innerHTML = '<div class="gen-status"><span class="spinner"></span>LLM generating operation' + (hasMcpTools() ? ' (MCP tools available: Search, Introspect)' : '') + '...</div><div class="tool-timeline" id="toolTimeline"></div>';
          break;
        }

        case 'toolCall': {
          const toolName = msg.data.toolName;
          const query = msg.data.query;
          const status = msg.data.status;
          const resultLength = msg.data.resultLength;
          const timeline = document.getElementById('toolTimeline');

          if (!timeline) {
            // Generation section not yet shown; show it now
            generationSection.classList.remove('hidden');
            generationContent.innerHTML = '<div class="gen-status"><span class="spinner"></span>LLM calling tools...</div><div class="tool-timeline" id="toolTimeline"></div>';
          }

          const tl = document.getElementById('toolTimeline');
          if (!tl) break;

          if (status === 'calling') {
            const id = toolName + '_' + Date.now();
            pendingToolCalls.set(toolName, id);
            const icon = toolName === 'Search' ? '🔍' : '🔎';
            const div = document.createElement('div');
            div.className = 'tool-event tool-calling';
            div.id = id;
            div.innerHTML =
              '<span class="tool-event-icon">' + icon + '</span>' +
              '<div class="tool-event-body">' +
                '<div class="tool-event-title">' + escapeHtml(toolName) + ' <span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span></div>' +
                '<div class="tool-event-query">' + escapeHtml(query || '') + '</div>' +
              '</div>';
            tl.appendChild(div);
          } else if (status === 'complete') {
            const id = pendingToolCalls.get(toolName);
            if (id) {
              const existing = document.getElementById(id);
              if (existing) {
                existing.className = 'tool-event tool-complete';
                const titleEl = existing.querySelector('.tool-event-title');
                if (titleEl) titleEl.innerHTML = escapeHtml(toolName);
                const bodyEl = existing.querySelector('.tool-event-body');
                if (bodyEl) {
                  const resultDiv = document.createElement('div');
                  resultDiv.className = 'tool-event-result';
                  resultDiv.textContent = '✓ Returned ' + (resultLength || 0) + ' chars';
                  bodyEl.appendChild(resultDiv);
                }
              }
              pendingToolCalls.delete(toolName);
            }
          }
          break;
        }

        case 'validationAttempt': {
          const { attempt, maxAttempts, valid, errors, operation } = msg.data;

          // Show validation section on first attempt
          if (attempt === 1) {
            validationSection.classList.remove('hidden');
            validationContent.innerHTML = '';
          }

          // Finalize generation section on first validation
          if (attempt === 1) {
            const genStatus = generationContent.querySelector('.gen-status');
            if (genStatus) {
              genStatus.innerHTML = '✓ Operation generated';
              genStatus.style.fontStyle = 'normal';
              genStatus.style.color = 'var(--vscode-charts-green, #4caf50)';
            }
          }

          const div = document.createElement('div');
          div.className = 'validation-attempt ' + (valid ? 'valid' : 'invalid');

          let html = '<div class="validation-attempt-header">';
          html += 'Attempt ' + attempt + ' / ' + maxAttempts;
          html += ' <span class="validation-badge ' + (valid ? 'pass' : 'fail') + '">' + (valid ? 'VALID' : 'INVALID') + '</span>';
          html += '</div>';

          if (!valid && errors && errors.length > 0) {
            html += '<div class="validation-errors">';
            for (const err of errors) {
              html += '<div class="validation-error">• ' + escapeHtml(err) + '</div>';
            }
            html += '</div>';
          }

          if (!valid && operation) {
            html += '<details class="attempt-op-toggle"><summary>Show operation</summary><pre>' + escapeHtml(operation) + '</pre></details>';
          }

          div.innerHTML = html;
          validationContent.appendChild(div);

          // Show final operation section with spinner while we wait
          if (!valid) {
            operationSection.classList.remove('hidden');
            operationContent.innerHTML = '<span class="spinner"></span><span class="loading-text">LLM fixing errors...</span>';
          }
          break;
        }

        case 'operationComplete': {
          const operation = msg.data.operation;
          const variables = msg.data.variables;
          const error = msg.data.error;

          // Finalize generation section if not already done
          const genStatus = generationContent.querySelector('.gen-status');
          if (genStatus && genStatus.textContent && genStatus.textContent.includes('...')) {
            genStatus.innerHTML = '✓ Operation generated';
            genStatus.style.fontStyle = 'normal';
            genStatus.style.color = 'var(--vscode-charts-green, #4caf50)';
          }

          operationSection.classList.remove('hidden');

          if (error) {
            operationContent.innerHTML = '<div class="error-text">' + escapeHtml(error) + '</div>';
            break;
          }

          let html = '';
          if (operation) {
            html += '<div class="operation-block">';
            html += '<pre class="operation-code" id="operationCode">' + escapeHtml(operation) + '</pre>';
            html += '<button class="copy-btn" onclick="copyOperation()">Copy</button>';
            html += '</div>';
          }

          if (variables && Object.keys(variables).length > 0) {
            html += '<div class="variables-block">';
            html += '<div class="variables-label">Variables</div>';
            html += '<pre class="operation-code">' + escapeHtml(JSON.stringify(variables, null, 2)) + '</pre>';
            html += '</div>';
          }

          if (!html) {
            html = '<div class="empty-text">No operation was generated.</div>';
          }

          operationContent.innerHTML = html;
          break;
        }
      }
    }

    function hasMcpTools() {
      // Heuristic: MCP tools are likely available if the server is configured.
      // We don't have direct access to that info in the webview, so always show hint.
      return true;
    }

    function copyOperation() {
      const code = document.getElementById('operationCode');
      if (code) {
        navigator.clipboard.writeText(code.textContent || '').catch(() => {});
        const btn = operationContent.querySelector('.copy-btn');
        if (btn) {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
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
