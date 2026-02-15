# Keep AI-Ready Skill

**Skill Name:** `keep-ai-ready`
**Description:** Maintains AI-ready repository features after implementations
**Phase:** Maintenance (After implementation)

---

## Purpose

This skill ensures the AI-ready aspects of the repository stay current by:

- Updating AGENTS.md with new patterns and conventions
- Updating HOWTOAI.md with examples from implementations
- Keeping documentation aligned with code

---

## When to Use

Use `/keep-ai-ready` when:

- After completing a significant implementation
- New patterns or conventions are introduced
- Architecture changes affect how agents should work
- Documentation is outdated
- Onboarding information needs updates

---

## How It Works

### Process

1. **Analyze Recent Changes**

   - Review completed specs in `.rpi/specs/completed/`
   - Identify new patterns, conventions, or architectural changes
   - Check for security or performance patterns to document

2. **Update AGENTS.md**

   - Add new patterns to "Patterns to Follow" section
   - Update architecture overview if changed
   - Document new conventions or standards
   - Add examples from recent implementations

3. **Update HOWTOAI.md**

   - Add examples from recent successful implementations
   - Update workflow examples with lessons learned
   - Document new skills or capabilities

4. **Update Project Documentation**

   - Ensure README is current
   - Update any architecture docs
   - Check that getting started guide works

5. **Commit Updates**
   - Create commit with AI-ready updates
   - Reference specs that prompted the updates

### Output

- Updated AGENTS.md
- Updated HOWTOAI.md
- Git commit with changes

---

## Usage Examples

### Example 1: After Feature Implementation

```
User: We just added authentication. Update the AI-ready docs.

Agent: I'll update the AI-ready documentation to reflect the authentication patterns.
[Runs /keep-ai-ready skill]

[Analyzing completed specs]
- Reviewed spec 000001-add-user-authentication-completed
- Found new patterns: JWT authentication, middleware pattern
- Found new dependencies: passport.js, jsonwebtoken

[Updating AGENTS.md]
✓ Added authentication middleware pattern
✓ Documented JWT token handling
✓ Added security considerations for auth
✓ Updated file organization (new auth/ directory)

[Updating HOWTOAI.md]
✓ Added example: "Adding Authentication to an Endpoint"
✓ Updated security section with auth patterns

[Creating commit]
✓ Committed: "Update AI-ready docs for authentication patterns"

AI-ready documentation is now current with recent changes.
```

### Example 2: After Architecture Change

```
Agent: Significant refactoring was done. Updating AI guidance...

[Analyzing changes]
- API routes restructured into feature modules
- Error handling centralized
- New validation pattern introduced

[Updates]
✓ AGENTS.md: Updated architecture overview and file organization
✓ AGENTS.md: Documented new error handling pattern
✓ HOWTOAI.md: Updated examples with new patterns

All AI-ready docs updated to match new architecture.
```

---

## Update Checklist

When running `/keep-ai-ready`, check and update:

### AGENTS.md

- [ ] Architecture overview reflects current state
- [ ] New patterns are documented
- [ ] File organization is accurate
- [ ] Coding standards include new conventions
- [ ] Examples are current and relevant
- [ ] Dependencies list is up to date

### AI Rules

- [ ] Rules match current conventions
- [ ] New rules added for new patterns
- [ ] Obsolete rules removed
- [ ] Rule examples are accurate

### HOWTOAI.md

- [ ] Workflow examples include recent learnings
- [ ] Common tasks updated with current patterns
- [ ] Examples use real code from the project
- [ ] Success patterns documented
- [ ] Gotchas and pitfalls noted

### Other Documentation

- [ ] README reflects current state
- [ ] Getting started guide works
- [ ] Architecture docs are current

---

## Important Guidelines

### Be Selective

- Don't document every tiny change
- Focus on patterns that agents should follow
- Document architectural decisions, not implementation details
- Keep it concise and actionable

### Be Clear

- Use examples from actual code
- Show file paths and line numbers
- Explain _why_ patterns exist, not just _what_ they are
- Make it easy for agents to understand quickly

### Keep It Current

- Remove outdated information
- Don't let documentation accumulate cruft
- Delete obsolete patterns
- Update examples to use current code

### Think About Agents

- Write for AI consumption
- Be explicit about patterns and conventions
- Include examples that agents can follow
- Make success criteria clear

---

## What to Document in AGENTS.md

### Patterns Worth Documenting

- New architectural patterns (middleware, services, etc.)
- Authentication and authorization patterns
- Error handling conventions
- Validation patterns
- Testing patterns
- File organization conventions
- Naming conventions for specific types
- API design patterns

### Example Additions

````markdown
### Authentication Middleware Pattern

All protected routes should use the `authenticate` middleware:

```typescript
// src/routes/protected.ts
import { authenticate } from "../middleware/auth";

router.get("/api/protected", authenticate, (req, res) => {
  // req.user is available here
});
```
````

The middleware validates JWT tokens and attaches user to request.
Never implement custom auth logic in routes.

````

---

## What to Document in HOWTOAI.md

### Examples Worth Adding
- Real workflows from completed specs
- Before/after examples of refactorings
- Common pitfalls and how to avoid them
- Successful patterns from implementations
- Tips for working with this specific codebase

### Example Addition

```markdown
### Example: Adding a New API Endpoint

Based on spec 000001 (Authentication), here's the pattern for new endpoints:

1. **Define route** in `src/routes/`
   ```typescript
   // src/routes/auth.ts
   router.post('/api/auth/login', validateLoginInput, login)
````

2. **Create controller** in `src/controllers/`

   ```typescript
   // src/controllers/auth.ts
   export async function login(req, res) {
     // Implementation
   }
   ```

3. **Add validation** in `src/middleware/validation/`
4. **Write tests** in `test/routes/auth.test.ts`
5. **Update API docs** if applicable

This pattern keeps routes thin and logic in controllers.

````

---

## Timing

### When to Update

**Good times:**
- After completing a spec that introduced new patterns
- After major refactorings or architecture changes
- When onboarding reveals documentation gaps
- Every 3-5 specs as a maintenance task

**Don't update:**
- After every tiny change
- When nothing significant changed
- Just to update dates or version numbers
- When it would just add noise

### Automation

Can be automated based on config:

```yaml
ai_ready:
  update_agents_md: true  # Auto-update after each spec
  validate_ai_rules: true # Check rules are still valid
````

---

## Review Checklist

Before committing updates:

- [ ] New patterns are clearly explained
- [ ] Examples are accurate and from actual code
- [ ] Obsolete information removed
- [ ] File paths are correct
- [ ] Links work
- [ ] Examples are formatted correctly
- [ ] Documentation is concise (not verbose)
- [ ] Changes are relevant to AI agents

---

## Commit Message Format

```
Update AI-ready documentation

Updated AGENTS.md with authentication patterns from spec 000001.
Added JWT middleware pattern and security considerations.

Updated HOWTOAI.md with example workflow for protected endpoints.

Refs: spec 000001, spec 000002
```

---

## Success Criteria

Updates are successful when:

- New patterns are clearly documented
- AI agents can understand and follow new conventions
- Examples are accurate and helpful
- Obsolete information is removed
- Documentation stays concise and actionable
- Changes are committed properly

---

## Integration with RPI Loop

This skill can be:

- Run manually after implementations
- Automatically triggered based on config
- Part of spec completion checklist
- Run periodically as maintenance

The goal is to keep AI-ready documentation living and breathing alongside the code.

---

## Tips for Maintenance

### Regular Review

- Review AGENTS.md every few specs
- Check if patterns are still accurate
- Remove patterns that are no longer used
- Update examples with better ones

### Keep It Fresh

- Use recent code for examples
- Update to reflect current architecture
- Remove deprecated patterns quickly
- Don't let it become stale

### Make It Useful

- Focus on what helps agents succeed
- Document gotchas and pitfalls
- Show the "why" not just the "what"
- Include enough context

### Stay Concise

- Don't document everything
- Focus on patterns, not details
- Keep examples short
- Link to more detailed docs if needed

---

## Next Steps

After updating AI-ready documentation:

- Continue with `/rpi-next` to work on next spec
- Or start new RPI loop with `/rpi-research`
- Or take a moment to appreciate well-maintained docs!
