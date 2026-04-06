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
- **Accessibility**: For any UI or test changes, review keyboard use, semantics, labels/roles, focus order, and color/contrast assumptions; confirm new interactive surfaces are reachable and named. Align with `jsx-a11y` / Testing Library rules and axe-style tests where the PR touches user-visible markup.

**Project-Specific:**

- Components in correct location (packages/nexus-ui/src/components/)
- Uses Base UI components as foundation for new UI
- Uses PatternFly 6 for styling and design system
- TanStack Query for server state, Zustand (useWorkflowStore) for workflow state
- No `any` types, uses generated OpenAPI types
- Workflow step types use auto-discovery (`register*.ts` with default export; canvas still uses React Flow nodes)
- No over-engineering (avoid premature abstractions, unnecessary error handling)

### 3a. Recurring Issues Checklist (MANDATORY)

These are the most commonly flagged issues from recent PR reviews. **Check every item** before completing your review:

| #   | Check                                                                                                                    | How to verify                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No raw `fetch()` calls** — all API calls use typed clients (`workflowClient`, `credentialsClient`, `authClient`, etc.) | Search for `fetch(` in changed files; flag any that aren't pre-auth                                                                                                                                                                     |
| 2   | **`useQueryState` uses object form with `onRetry`**                                                                      | Search for `useQueryState` in changed files; flag any using bare string title                                                                                                                                                           |
| 3   | **No unsafe `as` casts on API responses**                                                                                | Search for `as` type casts in changed files; flag API response casts. Note: if the contract types are wrong (e.g. `resources: unknown[]`), the fix is upstream in the OpenAPI spec — flag for contract update rather than adding a cast |
| 4   | **New components have `vitest-axe` tests**                                                                               | Check test files for `toHaveNoViolations()`; flag new components without it                                                                                                                                                             |
| 5   | **Tests use `userEvent`, not `fireEvent`**                                                                               | Search for `fireEvent` in test files; flag and suggest `userEvent.setup()`                                                                                                                                                              |
| 6   | **Tests use accessible queries**                                                                                         | Search for `getByTestId`, `querySelector`, `querySelectorAll` in tests; suggest `getByRole`/`getByLabelText`                                                                                                                            |
| 7   | **Errors use `ErrorState` component**                                                                                    | Search for raw error JSX (`<span>Error`, `<p>Error`); flag and suggest `ErrorState`                                                                                                                                                     |
| 8   | **Forms use Zod + react-hook-form**                                                                                      | Check new forms for manual `useState` per field; flag and suggest Zod schema                                                                                                                                                            |
| 9   | **Edit modals reset form on open**                                                                                       | Check `useForm` with `defaultValues` in always-rendered modals; verify `reset()` in `useEffect`                                                                                                                                         |
| 10  | **No duplicated dialog/logic patterns**                                                                                  | Check if confirm dialogs or action handlers are copy-pasted across files; suggest extraction                                                                                                                                            |
| 11  | **`useQueryState` / `useMutationErrorHandler` used consistently**                                                        | Verify error handling follows the project patterns, not ad-hoc try/catch with custom error display                                                                                                                                      |
| 12  | **PR size within budget** (see [PR_GUIDELINES.md](../../.github/PR_GUIDELINES.md))                                       | Count changed feature-code lines (soft limit: ≤ 500 lines / ≤ 15 files per PR_GUIDELINES.md); flag if exceeded and suggest stacking                                                                                                     |
| 13  | **UI PRs include screenshots or screen recordings**                                                                      | PRs that change visible UI (pages, components, layout, modals, empty states) must include screenshots or recordings of key states; reviewers should not need to stand up the full stack to verify visual output                         |
| 14  | **New API endpoints have mock API handlers**                                                                             | When a PR consumes new backend endpoints, check for corresponding mock handlers in `packages/nexus-mock-api/src/handlers.ts`; if the backend dependency is not yet merged, the PR description should note the exception                 |

---

## 4. Detect Re-invented Patterns

Ask:

- “Does this PR introduce a new pattern that already exists in the codebase?”
- “Is there duplication that should be replaced by existing helpers/modules?”
- “Is this logic available natively in a browser/Web API instead of custom code?”

Examples:

- Use typed API clients (`workflowClient`, `credentialsClient`, `authClient`) instead of raw `fetch()`
- Use `ErrorState` component instead of custom error markup
- Use `useQueryState` with `onRetry` instead of manual loading/error state management
- Use `useFormMutationErrorHandler` instead of manual 422 error parsing
- Use `getErrorMessage()` / `isConflictError()` from `apiErrors.ts` instead of manual error field checks
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
- **Accessibility**: Critical flows usable with keyboard; no obvious missing labels or confusing focus; consider a quick screen-reader or axe pass on changed screens when feasible

---

## 9. Final Deliverables

Output should include:

1. A structured PR review
2. A list of issues to fix
3. Recommendations for simplification
4. Test coverage guidance
5. A proposed `.md` explanation file for the PR
