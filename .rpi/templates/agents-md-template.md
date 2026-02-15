# AI Agent Instructions

Welcome, AI agents! This document provides guidelines for working effectively with this codebase.

---

## Project Overview

### What This Project Does

_Brief description of the project's purpose and functionality_

### Architecture

_High-level architecture overview_

### Key Technologies

_Main languages, frameworks, and tools_

- Language:
- Framework:
- Testing:
- Build:

---

## RPI Workflow

This project uses the Research-Plan-Implement (RPI) Loop methodology. As an agent:

1. **Research Phase** (`/rpi-research`)

   - Explore the codebase to understand context
   - Identify patterns, dependencies, and constraints
   - Create research document in `.rpi/research/`
   - Ask clarifying questions if needed

2. **Planning Phase** (`/rpi-plan`)

   - Review research findings
   - Design implementation approach
   - Create detailed spec with prioritized tasks
   - Request user approval before proceeding

3. **Implementation Phase** (`/rpi-implement`)

   - Execute tasks in priority order (P0 → P1 → P2)
   - Run tests after each major change
   - Mark tasks complete as you go
   - Create new specs for discovered work
   - Commit when complete

4. **Next Iteration** (`/rpi-next`)
   - Review remaining specs in to-implement queue
   - Select next spec to work on

---

## Coding Standards

### Style Guidelines

_Project-specific code style preferences_

### Naming Conventions

- Files:
- Functions:
- Variables:
- Classes:

### Patterns to Follow

_Common patterns used in this codebase_

### Patterns to Avoid

_Anti-patterns or deprecated approaches_

---

## File Organization

### Directory Structure

```
project/
├── src/           -
├── tests/         -
├── docs/          -
└── .rpi/          - RPI Loop working directory
```

### Where Things Live

- Configuration files:
- Business logic:
- UI components:
- Tests:
- Utilities:

---

## Testing Strategy

### Test Requirements

_When to write tests and what kind_

### Running Tests

```bash
# Command to run tests
```

### Test Patterns

_How tests are organized and written_

---

## Git Workflow

### Branch Strategy

_How branches are used in this project_

### Commit Messages

_Commit message format and conventions_

### When to Commit

_Guidelines for commit frequency and scope_

---

## Common Tasks

### Adding a New Feature

1. Run `/rpi-research "description of feature"`
2. Review research and run `/rpi-plan`
3. Once spec is approved, run `/rpi-implement`
4. Spec will be committed automatically

### Fixing a Bug

1. Investigate the issue (use research phase if complex)
2. Create a spec if the fix is non-trivial
3. Implement and test
4. Commit with clear description

### Refactoring

1. Research the area to understand dependencies
2. Plan the refactoring with a spec
3. Implement incrementally with tests
4. Ensure no behavior changes (unless intended)

---

## Important Context

### Business Logic Notes

_Critical business rules or domain knowledge_

### External Integrations

_APIs, services, or systems this project integrates with_

### Performance Considerations

_Known performance bottlenecks or optimization areas_

### Security Notes

_Security-sensitive areas or patterns_

---

## AI-Ready Features

### Skills Available

- `/rpi-research` - Start research phase
- `/rpi-plan` - Create implementation plan
- `/rpi-implement` - Execute a spec
- `/rpi-next` - View and start next spec
- `/keep-ai-ready` - Update AI-ready files after changes

### When to Update This Document

Update `AGENTS.md` when:

- New patterns are introduced
- Architecture changes
- New conventions are adopted
- Common pitfalls are discovered

Use `/keep-ai-ready` skill to update AI-ready files after implementation.

---

## Getting Help

### Documentation

- Technical docs:
- API docs:
- Architecture docs:

### Key Files to Read First

_Files that provide good entry points for understanding the codebase_

1. `path/to/key/file` - Why it's important
2. `path/to/another/file` - Why it's important

---

## Success Criteria

You're doing great if:

- You follow the RPI workflow for non-trivial changes
- You ask clarifying questions during research/planning
- You write tests for new functionality
- You maintain existing code patterns
- You update documentation when needed
- Your commits are atomic and well-described

---

## Notes for Humans

This file is optimized for AI agent consumption. For human-readable workflow docs, see `HOWTOAI.md`.
