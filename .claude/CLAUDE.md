# AI Agent Instructions - RPI Loop Template

Welcome, AI agents! This is the **RPI Loop Template** - a reusable template for building projects using the Research-Plan-Implement methodology.

---

## What This Project Is

This is a **template repository** that developers clone to start new projects with built-in RPI workflow support. It's not a library or framework - it's a starting point with:

- Directory structure for organizing research, specs, and implementation
- Bash scripts for automating spec management
- Claude Code skills for guided RPI workflow
- AI-ready documentation and standards
- Templates for specs, research, and planning

---

## Key Technologies

- **Language:** Bash (scripts), Markdown (documentation)
- **Tools:** Git, Claude Code skills
- **Configuration:** YAML (config), JSON (state)
- **Target Use:** Any programming language/framework (template is language-agnostic)

---

## Project Structure

```
rpi-loop/
├── .rpi/                          # RPI working directory
│   ├── research/                  # Research phase documents
│   ├── specs/                     # Implementation specs
│   │   ├── to-implement/         # Queue of specs to implement
│   │   ├── in-progress/          # Currently implementing
│   │   └── completed/            # Completed specs
│   ├── scripts/helpers/          # Bash helper scripts
│   └── templates/                # Markdown templates
├── skills/                        # Claude Code skills
│   ├── rpi-research/             # Research phase skill
│   ├── rpi-plan/                 # Planning phase skill
│   ├── rpi-implement/            # Implementation phase skill
│   ├── rpi-next/                 # Queue management skill
│   └── keep-ai-ready/            # Maintenance skill
├── AGENTS.md                     # This file (agent instructions)
├── CLAUDE.md                     # Project requirements/context
├── HOWTOAI.md                    # Human-readable workflow guide
└── README.md                     # User documentation
```

---

## RPI Workflow

This template enables a structured Research-Plan-Implement loop:

### 1. Research Phase (`/rpi-research`)

**Goal:** Understand before planning

- Explore codebase to understand context
- Identify patterns, dependencies, constraints
- Document findings in `.rpi/research/`
- Ask clarifying questions
- Recommend approach

**Output:** Research document with findings and recommendations

### 2. Planning Phase (`/rpi-plan`)

**Goal:** Create detailed, approved plan

- Review research findings
- Design implementation approach
- Break into prioritized tasks (P0/P1/P2)
- Include testing requirements
- Request user approval
- Save spec to `.rpi/specs/to-implement/`

**Output:** Detailed spec with tasks, priorities, acceptance criteria

### 3. Implementation Phase (`/rpi-implement`)

**Goal:** Execute spec to completion

- Move spec to `in-progress`
- Execute tasks in priority order
- Run tests after each change (Ralph Wiggum iteration)
- Mark tasks complete as you go
- Create new specs for discovered work
- Commit when complete
- Move spec to `completed`

**Output:** Working code, passing tests, git commit

### 4. Next Iteration (`/rpi-next`)

**Goal:** Continue with queued work

- List specs in to-implement queue
- Recommend next spec
- Start implementation if approved

**Output:** Next spec started or queue overview

---

## Using the Skills

### When to Use Each Skill

| Skill            | When                          | Purpose                             |
| ---------------- | ----------------------------- | ----------------------------------- |
| `/rpi-research`  | User describes what they want | Gather context before planning      |
| `/rpi-plan`      | After research is complete    | Create detailed implementation plan |
| `/rpi-implement` | After plan is approved        | Execute the spec                    |
| `/rpi-next`      | After implementation complete | View queue and start next spec      |
| `/keep-ai-ready` | After significant changes     | Update AI documentation             |

### Skill Dependencies

```
User Request
    ↓
/rpi-research (explores codebase)
    ↓
/rpi-plan (creates spec, gets approval)
    ↓
/rpi-implement (executes spec)
    ↓
/rpi-next (continues with next spec)
    ↓
[Repeat]
```

---

## Coding Standards

Since this is a template, follow these standards:

### Bash Scripts

- Use `#!/usr/bin/env bash` shebang
- Enable strict mode: `set -euo pipefail`
- Comment complex logic
- Validate inputs
- Provide helpful error messages
- Make scripts executable (`chmod +x`)

### Markdown Documentation

- Use clear headings (H1 for title, H2 for sections)
- Include code examples where helpful
- Keep examples realistic and actionable
- Use tables for comparisons
- Use checkboxes for task lists

### File Naming

- **Specs:** `{spec_id}-{kebab-case-title}-{status}.md`
- **Research:** `{timestamp}-{kebab-case-title}.md`
- **Scripts:** `{kebab-case-name}.sh`

### YAML Configuration

- Use 2-space indentation
- Include comments for non-obvious settings
- Group related settings

---

## Helper Scripts

### next-spec-id.sh

**Purpose:** Get next sequential spec ID
**Location:** `.rpi/scripts/helpers/next-spec-id.sh`
**Usage:**

```bash
.rpi/scripts/helpers/next-spec-id.sh
# Output: 000001
```

### move-spec.sh

**Purpose:** Move spec between folders and update status in filename
**Location:** `.rpi/scripts/helpers/move-spec.sh`
**Usage:**

```bash
.rpi/scripts/helpers/move-spec.sh \
  <spec-file> \
  <destination-folder> \
  <new-status>
```

### git-commit-spec.sh

**Purpose:** Create git commit for completed spec
**Location:** `.rpi/scripts/helpers/git-commit-spec.sh`
**Usage:**

```bash
.rpi/scripts/helpers/git-commit-spec.sh \
  .rpi/specs/completed/000001-feature-completed.md
```

---

## State Management

### state.json Format

```json
{
  "version": "1.0.0",
  "last_spec_id": 3,
  "specs": [
    {
      "id": "000001",
      "title": "feature-name",
      "status": "completed",
      "created_at": "2026-02-11T14:30:00Z",
      "completed_at": "2026-02-11T16:45:00Z"
    }
  ],
  "updated_at": "2026-02-11T16:45:00Z"
}
```

**Important:**

- `state.json` is in `.gitignore` (local only)
- Update `last_spec_id` when creating new specs
- Add spec entry to `specs` array

---

## Templates

### Spec Template

**Location:** `.rpi/templates/spec-template.md`
**Use for:** Creating new implementation specs
**Sections:** Context, Tasks (by priority), Success Criteria, Implementation Summary

### Research Template

**Location:** `.rpi/templates/research-template.md`
**Use for:** Documenting research findings
**Sections:** Executive Summary, Findings, Recommendations, Open Questions

### AGENTS.md Template

**Location:** `.rpi/templates/agents-md-template.md`
**Use for:** Initializing new projects with AI instructions
**Sections:** Project Overview, Coding Standards, Common Tasks, Patterns

---

## Common Tasks for Agents

### Creating a New Spec

1. Get next spec ID: `.rpi/scripts/helpers/next-spec-id.sh`
2. Get current git hash: `git rev-parse HEAD`
3. Copy spec template: `.rpi/templates/spec-template.md`
4. Fill in all sections
5. Save to `.rpi/specs/to-implement/`
6. Update `.rpi/state.json`

### Implementing a Spec

1. Read spec completely
2. Move to in-progress with `move-spec.sh`
3. Execute tasks in priority order (P0 → P1 → P2)
4. Run tests after each change
5. Mark tasks complete in spec [x]
6. Fill Implementation Summary
7. Commit with `git-commit-spec.sh`
8. Move to completed with `move-spec.sh`

### Updating State

```bash
# Read current state
cat .rpi/state.json

# Update last_spec_id (in the JSON file)
# Add new spec entry to specs array
# Update updated_at timestamp
```

---

## Important Patterns

### Ralph Wiggum Iteration

During implementation:

1. Make a change
2. Run tests
3. If tests fail, analyze and fix
4. Retry (up to max_iterations)
5. Continue until tests pass
6. Move to next task

### Spec Lifecycle

```
unimplemented → implementing → completed
     ↓              ↓              ↓
to-implement  in-progress   completed
```

### Creating Discovered Work

When you discover new work during implementation:

1. Document it in current spec's Implementation Summary
2. Create a new spec for it (use `/rpi-plan`)
3. Save to to-implement folder
4. Don't implement it now (stay focused)
5. Let it become a future RPI iteration

---

## Configuration

Settings in `.rpi/config.yaml`:

```yaml
# Key settings agents should be aware of
implementation:
  max_iterations: 10 # Max retry attempts
  run_tests: true # Auto-run tests
  test_command: "" # Test command (project-specific)

git:
  auto_commit: true # Auto-commit on completion
```

Respect these settings during implementation.

---

## Git Workflow

### Commits

- One commit per completed spec
- Use `git-commit-spec.sh` for consistency
- Include spec ID in commit message
- Include Co-Authored-By tag for Claude

### Commit Message Format

```
{Spec Title}

{Implementation Summary}

Spec ID: {spec_id}

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

### Branching

- Template uses simple workflow (main branch)
- Projects using template may add branching strategy
- Respect project-specific git workflow

---

## Testing Strategy

Since this is a template:

- Helper scripts should be manually tested
- Skills should be tested by using them
- Templates should be validated for completeness
- Documentation should be reviewed for clarity

For projects using this template:

- Follow project-specific testing strategy
- Run tests after each implementation change
- Include test tasks in specs (P0 priority)

---

## When to Update This Document

Update `AGENTS.md` when:

- New patterns are introduced in the template
- Skills are added or changed
- Helper scripts are modified
- Workflow changes
- Common issues are discovered

Use `/keep-ai-ready` skill to update AI-ready files.

---

## Success Criteria for Agents

You're doing great if you:

- Follow the RPI workflow (research → plan → implement)
- Use skills for each phase
- Create detailed, actionable specs
- Execute tasks in priority order
- Run tests frequently
- Document discoveries in specs
- Commit completed specs properly
- Keep AI-ready documentation current

---

## Getting Help

### Documentation

- **HOWTOAI.md** - Human-readable workflow guide
- **README.md** - Template overview and quick start
- **CLAUDE.md** - Project requirements and context
- **Skills/** - Detailed skill instructions

### Key Files to Understand

1. `.rpi/config.yaml` - Configuration settings
2. `.rpi/templates/spec-template.md` - Spec format
3. `skills/rpi-*/SKILL.md` - How each skill works

---

## Template Philosophy

This template embodies:

- **Structured iteration:** Research before planning, planning before implementing
- **Clear ownership:** Specs define what's done and what's next
- **Autonomous execution:** Agents can work through specs independently
- **Living documentation:** Specs and research documents capture decisions
- **AI-friendly:** Optimized for AI agent understanding and execution

When using this template, maintain these principles.

---

## Notes for AI Agents

This template is designed specifically for AI-assisted development. The RPI workflow leverages AI strengths:

- **Research:** AI can explore codebases thoroughly
- **Planning:** AI can break down complex work systematically
- **Implementation:** AI can execute defined tasks reliably
- **Iteration:** AI can retry and fix issues autonomously

Use the skills provided - they're optimized for this workflow.

---

## For Humans

This file is optimized for AI agent consumption. Humans should read `HOWTOAI.md` for a more narrative guide to using this template.
