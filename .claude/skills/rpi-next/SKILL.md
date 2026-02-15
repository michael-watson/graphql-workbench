# RPI Next Skill

**Skill Name:** `rpi-next`
**Description:** Lists specs in the queue and starts the next implementation
**Phase:** Queue Management (Between RPI iterations)

---

## Purpose

This skill helps manage the RPI loop by:
- Showing specs waiting to be implemented
- Ordering specs by priority (oldest first by default)
- Starting implementation of the next spec
- Providing context on what's queued

---

## When to Use

Use `/rpi-next` when:
- You've completed an implementation and want to continue
- You want to see what specs are queued for implementation
- You're ready to start the next RPI iteration
- You want to choose which spec to implement next

---

## How It Works

### Process

1. **List Specs in Queue**
   - Read all specs from `.rpi/specs/to-implement/`
   - Sort by spec ID (oldest first)
   - Display summary of each spec

2. **Show Spec Details**
   - Spec ID
   - Title
   - Created date
   - Brief description (from Context section)
   - Priority/Complexity estimate

3. **Offer to Start Next**
   - Recommend starting with oldest spec (lowest ID)
   - Allow user to choose a different spec
   - Confirm before starting implementation

4. **Start Implementation**
   - If user approves, run `/rpi-implement` on selected spec
   - If user declines, wait for further instructions

### Output
- List of specs in to-implement queue
- Recommendation for next spec
- Optional: Start implementation

---

## Usage Examples

### Example 1: View Queue
```
User: /rpi-next

Agent: Here are the specs ready for implementation:

📋 **Specs in Queue** (3 total)

1. **000003-add-password-reset-flow** (Created: 2026-02-11)
   - Context: Users need ability to reset forgotten passwords
   - Estimated effort: Medium
   - Status: Unimplemented

2. **000004-add-rate-limiting-to-auth** (Created: 2026-02-11)
   - Context: Prevent brute force attacks on authentication endpoints
   - Estimated effort: Small
   - Status: Unimplemented

3. **000005-add-oauth-providers** (Created: 2026-02-12)
   - Context: Support login with Google and GitHub
   - Estimated effort: Large
   - Status: Unimplemented

---

**Recommendation:** Start with spec 000003 (oldest, follows natural priority)

Would you like me to implement spec 000003?
```

### Example 2: Start Next Implementation
```
User: Yes, implement it

Agent: Starting implementation of spec 000003-add-password-reset-flow...
[Switches to /rpi-implement skill]
[Continues with implementation]
```

### Example 3: Empty Queue
```
User: /rpi-next

Agent: 📋 **Specs in Queue** (0 total)

No specs are currently waiting for implementation. Great job!

Would you like to:
1. Start a new RPI loop with `/rpi-research "your idea"`
2. Review completed specs in `.rpi/specs/completed/`
3. Continue working on the codebase
```

---

## Spec Queue Display Format

For each spec in queue, show:

```
{spec_number}. **{spec_id}-{title}** (Created: {date})
   - Context: {brief_context_summary}
   - Estimated effort: {S/M/L/XL}
   - Status: {status}
   - Dependencies: {blocking_specs_if_any}
```

---

## Sorting and Prioritization

### Default Sort Order
- By spec ID (oldest first)
- Rationale: Earlier specs often provide foundation for later ones

### Alternative Sorting
Can optionally sort by:
- Estimated effort (quick wins first)
- Dependencies (unblocked specs first)
- User priority (if specified in spec metadata)

### Showing Dependencies
- Highlight specs that are blocked by others
- Warn if a spec depends on incomplete work
- Suggest implementing dependencies first

---

## Choosing Which Spec to Implement

### Factors to Consider

1. **Natural Order**
   - Oldest specs first (lowest ID)
   - Often makes sense for architecture

2. **Dependencies**
   - Implement foundation specs before dependent ones
   - Check "Depends on" field in specs

3. **Quick Wins**
   - Small specs can provide momentum
   - Bug fixes might be urgent

4. **User Priority**
   - Ask user if they have a preference
   - Some features may be more urgent

### Example Questions
```
The queue shows 3 specs. The oldest is a medium-sized feature,
but there's a quick bug fix (000004) that might be more urgent.

Would you like to:
1. Follow natural order (000003)
2. Knock out the quick bug fix first (000004)
3. Choose a different spec
```

---

## Handling In-Progress Specs

If there are specs in `.rpi/specs/in-progress/`:

```
⚠️ **Found specs in progress:**

- **000002-refactor-api-routes** (In Progress)
  - Last updated: 2 hours ago
  - Warning: Incomplete implementation

Would you like to:
1. Resume work on 000002
2. Start a different spec
3. Review what's blocking 000002
```

---

## Integration with State

Read from `.rpi/state.json` to show:
- Total specs created
- Specs completed
- Success rate
- Recent activity

```
📊 **RPI Loop Stats**
- Total specs created: 5
- Completed: 2
- In progress: 0
- In queue: 3
- Success rate: 100%
```

---

## Interactive Mode

Can optionally show more detail:

```
User: Tell me more about spec 000004

Agent: [Reads spec file]

# 000004: Add Rate Limiting to Auth

**Context:**
Discovered during authentication implementation (spec 000001) that login
endpoints are vulnerable to brute force attacks. Need to add rate limiting.

**Tasks:**
- P0: Add rate limiting middleware using express-rate-limit
- P0: Apply to /api/auth/login endpoint
- P0: Add tests for rate limit behavior
- P1: Add rate limit headers to responses
- P1: Make rate limits configurable

**Estimated effort:** Small (2-3 hours)
**Dependencies:** None (000001 already complete)

Ready to implement this spec?
```

---

## Filtering Options

Optional filtering for power users:

```
/rpi-next --filter small    # Show only small specs
/rpi-next --filter p0       # Show only critical specs
/rpi-next --filter unblocked # Show only specs with no dependencies
```

---

## Success Criteria

This skill is successful when:
- User clearly sees what's in the queue
- Specs are presented with enough context to choose
- User understands dependencies and priorities
- Smooth transition to implementation phase
- User feels in control of what to work on next

---

## Tips for Queue Management

### Keep Queue Small
- Don't create too many specs ahead of time
- Create specs just-in-time during implementation
- 3-5 specs in queue is usually sufficient

### Prioritize Ruthlessly
- P0 specs should be truly critical
- P2 specs might never get done (and that's okay)
- Move low-priority specs to a backlog if needed

### Update Stale Specs
- If a spec is old, review if it's still relevant
- May need to update based on recent changes
- Consider archiving obsolete specs

### Communicate Progress
- Show users what's done and what's next
- Celebrate completions
- Set expectations for remaining work

---

## Next Steps

After reviewing the queue:
- Start implementation with `/rpi-implement {spec_id}`
- Start a new RPI loop with `/rpi-research "new idea"`
- Review or update existing specs
- Take a break (you've earned it!)

---

## Example Full Session

```
User: I just completed the authentication work. What's next?

Agent: Great! Let me check the queue...
[Runs /rpi-next]

📋 **Specs in Queue** (2 total)

1. **000003-add-password-reset-flow**
   - Estimated effort: Medium
   - Builds on the auth work you just completed

2. **000004-add-rate-limiting-to-auth**
   - Estimated effort: Small
   - Quick security improvement

📊 **Your Progress**
- Completed: 2 specs (Authentication, Bug fixes)
- In queue: 2 specs
- You're on a roll! 🚀

**Recommendation:** Knock out the quick rate limiting (000004), then
tackle password reset (000003).

Start with rate limiting?

User: Yes

Agent: [Starts /rpi-implement 000004]
```
