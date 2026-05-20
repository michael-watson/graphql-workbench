# GraphQL Workbench — Agent Instructions

## What This Is

TypeScript monorepo: a VS Code extension (`packages/graphql-workbench`) plus library packages for GraphQL schema embedding, operation generation, and schema design analysis. Uses the RPI workflow (Research → Plan → Implement) via Claude Code skills.

## Build Commands

| Target | Command |
|--------|---------|
| Library packages | `npm run build` (tsc, project references) |
| VS Code extension | `npm run build --workspace=graphql-workbench` (esbuild) |
| Type-check extension | `cd packages/graphql-workbench && npx tsc --noEmit` |

> esbuild bundles but does NOT type-check. Always run `tsc --noEmit` to verify types.

## RPI Workflow Skills

| Skill | When |
|-------|------|
| `/rpi-research` | User describes new work |
| `/rpi-plan` | After research — creates spec in `.rpi/specs/to-implement/` |
| `/rpi-implement` | After plan approved — executes spec, commits |
| `/rpi-next` | View queue, start next spec |
| `/keep-ai-ready` | After significant changes |

Flow: research → plan → implement → next → repeat. See @rpi-reference.md for full workflow details, helper scripts, and state management.

## Git Conventions

All commits must use conventional format with scope:

```
{type}({scope}): {description}

Spec ID: {spec_id}

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

**Types:** `feat` `fix` `docs` `chore` `refactor` `test` `perf` `ci`  
**Scope examples:** `mcp-server` `design-tree` `embedding` `ci` `search`

PR titles must match `type(scope): description` — enforced by `.github/workflows/pr-title.yml`. Release-please uses these for version bumps (`feat` → minor, `fix` → patch, `feat!` → major).

## Package Structure

- `packages/graphql-workbench/` — VS Code extension (see @../packages/graphql-workbench/CLAUDE.md)
- `packages/graphql-embedding-operation/` — Dynamic op generator + MCP client (see @../packages/graphql-embedding-operation/CLAUDE.md)
- `packages/graphql-embedding-core/` — Embedding service, vector stores (see @../packages/graphql-embedding-core/CLAUDE.md)
- `packages/graphql-embedding-parser/` — Schema parsing utilities
- `packages/graphql-embedding-schema-design/` — Schema design analyzer / best practices
- `packages/graphql-embedding/` — Public API aggregator (re-exports)
