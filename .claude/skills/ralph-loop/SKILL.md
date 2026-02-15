# Ralph Loop Skill

**Skill Name:** `ralph-loop`
**Description:** Autonomous RPI iteration loop - keeps working until task complete
**Phase:** Full Cycle (Research → Plan → Implement, repeated autonomously)

---

## Instructions for Agent

When the user invokes `/ralph-loop`, you will execute an autonomous iteration loop that mimics the Ralph Wiggum plugin pattern.

**CRITICAL**: You MUST keep iterating in this session without exiting until the work is genuinely complete.

---

## Setup Phase

### Step 1: Get Task Description
Ask the user:
```
I'll work autonomously using Ralph loop - iterating until the task is complete.

What task would you like me to work on?

Be specific. Include:
- What you want built
- Key requirements
- Success criteria (tests, coverage, etc.)

Example: "Build a REST API for todo management with Express.js. Include
CRUD endpoints, input validation, comprehensive tests with >80% coverage,
and API documentation."
```

### Step 2: Create State File
Once you have the task, create `.rpi/.ralph-state.md`:

```markdown
---
active: true
iteration: 1
max_iterations: 50
started_at: "<ISO_TIMESTAMP>"
task: "<USER_TASK_DESCRIPTION>"
---

# Ralph Loop State

## Task
<USER_TASK_DESCRIPTION>

## Iterations Log
Will be updated as loop runs...
```

### Step 3: Confirm Start
Tell the user:
```
Starting Ralph loop...

Task: <TASK_DESCRIPTION>
Max iterations: 50 (safety limit)

I'll work autonomously through the RPI workflow:
- Research: Explore and understand
- Plan: Create implementation spec
- Implement: Execute with testing
- Iterate: Continue until complete

You'll see each iteration. I won't exit until the work is done.
```

---

## Execution Phase: The Loop

Now execute this loop **without exiting this session**:

```
iteration = 1
max_iterations = 50

WHILE iteration <= max_iterations:

    # === START ITERATION ===
    OUTPUT: "\n=== RALPH ITERATION {iteration}/{max_iterations} ===\n"

    # Update state file
    UPDATE .rpi/.ralph-state.md:
        - Set iteration: {iteration}
        - Add log entry with timestamp

    # Check current state by reading files
    research_docs = LIST files in .rpi/research/
    specs_to_implement = LIST files in .rpi/specs/to-implement/
    specs_in_progress = LIST files in .rpi/specs/in-progress/
    specs_completed = LIST files in .rpi/specs/completed/

    # Determine what phase to execute
    IF len(research_docs) == 0:
        OUTPUT: "No research found. Running /rpi-research..."
        INVOKE: /rpi-research skill
        # When research completes, continue to planning
        OUTPUT: "Research complete. Running /rpi-plan..."
        INVOKE: /rpi-plan skill

    ELSE IF len(specs_to_implement) == 0 AND len(specs_in_progress) == 0 AND len(research_docs) > 0:
        OUTPUT: "Research exists but no spec. Running /rpi-plan..."
        INVOKE: /rpi-plan skill

    ELSE IF len(specs_to_implement) > 0 OR len(specs_in_progress) > 0:
        OUTPUT: "Spec found. Running /rpi-implement..."
        INVOKE: /rpi-implement skill
        # Implementation might create new specs (discovered work)
        # That's fine - next iteration will handle them

    ELSE IF len(specs_completed) > 0 AND len(specs_to_implement) == 0 AND len(specs_in_progress) == 0:
        # All work complete!
        OUTPUT: "All specs completed. No remaining work."
        BREAK  # Exit loop

    ELSE:
        # Unexpected state - check for more work
        OUTPUT: "Checking for additional work..."
        # Use Glob/Read to verify state
        IF truly no work remaining:
            BREAK

    # === END ITERATION ===
    OUTPUT: "Iteration {iteration} complete. Continuing...\n"

    iteration += 1

# AFTER LOOP EXITS
```

---

## Key Principles

### 1. Never Exit Early
**DO NOT** exit this session until:
- ✅ Research document exists
- ✅ At least one spec created
- ✅ All specs in `completed/` folder
- ✅ No specs in `to-implement/` or `in-progress/`
- ✅ Tests passing (if applicable)
- ✅ Git commits made

### 2. Self-Referential Feedback
Each iteration, you see your own previous work:
- Research documents you created
- Specs you wrote
- Code you implemented
- Test results
- Git commits
- File modifications

**Use this to guide next actions!**

### 3. Autonomous Decision Making
**DO NOT** ask the user between iterations:
- ❌ "Should I continue?"
- ❌ "Ready for next phase?"
- ❌ "Is this okay?"

Just keep working until complete.

### 4. Handle Discovered Work
During implementation, you might discover new work needed:
- Document it in current spec's Implementation Summary
- Create a new spec for it (saved to `to-implement/`)
- **Continue the loop** - next iteration will implement it
- Don't exit just because one spec is done

### 5. Safety Limit
Max 50 iterations prevents infinite loops. If reached:
```
⚠️  Maximum iterations (50) reached.

Progress made:
- Research: {count} documents
- Specs completed: {count}
- Specs remaining: {count}

The work may be incomplete. Review the remaining specs in
.rpi/specs/to-implement/ to continue manually.
```

---

## Invoking RPI Skills

Within each iteration, invoke the appropriate RPI skill:

### Research Phase
```
INVOKE: /rpi-research
```
This will:
- Explore the codebase
- Create research document in `.rpi/research/`
- Return control to Ralph loop

### Planning Phase
```
INVOKE: /rpi-plan
```
This will:
- Review research
- Create implementation spec
- Save to `.rpi/specs/to-implement/`
- Return control to Ralph loop

### Implementation Phase
```
INVOKE: /rpi-implement
```
This will:
- Move spec to `in-progress/`
- Execute tasks
- Run tests
- Fix issues
- Commit when done
- Move spec to `completed/`
- Return control to Ralph loop

---

## Completion Detection

Check for completion after each iteration:

```python
def is_work_complete():
    research_exists = len(list_files('.rpi/research/')) > 0
    specs_to_do = len(list_files('.rpi/specs/to-implement/'))
    specs_in_prog = len(list_files('.rpi/specs/in-progress/'))
    specs_done = len(list_files('.rpi/specs/completed/'))

    if not research_exists:
        return False  # Need research

    if specs_done == 0:
        return False  # Need at least one completed spec

    if specs_to_do > 0 or specs_in_prog > 0:
        return False  # Still have work

    return True  # All work complete!
```

---

## Completion Report

When the loop exits successfully, report:

```
🎉 Ralph loop complete!

Summary:
- Total iterations: {iteration_count}
- Duration: {duration}
- Research documents: {count}
- Specs completed: {count}
- Tests: {status}
- Git commits: {count}

Work completed:
{List completed specs with titles}

All files created during this loop:
- Research: .rpi/research/
- Specs: .rpi/specs/completed/
- Code: {list key files created}
- Tests: {list test files}

The task is complete!
```

Update `.rpi/.ralph-state.md` to mark as complete:
```yaml
active: false
completed_at: "<ISO_TIMESTAMP>"
final_iteration: {N}
```

---

## Example Session

```
User: /ralph-loop

Agent: I'll work autonomously using Ralph loop - iterating until complete.

What task would you like me to work on?

User: Build a REST API for managing todo items. Include CRUD operations,
input validation, comprehensive tests with >80% coverage, and API docs.

Agent: Starting Ralph loop...

Task: Build a REST API for managing todo items...
Max iterations: 50

=== RALPH ITERATION 1/50 ===
No research found. Running /rpi-research...

[Explores codebase, understands Express.js patterns, etc.]
[Creates research document: .rpi/research/20260211-todo-api-research.md]

Research complete. Running /rpi-plan...

[Reviews research, creates detailed implementation spec]
[Saves spec: .rpi/specs/to-implement/000001-todo-api-unimplemented.md]

Iteration 1 complete. Continuing...

=== RALPH ITERATION 2/50 ===
Spec found. Running /rpi-implement...

[Moves spec to in-progress]
[Implements CRUD endpoints]
[Adds input validation with Joi]
[Adds error handling middleware]
[Creates comprehensive tests]
[Runs tests... 3 failures]
[Analyzes failures, fixes issues]
[Runs tests... all passing]
[Creates git commit]
[Moves spec to completed]

Iteration 2 complete. Continuing...

=== RALPH ITERATION 3/50 ===
All specs completed. No remaining work.

🎉 Ralph loop complete!

Summary:
- Total iterations: 3
- Research documents: 1
- Specs completed: 1
- Tests: All passing ✓
- Git commits: 1

The task is complete!
```

---

## State File Format

`.rpi/.ralph-state.md`:

```markdown
---
active: true|false
iteration: <current_iteration_number>
max_iterations: 50
started_at: "2026-02-11T14:30:00Z"
completed_at: "2026-02-11T15:45:00Z"  # when done
task: "User's original task description"
---

# Ralph Loop State

## Task
<Full task description>

## Iterations Log

### Iteration 1 - 2026-02-11T14:30:00Z
- Ran /rpi-research
- Ran /rpi-plan
- Created spec: 000001-todo-api

### Iteration 2 - 2026-02-11T14:45:00Z
- Ran /rpi-implement on spec 000001
- Tests passed
- Committed changes

### Iteration 3 - 2026-02-11T15:45:00Z
- All work complete
- Loop exiting

## Result
✅ Completed successfully
```

---

## Handling Edge Cases

### No Progress Made
If after 3 iterations nothing has been created:
```
⚠️  No progress detected after 3 iterations.

This might indicate:
- Task description unclear
- Dependencies missing
- Configuration issues

Current state:
- Research: {count} documents
- Specs: {count} total

Should I continue or do you want to adjust the task?
```

### Tests Keep Failing
If tests fail for 5+ consecutive iterations:
```
⚠️  Tests have failed for 5 iterations.

Last error:
{test_error_summary}

I'll continue trying to fix this (Ralph persists!), but you may want to:
- Review the test failures
- Check if dependencies are installed
- Verify configuration

Continuing iteration {N}...
```

### Discovered Work Exceeds Limit
If too many new specs are created:
```
ℹ️  Multiple specs discovered during implementation:
- 000002-auth-system
- 000003-rate-limiting
- 000004-api-versioning

I'll continue working through the queue...
Currently on iteration {N}/50.
```

---

## Important Rules

### DO
- ✅ Keep iterating until ALL work complete
- ✅ Invoke RPI skills autonomously
- ✅ Check file system state each iteration
- ✅ Update state file as you go
- ✅ Report progress briefly
- ✅ Handle discovered work
- ✅ Persist through test failures

### DON'T
- ❌ Exit before work is complete
- ❌ Ask user for approval between iterations
- ❌ Stop after one spec (check for more work!)
- ❌ Skip phases (always research → plan → implement)
- ❌ Give up on test failures
- ❌ Exit this session until truly done

---

## Comparison to Manual RPI

| Aspect | Manual RPI | Ralph Loop |
|--------|-----------|------------|
| Invocation | User runs `/rpi-*` each phase | Agent runs skills autonomously |
| Session | Interactive, user-paced | Continuous, agent-paced |
| Completion | User decides when done | Agent detects completion |
| Errors | User intervention needed | Agent retries automatically |
| Multi-spec | User runs `/rpi-next` | Agent continues automatically |
| Best for | Exploratory work | Well-defined tasks |

---

## Why This Works Like Ralph Plugin

The Ralph Wiggum plugin uses a **Stop hook** to prevent Claude from exiting and re-feeds the prompt.

Since we can't install hooks, this skill **acts as its own loop**:
- The skill IS the loop (not external script)
- Keeps running in the current session
- Checks own work each iteration
- Continues until genuinely complete

**Same effect, different mechanism!**

---

## Summary

`/ralph-loop` enables autonomous RPI iteration:

1. **Get task** from user
2. **Create state file** to track progress
3. **Loop continuously** in this session:
   - Check what exists
   - Run appropriate RPI skill
   - Check completion
   - Continue if not done
4. **Exit when complete** and report results

The skill keeps you (the agent) working until the task is finished, mimicking the Ralph Wiggum plugin's persistent iteration pattern.

**"Ralph is a Bash loop"** - and this skill IS that loop! 🎉
