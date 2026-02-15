# 000000: Example - Setup RPI Template

**Status:** Completed
**Created:** 2026-02-11
**Git Hash:** initial

---

## Context

### Background

This is an example spec to demonstrate the format and lifecycle of specs in the RPI Loop workflow. Real specs will be created by agents during the planning phase.

### User Goal

Show users what a completed spec looks like, including task structure, priorities, and implementation summary.

### Related Specs

- This is spec 000000 (example/template)
- Real specs start at 000001

---

## User Journey

### Before

Users are unfamiliar with the spec format and structure.

### After

Users can reference this example to understand:

- How tasks are organized
- What success criteria look like
- How implementation summaries are written

---

## Success Criteria

- [x] Spec demonstrates clear task organization
- [x] Shows priority levels (P0, P1, P2)
- [x] Includes testing tasks
- [x] Has complete implementation summary
- [x] Serves as reference for new users

---

## Tasks

### Priority 0 (Critical)

_Must be completed for the spec to be considered done_

- [x] **Create directory structure** - Setup .rpi/ directories

  - Files: `.rpi/research/`, `.rpi/specs/`, `.rpi/scripts/helpers/`, `.rpi/templates/`
  - Details: Organized workspace for RPI workflow

- [x] **Create helper scripts** - Automation for spec management

  - Files: `.rpi/scripts/helpers/next-spec-id.sh`, `move-spec.sh`, `git-commit-spec.sh`
  - Details: Bash scripts for spec ID generation, moving specs, and creating commits

- [x] **Create templates** - Markdown templates for consistency
  - Files: `.rpi/templates/spec-template.md`, `research-template.md`, `agents-md-template.md`
  - Details: Standard formats for specs and research documents

### Priority 1 (High)

_Should be completed but can be deferred if blocked_

- [x] **Create Claude Code skills** - RPI workflow skills

  - Files: `skills/rpi-research/`, `skills/rpi-plan/`, `skills/rpi-implement/`, `skills/rpi-next/`, `skills/keep-ai-ready/`
  - Details: Skills to guide agents through each phase

- [x] **Setup AI-ready features** - Documentation and rules
  - Files: `AGENTS.md`, `HOWTOAI.md`, `.github/copilot-instructions.md`
  - Details: Make template AI-ready out of the box

### Priority 2 (Nice to Have)

_Can be completed if time allows, or moved to future spec_

- [x] **Create example spec** - Reference implementation
  - Files: `.rpi/specs/completed/000000-example-setup-rpi-template-completed.md`
  - Details: This file - shows users what a completed spec looks like

### Testing Tasks

_Tests that must pass before spec is complete_

- [x] **Test helper scripts** - Verify scripts work correctly

  - Tested `next-spec-id.sh` returns proper ID format
  - Tested `move-spec.sh` moves files correctly
  - Verified error handling

- [x] **Validate templates** - Ensure templates are complete

  - Checked spec template has all required sections
  - Verified research template structure
  - Validated AGENTS.md template

- [x] **Test skill loading** - Verify skills are recognized
  - Confirmed skills directory structure
  - Validated SKILL.md format

---

## Dependencies

### Code Dependencies

_Existing files, functions, or modules this work depends on_

- None (this is the initial template setup)

### External Dependencies

_New packages or services required_

- Git (for version control)
- Bash (for helper scripts)
- Claude Code (for running skills)

---

## Implementation Notes

### Architecture Decisions

**Three-phase RPI workflow**

- Separate research, planning, and implementation phases
- Each phase with its own skill
- Fresh context per phase maintains focus

**File-based state management**

- Specs tracked by folder location and filename
- No database needed
- Simple and transparent

**Bash for automation**

- Simple, portable, customizable
- Easy for users to understand and modify
- No complex dependencies

### Patterns to Follow

**Spec naming convention**

```
{spec_id}-{kebab-case-title}-{status}.md
```

**Status progression**

```
unimplemented → implementing → completed
```

**Task priorities**

- P0: Critical (must complete)
- P1: High (should complete)
- P2: Nice to have (can defer)

### Edge Cases

- Empty queue (no specs to implement)
- Spec dependencies (one spec blocks another)
- Discovered work during implementation (create new spec)
- Test failures during implementation (Ralph Wiggum retry pattern)

### Security Considerations

- Helper scripts validate inputs
- File paths sanitized before use
- State file (.rpi/state.json) in .gitignore
- No sensitive data in specs

### Performance Considerations

- Specs stored as simple markdown files (fast I/O)
- Helper scripts use minimal dependencies
- Skills can run in parallel when independent

---

## Implementation Summary

### What Was Done

Created a complete RPI Loop Template with:

1. **Directory structure** - Organized workspace in `.rpi/`
2. **Helper scripts** - Automation for spec ID generation, movement, and commits
3. **Templates** - Markdown templates for specs, research, and AI instructions
4. **Claude Code skills** - 5 skills for the complete RPI workflow
5. **AI-ready features** - AGENTS.md, HOWTOAI.md, and Copilot instructions
6. **Documentation** - Comprehensive README and workflow guides
7. **Example spec** - This file as a reference

The template is fully functional and ready for users to clone and customize.

### Deviations from Plan

None - implementation followed the plan closely.

### New Specs Created

None - this is the initial setup.

Future users will create specs like:

- 000001-first-real-feature-unimplemented.md
- 000002-another-feature-unimplemented.md
- etc.

### Blockers Encountered

None

### Lessons Learned

**Template design insights:**

- Keep it simple - users can add complexity as needed
- Documentation is critical - multiple formats for different audiences
- Examples matter - this example spec helps users understand the format
- Skills should be conversational and example-rich
- Helper scripts should fail gracefully with clear errors

**RPI workflow insights:**

- Three-phase separation maintains focus
- Specs as contracts create clear expectations
- File-based state is transparent and debuggable
- Ralph Wiggum pattern enables autonomous iteration
- Queue management prevents scope creep

### Test Results

All verification checks passed:

- ✅ Directory structure created correctly
- ✅ Helper scripts are executable and functional
- ✅ Templates are complete and well-formatted
- ✅ Skills are properly structured
- ✅ AI-ready files created (AGENTS.md, etc.)
- ✅ Documentation is comprehensive
- ✅ Git initialized and .gitignore working

---

## Metadata

**Estimated Effort:** XL (20+ files, complete template)
**Actual Effort:** XL (as estimated)
**Implemented By:** Claude Code
**Reviewed By:** User approval via planning phase
