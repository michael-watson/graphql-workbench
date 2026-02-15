# RPI Research Skill

**Skill Name:** `rpi-research`
**Description:** Conducts thorough codebase research to gather context before planning implementation
**Phase:** Research (Phase 1 of RPI Loop)

---

## Purpose

This skill guides the AI agent through comprehensive research of the codebase to understand:
- Existing architecture and patterns
- Relevant files and dependencies
- Technical constraints and opportunities
- Open questions that need clarification

The research phase ensures that plans are well-informed and aligned with the existing codebase.

---

## When to Use

Use `/rpi-research` when:
- Starting work on a new feature or change
- User describes what they want to build or modify
- You need to understand the codebase before proposing a solution
- Beginning a new RPI loop iteration

---

## How It Works

### Input
- User's description of what they want to accomplish
- Can be a free-form prompt or reference to a requirements document

### Process
1. **Understand the Request**
   - Clarify the user's goal
   - Identify the scope of the change
   - Ask clarifying questions if needed

2. **Explore the Codebase**
   - Use Task tool with Explore agent for thorough investigation
   - Search for related files, functions, and patterns
   - Understand existing architecture
   - Identify dependencies and constraints

3. **Analyze Findings**
   - Document patterns and conventions
   - Identify technical constraints
   - Note potential challenges or risks
   - List open questions

4. **Create Research Document**
   - Use the research template from `.rpi/templates/research-template.md`
   - Fill in all sections with detailed findings
   - Save to `.rpi/research/` with timestamp
   - Include current git hash for reference

5. **Handoff to Planning**
   - Summarize key findings for the user
   - Recommend next steps
   - Offer to proceed to planning phase with `/rpi-plan`

### Output
- Research document in `.rpi/research/{timestamp}-{title}.md`
- Summary of findings
- Recommendation for planning phase

---

## Usage Examples

### Example 1: New Feature
```
User: I want to add user authentication to the app

Agent: I'll research the codebase to understand the current architecture and authentication requirements.
[Runs /rpi-research skill]
[Explores codebase for auth patterns, user models, API routes]
[Creates research document]

Agent: I've completed the research. Here are the key findings:
- The app uses Express.js with no current auth system
- User model exists in src/models/user.ts
- API routes are in src/routes/
- No session management or JWT implementation found

I recommend using JWT with passport.js based on the existing architecture.

Ready to move to planning phase? I can create a detailed spec with `/rpi-plan`.
```

### Example 2: Bug Fix
```
User: The checkout process is broken when users have discount codes

Agent: Let me research the checkout flow and discount code handling.
[Runs /rpi-research skill]
[Investigates checkout logic, discount validation, edge cases]
[Creates research document]

Agent: Research complete. I found:
- Checkout logic in src/services/checkout.ts
- Discount validation fails when expired codes are present
- No test coverage for discount edge cases

The issue is in the discount validation function at src/services/checkout.ts:line 45.

Would you like me to create an implementation plan with `/rpi-plan`?
```

---

## Research Checklist

When conducting research, ensure you:

- [ ] Understand the user's goal and success criteria
- [ ] Explore relevant parts of the codebase thoroughly
- [ ] Document existing patterns and conventions
- [ ] Identify all dependencies (code and external)
- [ ] Note technical constraints or limitations
- [ ] List security or performance considerations
- [ ] Record open questions that need answers
- [ ] Provide clear recommendations
- [ ] Get current git hash for reference
- [ ] Save research document in `.rpi/research/`

---

## Important Guidelines

### Be Thorough
- Don't rush the research phase
- Use the Task tool with Explore agent for comprehensive searches
- Read relevant files completely, not just filenames
- Understand *why* things are structured the way they are

### Ask Questions
- If the user's request is ambiguous, ask for clarification
- Document open questions in the research document
- Don't make assumptions about requirements

### Stay Focused
- Keep research relevant to the user's request
- Don't explore unrelated areas of the codebase
- Document findings concisely but completely

### Think Ahead
- Consider how the change might affect other parts of the system
- Identify potential risks or challenges early
- Note opportunities for improvement (but don't over-engineer)

---

## Research Document Format

Use the template at `.rpi/templates/research-template.md` and fill in:

1. **Executive Summary** - 2-3 paragraph overview
2. **Research Questions** - What you set out to answer
3. **Methodology** - How you conducted research
4. **Findings** - Detailed discoveries organized by category
5. **Open Questions** - Things that need clarification
6. **Recommendations** - Proposed approach and next steps
7. **References** - Links to relevant docs or resources

---

## Handoff to Planning

After research is complete:

1. Show the user a summary of findings
2. Highlight any open questions that need answers
3. Recommend an approach based on research
4. Offer to proceed to planning with `/rpi-plan`
5. Wait for user confirmation before moving forward

---

## Example Research Document Naming

```
.rpi/research/20260211-143022-add-user-authentication.md
.rpi/research/20260211-150433-fix-checkout-discount-bug.md
.rpi/research/20260212-091205-refactor-api-error-handling.md
```

Format: `{timestamp}-{kebab-case-title}.md`

---

## Tips for Effective Research

1. **Start Broad, Then Narrow**
   - Get the big picture first
   - Then dive into specific implementation details

2. **Use Task Tool Effectively**
   - Let the Explore agent do comprehensive searches
   - Specify thoroughness level based on complexity

3. **Read, Don't Just Search**
   - Open and read key files completely
   - Understand the context, not just the code

4. **Document As You Go**
   - Take notes during exploration
   - Capture insights while they're fresh

5. **Think Like a Planner**
   - Research with planning in mind
   - Identify what information the plan will need

---

## Success Criteria

Research is successful when:
- All relevant parts of the codebase are understood
- Existing patterns and conventions are documented
- Technical constraints are identified
- Open questions are clearly stated
- A clear recommendation emerges
- The research document provides everything needed for planning
- The user understands the findings and recommendations

---

## Next Steps

After research is complete, proceed to `/rpi-plan` to create a detailed implementation specification.
