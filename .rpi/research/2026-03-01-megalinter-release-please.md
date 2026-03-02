# Research: MegaLinter + release-please Automation

## Executive Summary

Add automated linting (MegaLinter) and automated release management (release-please) to the GraphQL Workbench VS Code extension. Currently, versions are bumped manually with "Bump version" commits. release-please will automate this based on conventional commits.

## Findings

### Current State

**Project structure:**
- Monorepo root: `package.json` (version `0.0.0`, private, uses @changesets/cli for library packages)
- VS Code extension: `packages/graphql-workbench/package.json` (version `0.3.1`)
- Library packages: graphql-embedding-*, separate versioning via changesets

**Current release flow:**
- `release.yml` triggers on every push to `main`
- Builds VSIX for 7 platform targets
- Reads version from `packages/graphql-workbench/package.json`
- Creates GitHub release if version tag doesn't exist
- Publishes to VS Code Marketplace

**Current CI flow:**
- `ci.yml` runs typecheck and evals on push/PR to main

**Commit conventions used:**
- `fix(scope): message` → patch
- `feat(scope): message` → minor
- `docs: message` → no version bump
- `Bump version` → manual (to be replaced)

### release-please Analysis

**How it works:**
1. Runs on push to main
2. Reads conventional commits since last release
3. Creates/updates a "Release PR" with version bump in `package.json` and `CHANGELOG.md`
4. When Release PR is merged, creates a GitHub Release with tag

**Configuration needed:**
- `release-please-config.json` - defines packages to track
- `.release-please-manifest.json` - tracks current version per package
- `.github/workflows/release-please.yml` - the GitHub Action

**Version bump rules (conventional commits):**
- `feat:` or `feat(scope):` → minor bump
- `fix:` or `fix(scope):` → patch bump
- `feat!:` or `BREAKING CHANGE:` → major bump
- `docs:`, `chore:`, `refactor:`, etc. → no version bump

**release-type for VS Code extension:** `node` (reads/writes `package.json`)

**Package path:** `packages/graphql-workbench`

**Release-please action output:**
- `releases_created` - boolean
- `release-graphql-workbench--tag_name` - the tag when released

**Integration with existing release.yml:**
- Change trigger from `push: branches: [main]` to `release: types: [published]`
- This way builds only happen when release-please actually publishes a release

### MegaLinter Analysis

**What it does:**
- Runs 50+ linters on code (TypeScript, Markdown, JSON, YAML, etc.)
- Docker-based, runs in GitHub Actions
- Reports issues as annotations in PRs
- Can auto-fix some issues

**Flavor choice:**
- `javascript` flavor: focused on JS/TS projects, much smaller Docker image
- Full megalinter: all languages, very large

**For this TypeScript monorepo, configure:**
- Enable: `TYPESCRIPT_ES` (ESLint), `MARKDOWN_MARKDOWNLINT`, `JSON_PRETTIER`, `YAML_PRETTIER`
- The project doesn't have ESLint configured yet, so we should run in REPORT-only mode initially

**Key config options in `.mega-linter.yml`:**
- `APPLY_FIXES: none` - report only, don't modify files
- `VALIDATE_ALL_CODEBASE: false` - only check changed files in PRs
- `DISABLE_LINTERS: [...]` - disable specific linters we don't need

**Best approach:**
- Use `oxsecurity/megalinter/flavors/javascript@v8` for smaller image
- Run on PRs only (not push to main)
- Start with report-only mode
- Exclude `node_modules`, `.rpi`, `dist`

### Workflow Restructure Plan

**New workflow structure:**

1. `ci.yml` - unchanged (typecheck + tests on push/PR)
2. `megalinter.yml` - NEW: MegaLinter on PRs
3. `release-please.yml` - NEW: Creates release PRs, publishes releases
4. `release.yml` - MODIFIED: Trigger on `workflow_call` from release-please output

**Key insight for release.yml:**
The cleanest approach is to have release-please.yml call the build/publish steps directly using `workflow_call` or by restructuring release.yml to trigger on `release: [published]`.

## Recommendations

### P0: release-please setup
1. Create `release-please-config.json` targeting `packages/graphql-workbench`
2. Create `.release-please-manifest.json` with current version `0.3.1`
3. Create `.github/workflows/release-please.yml`
4. Modify `.github/workflows/release.yml` to trigger on `release: [published]` instead of `push`

### P1: MegaLinter setup
1. Create `.mega-linter.yml` with JavaScript flavor, REPORT-only mode
2. Create `.github/workflows/megalinter.yml` for PRs

### P2: Documentation
1. Add CHANGELOG.md starter (release-please expects/creates this)
2. Update README to mention automated releases

## Open Questions

None - sufficient information to implement.
