# RPI Plan Skill

**Skill Name:** `rpi-plan`
**Description:** Creates detailed implementation specifications based on research findings
**Phase:** Planning (Phase 2 of RPI Loop)

---

## Purpose

This skill guides the AI agent through creating a comprehensive, actionable implementation plan (spec) that:
- Defines clear success criteria
- Breaks work into prioritized tasks
- Considers testing requirements
- Identifies dependencies and constraints
- Serves as a contract for implementation

---

## When to Use

Use `/rpi-plan` when:
- Research phase is complete (after `/rpi-research`)
- You have enough context to plan implementation
- User has confirmed the approach from research
- Ready to create a detailed spec for execution

---

## How It Works

### Input
- Research document from previous phase (if available)
- User's requirements and goals
- Current codebase state

### Process

1. **Review Research Findings**
   - Read the research document from `.rpi/research/`
   - Understand constraints and recommendations
   - Review open questions from research

2. **Clarify Requirements**
   - Ask clarifying questions about design decisions
   - Use AskUserQuestion for choices between approaches
   - Confirm user preferences on implementation details
   - Get answers to any open questions from research

3. **Design Implementation Approach**
   - Plan the solution architecture
   - Break down into discrete tasks
   - Prioritize tasks (P0, P1, P2)
   - Identify testing requirements
   - Consider security and performance

4. **Create Specification**
   - Use template from `.rpi/templates/spec-template.md`
   - Generate next spec ID with `.rpi/scripts/helpers/next-spec-id.sh`
   - Get current git hash for reference
   - Fill in all sections comprehensively
   - Include task checkboxes for tracking

5. **Request User Approval**
   - Present the spec to the user
   - Explain the approach and task breakdown
   - Highlight any trade-offs or risks
   - Wait for approval before saving

6. **Save Specification**
   - Save to `.rpi/specs/to-implement/`
   - Format: `{spec_id}-{kebab-case-title}-unimplemented.md`
   - Update `.rpi/state.json` with new spec ID
   - Offer to proceed to implementation with `/rpi-implement`

### Output
- Detailed spec document in `.rpi/specs/to-implement/`
- Updated state.json with next spec ID
- User approval for implementation

---

## Usage Examples

### Example 1: Feature Planning
```
User: Yes, proceed with planning for user authentication

Agent: I'll create a detailed implementation spec based on the research.
[Runs /rpi-plan skill]
[Reviews research document]
[Asks clarifying questions about JWT expiration, refresh tokens]

Agent: I have a few questions about the implementation:

1. JWT token expiration time?
   - 15 minutes (recommended, more secure)
   - 1 hour (less frequent refreshes)
   - 24 hours (convenient but less secure)

2. Should we include refresh tokens?
   - Yes (recommended for better UX)
   - No (simpler implementation)

User: 15 minutes with refresh tokens

Agent: [Creates comprehensive spec]

Here's the implementation plan:

# 000001: Add User Authentication

**Tasks:**
- P0: Implement JWT token generation and validation
- P0: Create login/logout endpoints
- P0: Add authentication middleware
- P1: Implement refresh token mechanism
- P1: Add password hashing with bcrypt
- P2: Add rate limiting for login attempts

**Tests:**
- Unit tests for token generation/validation
- Integration tests for auth endpoints
- Security tests for password handling

Ready to implement? I can start with `/rpi-implement`.
```

### Example 2: Bug Fix Planning
```
Agent: [Reviews bug research]
The discount code validation issue is clear from research. Creating spec...

[Creates spec]

# 000002: Fix Checkout Discount Code Validation

**Tasks:**
- P0: Fix expired discount code validation
- P0: Add test for expired codes
- P1: Add test for invalid discount formats
- P1: Improve error messages

This is a focused bug fix. Approve to proceed with implementation?

User: Approved

Agent: Moving to implementation phase...
```

---

## Specification Checklist

When creating a spec, ensure it includes:

### Required Sections
- [ ] Clear title and spec ID
- [ ] Status (unimplemented) and git hash
- [ ] Context: background and user goal
- [ ] User journey: before and after states
- [ ] Success criteria (measurable)
- [ ] Tasks broken down by priority (P0, P1, P2)
- [ ] Testing tasks with specific test types
- [ ] Dependencies (code and external)
- [ ] Implementation notes with key decisions
- [ ] Architecture decisions and rationale

### Task Quality
- [ ] Each task is actionable and specific
- [ ] Tasks include file paths when relevant
- [ ] Tasks are prioritized correctly
- [ ] Testing tasks cover all new functionality
- [ ] Tasks are ordered logically (dependencies first)

### Completeness
- [ ] Security considerations addressed
- [ ] Performance implications considered
- [ ] Edge cases identified
- [ ] Breaking changes noted
- [ ] Migration needs documented

---

## Important Guidelines

### Be Specific
- Tasks should be concrete, not vague
- Include file paths and function names when known
- Provide enough detail for implementation

### Prioritize Correctly
- **P0 (Critical)**: Must be done for spec to be complete
- **P1 (High)**: Should be done but can be deferred if blocked
- **P2 (Nice to Have)**: Can be moved to future spec if needed

### Think About Testing
- Every P0 task should have corresponding tests
- Include unit, integration, and manual testing
- Specify what should be tested, not just "add tests"

### Consider the Future
- Note potential breaking changes
- Document migration needs
- Identify follow-up work (but don't include it in this spec)

### Ask Questions
- Use AskUserQuestion for design decisions
- Don't assume user preferences
- Clarify ambiguous requirements

---

## Spec Naming Convention

```
{spec_id}-{kebab-case-title}-{status}.md
```

### Examples
```
000001-add-user-authentication-unimplemented.md
000002-fix-checkout-discount-bug-unimplemented.md
000003-refactor-api-error-handling-unimplemented.md
```

### Status Values
- `unimplemented` - Spec is planned but not started
- `implementing` - Currently being implemented
- `completed` - Implementation finished and committed

---

## Generating Spec ID

Use the helper script to get the next ID:

```bash
.rpi/scripts/helpers/next-spec-id.sh
```

This reads `.rpi/state.json` and returns the next sequential ID with leading zeros.

---

## Getting Git Hash

Include the current git hash in the spec for reference:

```bash
git rev-parse HEAD
```

This allows the spec to reference the state of the repo when it was created.

---

## User Approval Process

1. **Present the Spec**
   - Show the user the key sections
   - Highlight the approach and task breakdown
   - Explain priorities and trade-offs

2. **Explain Trade-offs**
   - Discuss any alternative approaches
   - Explain why the recommended approach was chosen
   - Note any risks or challenges

3. **Get Explicit Approval**
   - Wait for user to approve the plan
   - Don't proceed to implementation without approval
   - Be ready to revise based on feedback

4. **Save and Handoff**
   - Save spec to to-implement folder
   - Update state.json
   - Offer to start implementation

---

## Example Questions to Ask During Planning

### Architecture Decisions
- "Should we use X library or Y library?"
- "Should this be a separate service or part of the existing API?"
- "Should we use REST or GraphQL for this endpoint?"

### Implementation Details
- "How should we handle errors in this flow?"
- "What should happen if the external API is unavailable?"
- "Should we add feature flags for gradual rollout?"

### User Experience
- "What should the loading state look like?"
- "How should we display validation errors?"
- "Should this action require confirmation?"

### Testing & Validation
- "What level of test coverage do you want?"
- "Should we add manual testing checklist?"
- "Are integration tests with external APIs needed?"

---

## Updating State

After creating a spec, update `.rpi/state.json`:

```json
{
  "version": "1.0.0",
  "last_spec_id": 1,
  "specs": [
    {
      "id": "000001",
      "title": "add-user-authentication",
      "status": "unimplemented",
      "created_at": "2026-02-11T14:30:00Z"
    }
  ],
  "updated_at": "2026-02-11T14:30:00Z"
}
```

---

## Success Criteria

Planning is successful when:
- Spec is comprehensive and actionable
- All tasks are specific and prioritized
- Testing requirements are clear
- User understands and approves the plan
- Spec provides everything needed for implementation
- Dependencies and constraints are documented
- Spec is saved in to-implement folder
- State is updated correctly

---

## Next Steps

After planning is approved, proceed to `/rpi-implement` to execute the spec.

If additional research is needed, return to `/rpi-research` before continuing.
