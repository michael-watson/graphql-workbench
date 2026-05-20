# RPI Workflow Reference

## Phases

### 1. Research (`/rpi-research`)
- Explore codebase, identify patterns/dependencies/constraints
- Document findings in `.rpi/research/`
- Ask clarifying questions, recommend approach
- Output: research doc

### 2. Plan (`/rpi-plan`)
- Review research, design approach, break into P0/P1/P2 tasks
- Include testing requirements, request approval
- Output: spec saved to `.rpi/specs/to-implement/`

### 3. Implement (`/rpi-implement`)
- Move spec to `in-progress`, execute tasks P0→P1→P2
- Run tests after each change (Ralph Wiggum: change → test → fix → repeat, max 10 iterations)
- Mark tasks `[x]` as done, create new specs for discovered work (don't implement now)
- Commit with `git-commit-spec.sh`, move spec to `completed`
- Output: working code, passing tests, git commit

### 4. Next (`/rpi-next`)
- List `to-implement` queue, recommend next, start if approved

## Spec Lifecycle

```
to-implement → in-progress → completed
```

## Helper Scripts

```bash
# Get next spec ID
.rpi/scripts/helpers/next-spec-id.sh          # → 000001

# Move spec between folders + update status in filename
.rpi/scripts/helpers/move-spec.sh <spec-file> <dest-folder> <new-status>

# Conventional commit for completed spec (always supply --type and --scope)
.rpi/scripts/helpers/git-commit-spec.sh \
  .rpi/specs/completed/000001-feature-completed.md \
  --type feat --scope short-name
```

## Creating a Spec

1. `.rpi/scripts/helpers/next-spec-id.sh`
2. `git rev-parse HEAD`
3. Copy `.rpi/templates/spec-template.md`, fill all sections
4. Save to `.rpi/specs/to-implement/`
5. Update `.rpi/state.json` (`last_spec_id`, `specs[]`, `updated_at`)

## state.json Format

```json
{
  "version": "1.0.0",
  "last_spec_id": 3,
  "specs": [{ "id": "000001", "title": "feature-name", "status": "completed",
               "created_at": "2026-02-11T14:30:00Z", "completed_at": "2026-02-11T16:45:00Z" }],
  "updated_at": "2026-02-11T16:45:00Z"
}
```

`state.json` is gitignored (local only).

## Configuration (`.rpi/config.yaml`)

```yaml
implementation:
  max_iterations: 10
  run_tests: true
  test_command: ""
git:
  auto_commit: true
```

## Templates

| Template | Location | Use for |
|----------|----------|---------|
| Spec | `.rpi/templates/spec-template.md` | New implementation specs |
| Research | `.rpi/templates/research-template.md` | Research findings |
| AGENTS.md | `.rpi/templates/agents-md-template.md` | New project AI instructions |

## Bash Script Standards

- Shebang: `#!/usr/bin/env bash`
- Strict mode: `set -euo pipefail`
- Comment complex logic, validate inputs, helpful error messages
- Make executable: `chmod +x`
