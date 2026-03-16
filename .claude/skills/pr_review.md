# Claude Skill: Pull Request Review

Your goal is to review a pull request with high clarity, consistency, and alignment with the repo's standards.

---

## 1. Identify PR Scope (CRITICAL)

**Before reviewing ANY code, determine the exact changes in the PR:**

### Step 1a: Check the commit history

```bash
# See commits on current branch not in main
git log main..HEAD --oneline
```

### Step 1b: Verify file count matches PR

```bash
# For single-commit PRs, use git show
git show <commit-hash> --stat

# For multi-commit PRs, use git diff with the correct range
git diff <first-commit>^..<last-commit> --stat
```

### Step 1c: Confirm scope with user

**ALWAYS confirm:** "This PR contains X commit(s) changing Y files. Does this match what you expect?"

If the numbers don't match the GitHub PR page (e.g., GitHub shows 3 files but git diff shows 17):

- The branch may be **out of sync with main**
- Use `git show <commit>` for single-commit PRs instead
- Ask the user to clarify which commits to review

### Common Pitfalls to Avoid

| Problem                  | Cause                                                    | Solution                                              |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| Reviewing too many files | `git diff main...HEAD` includes unrelated merged commits | Use `git show <commit>` for the PR's actual commit(s) |
| Missing files            | Wrong commit range                                       | Check `git log` first to identify correct commits     |
| Stale diff               | Branch not rebased                                       | Note this to the user, review only PR commits         |

---

## 2. Load Context

Before reviewing the PR, read:

- `CLAUDE.md` (global instructions)
- Any relevant project guidelines: architecture, naming, lint, testing
- Any domain-specific instructions (e.g., Django, React, PatternFly, SOLID)

---

## 3. Validate Against Guidelines

Check whether the changes follow:

- Existing code patterns
- Repo naming conventions
- Architecture and design principles
- Error-handling standards
- Test strategy
- Security expectations
- Performance constraints

**Project-Specific:**

- Components in correct location (packages/nexus-ui/src/components/)
- Uses Base UI components as foundation for new UI
- Uses PatternFly 6 for styling and design system
- TanStack Query for server state, Zustand (useWorkflowStore) for workflow state
- No `any` types, uses generated OpenAPI types
- Workflow nodes use auto-discovery pattern (register\*.ts with default export)
- No over-engineering (avoid premature abstractions, unnecessary error handling)

---

## 4. Detect Re-invented Patterns

Ask:

- “Does this PR introduce a new pattern that already exists in the codebase?”
- “Is there duplication that should be replaced by existing helpers/modules?”
- “Is this logic available natively in a browser/Web API instead of custom code?”

Examples:

- Use URLSearchParams instead of manual query parsing
- Use structuredClone instead of manual deep copy
- Use AbortController instead of custom cancellation logic

---

## 5. Recommend Simpler / Native Alternatives

If the PR implements a complex custom solution, propose:

- A native API
- A built-in method
- A standard library replacement
- A repo-wide helper function

---

## 6. Evaluate Test Coverage

Check whether:

- The PR includes tests for critical logic
- Tests follow existing patterns
- Edge cases are covered
- The behavior is stable across browsers/devices
- The test names clearly describe intent
- E2E tests validate the full flow when needed

Generate a list of missing tests and suggested improvements.

---

## 7. Explain the Changes Back (for Documentation)

Generate a markdown summary file that explains:

- What the PR does
- Why the changes matter
- Visual diagrams when relevant
- Before/After examples
- Known tradeoffs
- Any follow-up tasks recommended

---

## 8. Validation Commands

Run these project commands:

```bash
npm test                              # All tests
npm run format:check                  # Formatting
cd packages/nexus-ui && npm run lint  # Linting
cd packages/nexus-ui && npm run tsc    # Type check
```

Then ask the user to confirm manually:

- UI works in the browser
- Forms, navigation, and modals behave as expected
- No console errors appear

---

## 9. Final Deliverables

Output should include:

1. A structured PR review
2. A list of issues to fix
3. Recommendations for simplification
4. Test coverage guidance
5. A proposed `.md` explanation file for the PR
