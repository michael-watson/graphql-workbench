# RPI Implement Skill

**Skill Name:** `rpi-implement`
**Description:** Executes implementation specs with autonomous iteration and testing
**Phase:** Implementation (Phase 3 of RPI Loop)

---

## Purpose

This skill guides the AI agent through executing an implementation spec:

- Works through prioritized tasks systematically
- Uses Ralph Wiggum iteration pattern for autonomous problem-solving
- Runs tests and fixes issues until all tasks are complete
- Creates new specs for discovered work
- **MUST fill Implementation Summary and move spec to completed folder**
- Commits changes when complete

---

## When to Use

Use `/rpi-implement` when:

- A spec has been approved and is in to-implement folder
- User is ready to execute the implementation
- Following a completed planning phase

---

## How It Works

### Input

- Spec file from `.rpi/specs/to-implement/` or `.rpi/specs/in-progress/`
- Can accept spec ID or spec file path

### Process

1. **Prepare for Implementation**

   - Read the spec file completely
   - Move spec to in-progress folder with status "implementing"
   - Create task list from spec tasks
   - Understand success criteria and dependencies

2. **Execute Tasks in Priority Order**

   - Start with P0 (Critical) tasks
   - Complete each task fully before moving to next
   - Follow existing code patterns and conventions
   - Mark tasks as complete [x] in the spec file as you go

3. **Ralph Wiggum Iteration Pattern**

   - After implementing each major change, run tests
   - If tests fail, analyze and fix the issue
   - Retry tests (up to max_iterations from config)
   - Continue until tests pass
   - Don't move to next task until current one is solid

4. **Handle Discovered Work**

   - If new work is discovered during implementation
   - Document it in the current spec's Implementation Summary
   - Create a new spec for it (in to-implement folder)
   - Don't implement discovered work in this iteration
   - Stay focused on the current spec

5. **Testing**

   - Run tests after each P0 task completion
   - Run full test suite after all P0 tasks complete
   - Run tests again after P1 tasks
   - Fix any regressions immediately

6. **Complete the Spec**

   - Mark all completed tasks with [x]
   - Fill in Implementation Summary section
   - Document any deviations from plan
   - List any new specs created
   - Note blockers encountered and resolutions

7. **Commit Changes**

   - Use `.rpi/scripts/helpers/git-commit-spec.sh`
   - Commit message includes spec title and summary
   - Includes Co-Authored-By tag for Claude

8. **Finalize (REQUIRED)**
   - **CRITICAL: Fill in Implementation Summary section completely**
   - **CRITICAL: Move spec to completed folder with status "completed"**
   - Update state.json
   - Suggest running `/rpi-next` to continue with next spec

**IMPORTANT:** Steps 6-8 are REQUIRED. Implementation is NOT complete until:

- Implementation Summary is filled in
- Spec is committed with git-commit-spec.sh
- Spec is moved to completed folder

### Output

- Fully implemented spec
- All tests passing
- **Implementation Summary filled in completely**
- Git commit with changes
- **Spec moved to completed folder**
- Optional: New specs for discovered work

---

## CRITICAL: BEFORE YOU FINISH

**DO NOT consider implementation complete until ALL of these are done:**

1. **Fill in Implementation Summary section** in the spec file with:

   - What Was Done (summary of changes)
   - Deviations from Plan (if any)
   - New Specs Created (if any)
   - Blockers Encountered (if any)
   - Test Results

2. **Commit the changes** using:

   ```bash
   .rpi/scripts/helpers/git-commit-spec.sh <spec-file-path>
   ```

3. **Move spec to completed folder** using:
   ```bash
   .rpi/scripts/helpers/move-spec.sh \
     .rpi/specs/in-progress/XXXXX-spec-implementing.md \
     completed \
     completed
   ```

**If you don't do these steps, the spec will be left in limbo!**

---

## Usage Examples

### Example 1: Feature Implementation

```
User: Implement the authentication spec

Agent: I'll implement spec 000001-add-user-authentication
[Runs /rpi-implement skill]
[Moves spec to in-progress]
[Creates task list]

Agent: Starting implementation of user authentication...

[Task 1] Implementing JWT token generation...
✓ Created auth utility in src/utils/jwt.ts
✓ Added token generation function
✓ Added token validation function
✓ Tests passing

[Task 2] Creating login/logout endpoints...
✓ Added POST /api/auth/login
✓ Added POST /api/auth/logout
✓ Tests passing

[Task 3] Adding authentication middleware...
✓ Created middleware/auth.ts
✓ Added to protected routes
✓ Tests passing

[Tests] Running full test suite...
✗ Test failed: Token expiration not handled correctly

[Fix] Updating token validation to handle expiration...
✓ Fixed expiration check
✓ Tests now passing

[Implementation complete]
- All P0 tasks completed
- All P1 tasks completed
- All tests passing

[Filling Implementation Summary]
✓ Updated spec with what was done
✓ Documented deviations from plan
✓ Listed new specs created
✓ Added test results

[Creating commit]
✓ Committed using git-commit-spec.sh: "Add User Authentication"

[Moving to completed]
✓ Moved spec from in-progress to completed folder
✓ Updated state.json

[Discovered work]
Created new spec: 000004-add-rate-limiting-to-auth

Spec 000001 is complete! Run `/rpi-next` to continue with the next spec.
```

### Example 2: Bug Fix Implementation

```
Agent: Implementing bug fix for discount codes...
[Runs /rpi-implement on spec 000002]

[Task 1] Fixing expired discount validation...
✓ Updated src/services/checkout.ts:45
✓ Added expiration check before applying discount

[Task 2] Adding test for expired codes...
✓ Created test/checkout.test.ts
✓ Test covers expired code scenario

[Running tests]
✓ All tests passing

[Finalizing]
✓ Filled Implementation Summary
✓ Committed using git-commit-spec.sh: "Fix Checkout Discount Code Validation"
✓ Moved spec to completed folder

Spec 000002 complete! Ready for next spec.
```

---

## Implementation Checklist

During implementation, ensure you:

- [ ] Read the entire spec before starting
- [ ] Move spec to in-progress folder
- [ ] Execute tasks in priority order (P0 → P1 → P2)
- [ ] Follow existing code patterns and conventions
- [ ] Write or update tests for each P0 task
- [ ] Run tests after each major change
- [ ] Fix issues before moving to next task
- [ ] Mark tasks complete [x] as you go
- [ ] Create new specs for discovered work

**REQUIRED BEFORE FINISHING:**

- [ ] **Fill in Implementation Summary section completely**
- [ ] **Commit changes using git-commit-spec.sh**
- [ ] **Move spec to completed folder using move-spec.sh**

---

## Important Guidelines

### Stay Focused

- Complete the current spec before starting new work
- Don't get distracted by nice-to-have improvements
- If you discover new work, create a spec for it but don't implement now
- Follow the spec's priorities strictly

### Ralph Wiggum Iteration

- Test frequently (after each major change)
- Fix issues immediately when found
- Don't move forward with failing tests
- Iterate until tests pass
- Max iterations from config (default: 10)

### Code Quality

- Follow existing patterns in the codebase
- Maintain consistent style
- Don't over-engineer
- Keep changes focused on the spec
- Write clear, maintainable code

### Testing

- Write tests for all new functionality (P0)
- Update existing tests if behavior changes
- Run full test suite before completion
- Fix any regressions immediately
- Manual testing for UI changes

### Error Handling

- If you encounter a blocker, document it in the spec
- Try alternative approaches (Ralph Wiggum pattern)
- If truly blocked, note it in Implementation Summary
- Create new spec for blocked work if needed

---

## Task Execution Pattern

### For Each Task:

1. **Read task details**

   - Understand what needs to be done
   - Check file paths mentioned
   - Review any constraints

2. **Implement the change**

   - Write code following existing patterns
   - Keep changes minimal and focused
   - Add comments only where needed

3. **Write/update tests**

   - Add tests for new functionality
   - Update tests for changed behavior
   - Ensure test coverage

4. **Run tests**

   - Run relevant tests for this change
   - Fix any failures
   - Iterate until passing

5. **Mark complete**
   - Update checkbox in spec file [x]
   - Move to next task

---

## Handling Discovered Work

When you discover additional work during implementation:

### Document It

```markdown
## Implementation Summary

### New Specs Created

- **000004-add-rate-limiting-to-auth** - Discovered need for rate limiting
  on login endpoint to prevent brute force attacks
```

### Create a New Spec

1. Use `/rpi-plan` to create a proper spec for the discovered work
2. Or create a quick spec directly in to-implement folder
3. Make sure it has a proper spec ID and format

### Don't Implement It Now

- Stay focused on current spec
- Note it in Implementation Summary
- Let it become a future RPI iteration

---

## Testing Strategy

### Unit Tests

- Test individual functions and methods
- Mock external dependencies
- Fast and focused

### Integration Tests

- Test how components work together
- Use real dependencies when possible
- Cover critical user flows

### Manual Testing

- For UI changes, test in browser/app
- Check edge cases and user experience
- Verify accessibility if relevant

### Running Tests

Check config.yaml for test command:

```yaml
implementation:
  test_command: "npm test"
```

Run tests frequently during implementation.

---

## Commit Process

### When to Commit

- After spec is fully implemented
- All tests are passing
- Implementation Summary is complete

### Using git-commit-spec.sh

```bash
.rpi/scripts/helpers/git-commit-spec.sh .rpi/specs/completed/000001-add-user-authentication-completed.md
```

This creates a commit with:

- Title from spec filename
- Summary from Implementation Summary section
- Spec ID reference
- Co-Authored-By tag

### Commit Message Format

```
Add User Authentication

Implemented JWT-based authentication with login/logout endpoints,
authentication middleware, and comprehensive test coverage.

Added refresh token mechanism for better UX. Tests cover token
generation, validation, expiration, and endpoint security.

Spec ID: 000001

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

---

## Moving Specs Between Folders

### Start Implementation

```bash
.rpi/scripts/helpers/move-spec.sh \
  .rpi/specs/to-implement/000001-add-user-authentication-unimplemented.md \
  in-progress \
  implementing
```

### Complete Implementation

```bash
.rpi/scripts/helpers/move-spec.sh \
  .rpi/specs/in-progress/000001-add-user-authentication-implementing.md \
  completed \
  completed
```

---

## Implementation Summary Template

Fill this in at the end of implementation:

```markdown
## Implementation Summary

### What Was Done

- Implemented JWT authentication with login/logout endpoints
- Added authentication middleware for protected routes
- Implemented refresh token mechanism
- Added comprehensive test coverage

### Deviations from Plan

- Used bcrypt instead of argon2 (better Node.js support)
- Added rate limiting (not in original plan but needed for security)

### New Specs Created

- **000004-add-rate-limiting-to-auth** - Rate limiting for auth endpoints

### Blockers Encountered

- None

### Lessons Learned

- Refresh token implementation more complex than expected
- Test coverage for edge cases critical for auth
- Consider rate limiting from the start for security features

### Test Results

- All unit tests passing (28/28)
- All integration tests passing (12/12)
- Manual testing completed successfully
```

---

## Success Criteria

Implementation is successful when ALL of these are true:

- All P0 tasks are completed
- All P1 tasks are completed (or moved to new spec)
- All tests are passing
- No regressions introduced
- Code follows existing patterns
- **Implementation Summary is filled in completely**
- **Spec is committed to git using git-commit-spec.sh**
- **Spec is moved to completed folder using move-spec.sh**

**NOTE:** If you skip the last 3 steps, the implementation is INCOMPLETE!

---

## Next Steps

After implementation is complete:

- Run `/rpi-next` to view and start the next spec
- Or describe new work to start a new RPI loop with `/rpi-research`

---

## Configuration

Implementation behavior is controlled by `.rpi/config.yaml`:

```yaml
implementation:
  max_iterations: 10 # Max retry attempts
  run_tests: true # Auto-run tests
  test_command: "npm test" # Test command

git:
  auto_commit: true # Auto-commit on completion
```

Adjust these settings based on project needs.
