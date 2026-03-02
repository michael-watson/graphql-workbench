# Spec 000007: MegaLinter + release-please Automation

**Status:** completed
**Created:** 2026-03-01
**Git Hash at Creation:** 474a088

## Context

The project currently requires manual version bumping ("Bump version" commits) before releases. This spec adds:
1. **release-please** - automatically creates release PRs and bumps versions based on conventional commits
2. **MegaLinter** - runs code quality linters on PRs

Version bump rules:
- `feat:` commits → minor bump (e.g., 0.3.x → 0.4.0)
- `fix:` commits → patch bump (e.g., 0.3.1 → 0.3.2)

## Tasks

### P0: release-please Configuration

- [x] Create `release-please-config.json` at repo root targeting `packages/graphql-workbench`
- [x] Create `.release-please-manifest.json` at repo root with current version `0.3.1`
- [x] Create `.github/workflows/release-please.yml`
- [x] Modify `.github/workflows/release.yml` to trigger on GitHub Release published event (not push to main)

### P1: MegaLinter Configuration

- [x] Create `.mega-linter.yml` with JavaScript flavor, report-only mode
- [x] Create `.github/workflows/megalinter.yml` for PR checks

### P2: CHANGELOG

- [x] `packages/graphql-workbench/CHANGELOG.md` already existed with full history

## Success Criteria

- [x] release-please workflow file is valid YAML
- [x] release-please-config.json correctly targets `packages/graphql-workbench`
- [x] .release-please-manifest.json has version `0.3.1`
- [x] release.yml triggers on `release: [published]` (not push to main)
- [x] MegaLinter workflow runs on pull_request events
- [x] CHANGELOG.md exists in packages/graphql-workbench/

## Implementation Summary

### Files Created

- `release-please-config.json` - configures release-please to track `packages/graphql-workbench` with `node` release type
- `.release-please-manifest.json` - seeds current version `0.3.1` so release-please knows the baseline
- `.github/workflows/release-please.yml` - runs on push to main; creates release PRs based on conventional commits
- `.github/workflows/megalinter.yml` - runs MegaLinter JavaScript flavor on PRs; report-only mode, uploads reports as artifacts
- `.mega-linter.yml` - configures MegaLinter: TYPESCRIPT_ES, MARKDOWN_MARKDOWNLINT, JSON_PRETTIER, YAML_PRETTIER, ACTION_ACTIONLINT; excludes node_modules/dist/.rpi/etc; DISABLE_ERRORS: true for informational start

### Files Modified

- `.github/workflows/release.yml` - changed trigger from `push: branches: [main]` to `release: types: [published]`; restructured to upload VSIXes to existing release (via `gh release upload`) instead of creating a new release

### How It Works Now

1. Developer makes commits with conventional commit format (`feat:`, `fix:`, etc.)
2. On push to main, `release-please.yml` runs and creates/updates a Release PR
3. The Release PR bumps `packages/graphql-workbench/package.json` version and updates `CHANGELOG.md`
4. When the Release PR is merged, release-please creates a GitHub Release with the version tag
5. The `release: published` event triggers `release.yml` which builds all 7 platform VSIXes, uploads them to the release, and publishes to VS Code Marketplace
6. On every PR to main, `megalinter.yml` runs linting checks (report-only)
