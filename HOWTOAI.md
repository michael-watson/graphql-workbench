# How to Use AI with This Project

This guide explains how to effectively use AI agents (like Claude Code) with the RPI Loop Template.

---

## What is the RPI Loop?

**RPI** stands for **Research-Plan-Implement** - a structured workflow for AI-assisted development that breaks complex work into manageable phases.

### Why RPI?

Traditional AI workflows often jump straight to implementation, which can lead to:
- Code that doesn't fit existing patterns
- Missed edge cases and dependencies
- Rework when requirements aren't clear
- Inconsistent architecture

The RPI Loop solves this by:
1. **Researching first** - Understanding before acting
2. **Planning deliberately** - Getting approval before coding
3. **Implementing systematically** - Following a clear roadmap

---

## The Three Phases

### Phase 1: Research

**Goal:** Understand the codebase and context before making any changes.

**What happens:**
- AI agent explores the codebase
- Identifies existing patterns and conventions
- Documents dependencies and constraints
- Asks clarifying questions
- Recommends an approach

**Human's role:**
- Describe what you want to accomplish
- Answer clarifying questions
- Approve or adjust the recommended approach

**Example:**
```
You: "I want to add user authentication to my app"

Agent: [Explores codebase]
Agent: "I found that you're using Express.js with no auth system currently.
       The user model exists in src/models/user.ts. I recommend using
       JWT tokens with passport.js. Does that sound good?"

You: "Yes, that works"
```

### Phase 2: Planning

**Goal:** Create a detailed, approved implementation plan (spec).

**What happens:**
- AI agent creates a comprehensive spec
- Breaks work into prioritized tasks (P0, P1, P2)
- Identifies testing requirements
- Documents success criteria
- Asks for your approval

**Human's role:**
- Review the plan
- Ask questions or request changes
- Approve when ready

**Example:**
```
Agent: "Here's my implementation plan:

        Priority 0 (Must have):
        - Implement JWT token generation
        - Create login/logout endpoints
        - Add authentication middleware
        - Write tests for auth flow

        Priority 1 (Should have):
        - Add refresh token mechanism
        - Add rate limiting

        This will take 3-4 hours. Approve?"

You: "Looks good, but add password reset too"

Agent: [Updates plan]
Agent: "Updated. Ready to implement?"

You: "Approved"
```

### Phase 3: Implementation

**Goal:** Execute the spec systematically with testing and iteration.

**What happens:**
- AI agent works through tasks in priority order
- Runs tests after each change
- Fixes issues autonomously (Ralph Wiggum pattern)
- Marks tasks complete as it goes
- Creates git commit when done

**Human's role:**
- Monitor progress (optional)
- Answer questions if agent gets stuck
- Review final implementation

**Example:**
```
Agent: "Starting implementation...
       ✓ JWT token generation complete
       ✓ Login endpoint created
       ✓ Tests passing
       ✗ Logout endpoint failing
       [Analyzing error...]
       ✓ Fixed - tests now passing
       ✓ Implementation complete
       ✓ Committed: 'Add User Authentication'"

You: "Great! What's next?"
```

---

## The Claude Code Skills

This template includes skills that guide the AI through each phase.

### `/rpi-research "what you want"`

Starts the research phase.

**When to use:** Beginning any new feature or change.

**Example:**
```bash
/rpi-research "Add a REST API for managing todo items"
```

### `/rpi-plan`

Starts the planning phase (after research).

**When to use:** After research is complete and you've confirmed the approach.

**Example:**
```bash
/rpi-plan
```

The agent will ask clarifying questions and create a detailed spec.

### `/rpi-implement [spec-id]`

Starts implementation of a spec.

**When to use:** After a plan is approved, or to implement any spec in the queue.

**Examples:**
```bash
/rpi-implement              # Implement the most recent spec
/rpi-implement 000003       # Implement specific spec by ID
```

### `/rpi-next`

Shows what's in the queue and offers to start the next spec.

**When to use:** After completing an implementation, or to see what's queued.

**Example:**
```bash
/rpi-next
```

### `/keep-ai-ready`

Updates AI-ready documentation after significant changes.

**When to use:** After implementing features that introduce new patterns.

**Example:**
```bash
/keep-ai-ready
```

---

## Complete Workflow Example

### Scenario: Building a New Feature

```
You: "I want to add user comments to blog posts"

Step 1: Research
You: /rpi-research "Add user comments to blog posts"

Agent: [Explores codebase]
Agent: "Found your blog post model in src/models/post.ts.
        I recommend adding a Comment model with a relationship
        to posts and users. Sound good?"

You: "Yes, and comments should support threaded replies"

Agent: "Got it. I'll include that in the plan."
       [Saves research document]

Step 2: Planning
Agent: "Ready to create implementation plan?"
You: "Yes"

Agent: [Creates detailed spec with tasks]
Agent: "Plan includes:
        - Create Comment model with parent_id for threading
        - Add API endpoints (CRUD for comments)
        - Add tests for comment operations
        - Update Post model with comment count

        Approve?"

You: "Approved"

Step 3: Implementation
Agent: [Automatically runs /rpi-implement]
Agent: "Starting implementation...
        ✓ Comment model created
        ✓ API endpoints added
        ✓ Tests passing (25/25)
        ✓ Committed changes

        Done! Spec 000008 complete."

Step 4: Next Steps
Agent: "Want to see what's next?"
You: /rpi-next

Agent: "2 specs in queue:
        1. 000009-add-comment-notifications
        2. 000010-add-markdown-support-to-comments

        Start with 000009?"

You: "Yes"

Agent: [Starts implementation]
```

---

## Tips for Success

### Be Clear About What You Want

Instead of:
> "Make the app better"

Try:
> "Add input validation to the signup form - email format and password strength"

### Let Research Happen

Don't skip the research phase. It ensures the agent understands your codebase before making changes.

### Review Plans Before Approval

The planning phase is your chance to course-correct before any code is written. Take a moment to review.

### Trust the Iteration

During implementation, the agent will run tests and fix issues. Let it iterate - that's the Ralph Wiggum pattern working.

### Use the Queue

The `/rpi-next` skill helps you maintain momentum. After one implementation finishes, keep going.

### Create Specs During Implementation

If the agent discovers new work during implementation, it will create specs for it. This keeps the current implementation focused while capturing future work.

---

## Common Workflows

### Starting a New Project

```bash
1. Clone this template
2. cd into your new project
3. Describe what you're building

Example:
You: "I'm building a REST API for a todo list app with
      user authentication and task categories"

Agent: /rpi-research [explores and plans the foundation]
Agent: [Creates specs for each major component]
Agent: [Implements them one by one]
```

### Adding to Existing Project

```bash
1. Navigate to your project
2. Describe the new feature

Example:
You: /rpi-research "Add email notifications when tasks are due"

Agent: [Explores existing task and user models]
Agent: [Plans notification system]
Agent: [Implements]
```

### Fixing a Bug

```bash
1. Describe the bug

Example:
You: /rpi-research "The search function crashes when query is empty"

Agent: [Investigates the search code]
Agent: [Plans the fix with tests]
Agent: [Implements fix]
```

### Refactoring

```bash
1. Describe what needs refactoring

Example:
You: /rpi-research "Refactor the auth middleware - it's too complex"

Agent: [Analyzes current implementation]
Agent: [Plans refactoring approach]
Agent: [Refactors with tests to ensure no behavior changes]
```

---

## Understanding Specs

Specs are the heart of the RPI Loop. They're detailed markdown documents that describe:

- **What** needs to be done (context and goals)
- **Why** it's needed (user journey and benefits)
- **How** to do it (prioritized tasks)
- **Success criteria** (how to know it's done)

### Spec Lifecycle

```
Created → to-implement/ → in-progress/ → completed/
```

### Spec Format

```markdown
# 000001: Add User Authentication

**Status:** Unimplemented
**Git Hash:** abc123...

## Context
Users need to log in to access protected features.

## Tasks

### Priority 0 (Critical)
- [ ] Implement JWT tokens
- [ ] Create login endpoint
- [ ] Add auth middleware

### Priority 1 (High)
- [ ] Add refresh tokens
- [ ] Add rate limiting

## Success Criteria
- [ ] Users can log in with email/password
- [ ] Protected routes require authentication
- [ ] All tests passing
```

### Reading Specs

Specs live in `.rpi/specs/`. You can read them anytime to understand:
- What's been done (completed/)
- What's being worked on (in-progress/)
- What's coming next (to-implement/)

---

## The Ralph Wiggum Pattern

During the **Implementation** phase, the agent uses what's called the **Ralph Wiggum pattern** - a test-driven iteration approach where the agent repeatedly runs tests and fixes issues until everything passes.

### How It Works

Named after the Simpsons character who famously said "I'm in danger!" while smiling, the Ralph pattern embodies **persistence through iteration**:

1. **Make a change** to the code
2. **Run tests** automatically
3. **If tests fail** → Analyze the failure
4. **Fix the issue** → Try again
5. **Repeat** until tests pass
6. **Move to next task**

### Why This Matters

Traditional development often involves:
- Write code → Hope it works → Debug if it doesn't

The Ralph pattern flips this:
- Write code → **Expect failures** → Learn from them → Fix → Succeed

**Failures aren't setbacks - they're feedback.** Each test failure tells the agent exactly what needs fixing.

### Example: Ralph in Action

```
Agent: "Adding login endpoint..."
Agent: "Running tests... 2 failures detected"
Agent: "Error: JWT token missing expiration"
Agent: "Fixing: Adding expiration to token config"
Agent: "Running tests... 1 failure detected"
Agent: "Error: Password validation too weak"
Agent: "Fixing: Updating password requirements"
Agent: "Running tests... All passing ✓"
Agent: "Login endpoint complete. Moving to next task."
```

The agent didn't give up after the first failure. It **persisted**, learned from each error, and kept iterating until success.

### Configuration

You control how many iterations the agent will attempt in `.rpi/config.yaml`:

```yaml
implementation:
  max_iterations: 10        # Max retry attempts (default)
  run_tests: true           # Auto-run tests (recommended)
  test_command: "npm test"  # Your test command
```

**Recommendations:**
- **Small tasks:** 10 iterations is usually enough
- **Medium tasks:** 20-50 iterations
- **Complex tasks:** 50-100 iterations
- **Trust the process:** Let the agent iterate - it learns from each attempt

### The Philosophy

Ralph teaches us that:

1. **Iteration > Perfection** - Improve through repeated attempts rather than trying to get it right the first time
2. **Failures Are Data** - Use test failures to guide fixes
3. **Persistence Wins** - Keep trying until success
4. **Testing Is Essential** - You can't iterate without feedback

When you see the agent fixing issues after test failures, that's Ralph in action. **Let it iterate** - that's the pattern working as designed.

### Autonomous Implementation with `/ralph-loop`

For fully autonomous implementation, you can use the `/ralph-loop` skill (coming soon). This runs the entire RPI cycle automatically:
- Agent researches the codebase
- Agent creates a plan
- Agent implements with Ralph pattern
- Agent commits when complete
- Zero user interaction needed after initial task description

This is useful for well-defined tasks where you trust the agent to work independently.

---

## Configuration

Adjust behavior in `.rpi/config.yaml`:

```yaml
implementation:
  max_iterations: 10        # How many times to retry on test failure
  run_tests: true           # Auto-run tests during implementation
  test_command: "npm test"  # Your test command

git:
  auto_commit: true         # Auto-commit completed specs
```

---

## Troubleshooting

### "Agent isn't following patterns"

Run `/keep-ai-ready` to update AGENTS.md with current patterns.

### "Too many specs in queue"

That's okay! Specs are a backlog. Implement what matters, archive the rest.

### "Agent is stuck during implementation"

The agent will retry (up to max_iterations). If truly stuck, it will document the blocker in the spec and move on.

### "I want to change the plan mid-implementation"

You can! Just tell the agent. It will update the spec and adjust.

---

## Best Practices

### Do:
- ✅ Describe what you want clearly
- ✅ Let research happen before planning
- ✅ Review plans before approving
- ✅ Trust the agent to iterate during implementation
- ✅ Use `/rpi-next` to maintain momentum
- ✅ Keep specs focused (one feature per spec)

### Don't:
- ❌ Skip research phase for complex work
- ❌ Approve plans you don't understand
- ❌ Try to implement multiple specs at once
- ❌ Ignore failed tests
- ❌ Let specs get too large (break them down)

---

## Advanced: Creating Specs Manually

You can create specs yourself if you prefer:

1. Get next spec ID:
   ```bash
   .rpi/scripts/helpers/next-spec-id.sh
   ```

2. Copy the spec template:
   ```bash
   cp .rpi/templates/spec-template.md \
      .rpi/specs/to-implement/000005-my-feature-unimplemented.md
   ```

3. Fill in the template

4. Update `.rpi/state.json` with the new spec ID

5. Run `/rpi-implement 000005`

---

## What Makes This Different?

### Traditional AI Coding
```
You: "Add authentication"
Agent: [Immediately writes code]
Agent: [May not fit existing patterns]
Agent: [May miss edge cases]
```

### RPI Loop
```
You: "Add authentication"
Agent: [Researches your codebase first]
Agent: [Plans approach that fits your patterns]
Agent: [Gets your approval]
Agent: [Implements systematically with testing]
Agent: [Commits when complete]
```

**Result:** Code that fits your codebase, with confidence that it's well-tested and approved.

---

## Getting Started

1. **Clone this template** for your new project
2. **Start Claude Code** in your project directory
3. **Describe what you want to build:**
   ```
   "I'm building a [type of app] that [does what]"
   ```
4. **Let the RPI Loop work:**
   - Agent researches
   - Agent plans
   - You approve
   - Agent implements
   - Repeat

---

## Questions?

### Where do I see research documents?
`.rpi/research/` - Timestamped markdown files

### Where are specs stored?
`.rpi/specs/` - Organized by status (to-implement, in-progress, completed)

### How do I know what's in the queue?
Run `/rpi-next` to see all specs waiting for implementation

### Can I implement specs in different order?
Yes! Use `/rpi-implement [spec-id]` to choose

### What if I want to skip planning?
For trivial changes, you can. But for anything non-trivial, planning saves time.

### Do I have to use git?
The template assumes git. Commits are created automatically for completed specs.

---

## Summary

The RPI Loop is:
- **Research** → Understand before acting
- **Plan** → Get approval before coding
- **Implement** → Execute systematically

Use the skills:
- `/rpi-research` to start
- `/rpi-plan` to create specs
- `/rpi-implement` to execute
- `/rpi-next` to continue

The result: Faster development, better code, fewer surprises.

Happy building! 🚀
