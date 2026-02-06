# Commands Reference

All commands are accessible from the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`). Some are also available from context menus when right-clicking `.graphql` files.

## Embed Schema from File

**Command Palette:** `GraphQL Workbench: Embed Schema from File`
**Context menus:** Explorer right-click, Editor right-click (on `.graphql` files)

Parses a GraphQL schema file and embeds each type, field, and definition into the vector store. This is a prerequisite for operation generation and schema design analysis.

### Steps

1. If no file is active, you are prompted to select a `.graphql` or `.gql` file.
2. Enter a table name for storing embeddings (default: `graphql_embeddings`).
3. If the table already contains data, choose whether to clear existing documents or append new ones.
4. The schema is parsed and embedded. A notification shows:
   - Number of documents embedded
   - Duration
   - Number of skipped documents (if any exceeded the token limit)
   - Storage location (for PGLite)

---

## Embed Schema from Endpoint

**Command Palette:** `GraphQL Workbench: Embed Schema from Endpoint`

Introspects a live GraphQL endpoint and embeds the resulting schema into the vector store.

### Steps

1. Enter the GraphQL endpoint URL (e.g., `https://api.example.com/graphql`).
2. Optionally add authorization headers as JSON (e.g., `{"Authorization": "Bearer token"}`).
3. Enter a table name for storing embeddings.
4. If the table already contains data, choose whether to clear or append.
5. The endpoint is introspected, the schema is built from the introspection result, and documents are embedded.

### Error Handling

- HTTP errors (non-2xx status codes) are reported with the status code and message.
- GraphQL-level errors from the introspection response are displayed.
- Invalid URLs are rejected during input validation.

---

## Generate Operation

**Command Palette:** `GraphQL Workbench: Generate Operation`
**Context menus:** Editor right-click (on `.graphql` files)

Generates a GraphQL operation from a natural language description using the embedded schema and opens it in the Explorer panel.

### Steps

1. Select an embedding table from the quick-pick list. If tables exist in the vector store, they are listed for selection. An "Enter table name manually..." option is available if you need to specify a table not in the list. If no tables are found, you are prompted to enter a name directly.
2. Describe the operation you want in plain language (e.g., "get all users with their posts").
3. The extension searches the vector store for relevant schema elements.
4. The Explorer panel opens (or is revealed if already open) with the generated operation loaded into Apollo Explorer.

### Generation Process

- Embeds your query as a vector and performs similarity search.
- Uses the LLM to identify the most relevant root field (Query, Mutation, or Subscription).
- Retrieves related types and arguments from the vector store.
- Uses the LLM to generate a complete GraphQL operation with example variables.
- Validates the operation by parsing it. If parsing fails, the LLM retries (up to 5 times by default).

### Output

The generated operation is sent to the Explorer panel with:

- A `# Prompt:` comment at the top showing the original natural language description
- The GraphQL operation
- Example variables (passed to Apollo Explorer's variables pane)

The Explorer panel's prompt input is also updated to show the description that was used. An information message reports the operation type, root field, and validation attempts.

---

## Open Explorer Panel

**Command Palette:** `GraphQL Workbench: Open Explorer Panel`
**Context menus:** Editor right-click (on `.graphql` files)

Opens an integrated Apollo Explorer webview panel for building and running GraphQL operations against a live endpoint.

### Panel Layout

The panel contains:

- **Embedding Table** dropdown -- select which embedded schema to use. Changing the selection reloads the Explorer with the new schema.
- **Endpoint URL** input -- the GraphQL API URL that Apollo Explorer sends requests to. Changes are applied after a 1-second debounce.
- **Describe op** input + **Generate** button -- generate operations directly from the panel without returning to the Command Palette.
- **Apollo Explorer** (iframe) -- the full embedded Apollo Explorer for editing operations, viewing docs, and running requests.

### Behavior

- The panel is a **singleton**: only one Explorer panel exists at a time. Running the command again reveals the existing panel. The **Generate Operation** command also reuses this panel.
- The schema SDL stored alongside the embeddings is loaded and passed to Apollo Explorer via the postMessage handshake protocol.
- Generated operations (from either the panel's Generate button or the Command Palette command) include a `# Prompt:` comment and are injected into Apollo Explorer via the `SetOperation` message.

---

## Introspect Endpoint to File

**Command Palette:** `GraphQL Workbench: Introspect Endpoint to File`

Downloads a GraphQL schema from a live endpoint via introspection and saves it as a `.graphql` file.

### Steps

1. Enter the GraphQL endpoint URL.
2. Optionally add authorization headers as JSON.
3. The endpoint is introspected and the schema is converted to SDL.
4. Choose a save location for the `.graphql` file.
5. The file is saved and opened in the editor.

This is useful for saving a copy of a remote schema for local use, inspection, or version control.

---

## Lint Schema

**Command Palette:** `GraphQL Workbench: Lint Schema`
**Context menus:** Explorer right-click, Editor right-click (on `.graphql` files)

Analyzes a GraphQL schema file against a set of naming convention and design rules.

### Steps

1. If no file is active, you are prompted to select a `.graphql` or `.gql` file.
2. A rule picker appears with all rules pre-selected. Deselect any rules you want to skip.
3. Violations appear in the VS Code **Problems** panel as warnings, with the rule ID shown as the diagnostic code.

### Quick Fixes

When violations are reported, the lightbulb menu offers:

- **Dismiss: \<message\>** -- removes a single violation
- **Dismiss all lint violations in this file** -- removes all violations for the file

These quick fixes dismiss the diagnostic without changing the schema. They are useful for acknowledging intentional deviations from the rules.

See the [Lint Rules Reference](./lint-rules.md) for the full list of rules.

---

## Analyze Schema Design

**Command Palette:** `GraphQL Workbench: Analyze Schema Design`

Uses an LLM to analyze the embedded schema against best practice categories and produces a markdown report.

### Prerequisites

- A schema must already be embedded in the vector store (via **Embed Schema from File** or **Embed Schema from Endpoint**).
- An LLM provider must be configured (Ollama, OpenAI, or Anthropic).

### Steps

1. Enter the embeddings table name to analyze.
2. The extension initializes an LLM provider, retrieves schema documents from the vector store, and runs the analysis.
3. A markdown report opens in a new editor tab beside your current editor.
4. An information message reports the number of documents analyzed and the categories evaluated.

### Report Categories

The analysis evaluates your schema against categories including:

- **Naming Conventions** -- consistency of type, field, and enum naming
- **Schema Expressiveness and Documentation** -- use of descriptions and clear type definitions
- **Anti-Patterns** -- common design mistakes
- **Query Design** -- structure and usability of query fields (if present)
- **Mutation Design** -- structure and usability of mutation fields (if present)

Use VS Code's built-in **Markdown: Open Preview** command to render the report.

---

## Clear All Embeddings

**Command Palette:** `GraphQL Workbench: Clear All Embeddings`

Removes all documents from the vector store.

### Steps

1. A confirmation dialog warns: "Are you sure you want to clear all embeddings? This cannot be undone."
2. Click **Clear All** to confirm.
3. All embedded documents are removed, and operation generators are reset.

After clearing, you need to embed a schema again before generating operations or running analysis.

---

# Schema Design Workbench Commands

The following commands are available from the Schema Design Workbench tree view in the activity bar. Most are accessed via right-click context menus on tree items.

---

## Refresh Designs

**Command Palette:** `GraphQL Workbench: Refresh Designs`
**Tree view:** Refresh button in the Designs panel toolbar

Re-scans the workspace for `.graphql` files and `supergraph.yaml` configurations, updating the tree view.

---

## New Schema Design

**Command Palette:** `GraphQL Workbench: New Schema Design`
**Tree view:** + button in the Designs panel toolbar

Creates a new standalone GraphQL schema file.

### Steps

1. Enter a file name (must end with `.graphql`).
2. A new file is created with a basic `Query` type scaffold and opened in the editor.

---

## New Federated Design

**Command Palette:** `GraphQL Workbench: New Federated Design`
**Tree view:** Available from the Designs panel toolbar overflow menu

Creates a new Apollo Federation supergraph with a sample subgraph.

### Steps

1. Enter a directory name for the federated design.
2. A new directory is created containing:
   - `supergraph.yaml` -- the federation configuration
   - `products.graphql` -- a sample subgraph schema
3. The `supergraph.yaml` file opens in the editor.

---

## Add Subgraph

**Context menu:** Right-click a federated design

Adds a new subgraph to an existing federated design.

### Steps

1. Enter a name for the new subgraph.
2. A new `.graphql` file is created with a placeholder schema.
3. The subgraph is added to `supergraph.yaml`.
4. The new schema file opens in the editor.

---

## Validate Design

**Context menu:** Right-click any design (inline checkmark button)

Validates the schema design and reports errors in the Problems panel.

- **Standalone schemas** are parsed and validated using the `graphql` library.
- **Federated schemas** are validated using `rover supergraph compose`, checking federation directives, entity keys, and cross-subgraph references.

Errors include precise file, line, and column information. Click an error to navigate to the issue.

---

## Embed Design

**Context menu:** Right-click a design or its Embedding row

Embeds the schema into a vector store for operation generation.

### Steps

1. Enter a table name (default: `{designName}_embeddings`).
2. For federated designs, the API schema (without federation directives) is composed first.
3. The schema is parsed and embedded into the vector store.
4. The Embedding row updates to show the table name in green.

---

## Re-embed Schema

**Context menu:** Right-click the Embedding row

Clears existing embeddings and re-embeds the schema. Useful after major schema changes.

### Steps

1. Confirm the re-embed action.
2. Existing embeddings are cleared from the table.
3. The schema is re-embedded with fresh documents.

---

## Clear Design Embeddings

**Context menu:** Right-click a design or its Embedding row

Removes all embeddings for a specific design from the vector store.

### Steps

1. Confirm the clear action.
2. All documents are removed from the embedding table.
3. The Embedding row updates to show "not embedded".

---

## Generate Operation for Design

**Context menu:** Right-click a design

Generates a GraphQL operation from natural language using the design's embedded schema.

If the design is not yet embedded, you are prompted to embed it first. The generated operation opens in the Explorer panel.

---

## View Supergraph Schema

**Tree view:** Click "Supergraph Schema" under a federated design

Composes and displays the full supergraph schema including federation directives (`@key`, `@external`, `@requires`, etc.).

The schema opens in a new editor tab titled `supergraph-schema.graphql`.

---

## View API Schema

**Tree view:** Click "API Schema" under a federated design

Composes and displays the client-facing API schema without federation directives.

This is the schema that clients see and is used for embedding. The schema opens in a new editor tab titled `api-schema.graphql`.

---

## Rename Subgraph

**Context menu:** Right-click a subgraph

Renames a subgraph and optionally its schema file.

### Steps

1. Enter the new subgraph name.
2. The subgraph key in `supergraph.yaml` is updated.
3. If the schema file name matches the old subgraph name, the file is also renamed.

---

## Delete Subgraph

**Context menu:** Right-click a subgraph

Removes a subgraph from the federated design.

### Steps

1. Choose whether to:
   - **Delete Entry Only** -- removes the subgraph from `supergraph.yaml` but keeps the schema file
   - **Delete Entry and File** -- removes both the configuration and the schema file
2. The tree view updates to reflect the removal.

---

## Delete Design

**Context menu:** Right-click a design

Deletes a schema design from the workspace.

- **Standalone designs** -- deletes the `.graphql` file
- **Federated designs** -- deletes the entire directory containing `supergraph.yaml` and all subgraph schemas

A confirmation dialog warns before deletion. If the design was embedded, embeddings are automatically cleared.
