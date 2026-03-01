# Spec 000003: Apollo MCP Server Documentation

## Context

Document the Apollo MCP Server integration (spec 000002) in the project README and update the implementation spec to accurately reflect the final delivered state, including all bug fixes and UX changes made after the initial implementation.

## Tasks

- [x] Update spec 000002 to reflect actual final implementation
  - Corrected task descriptions (Start/Stop/Enable/Disable, not Toggle/Restart)
  - Documented all three bug fixes (positional CLI arg, tar strip-components, ensureBinaryAvailable)
  - Added architectural notes on the two-hook design and contextValue granularity

- [x] Add Apollo MCP Server section to `README.md`
  - How it works (auto-start, federated schema composition, restart on save)
  - First-time setup with download command instructions
  - Example `claude_desktop_config.json` connection snippet
  - Table of MCP tools exposed (introspect, search, validate)
  - Server management reference (Start/Stop/Disable/Enable)
  - Settings row in the existing extension settings table

## Success Criteria

- README clearly explains how to set up and connect an AI tool to the MCP server
- Spec 000002 accurately reflects the delivered code, not the original plan

## Implementation Summary

All tasks completed in a single pass. Changes committed to `feat-mcp-server`.

### Files Modified
- `.rpi/specs/completed/000002-apollo-mcp-server-integration-completed.md` — full rewrite to match final state
- `README.md` — new "Apollo MCP Server" subsection added under VS Code Extension features
