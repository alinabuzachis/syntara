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
- Uses PatternFly 6 components for UI foundation, styling, and design system
- TanStack Query for server state, Zustand (useWorkflowStore) for workflow state
- No `any` types, uses generated OpenAPI types
- Workflow step types use auto-discovery (`register*.ts` with default export; canvas still uses React Flow nodes)
- No over-engineering (avoid premature abstractions, unnecessary error handling)

### 3a. Recurring Issues Checklist (MANDATORY)

**Run through every item in CLAUDE.md's "Common PR Mistakes — Quick Checklist" (items 1–16).** That checklist is the single source of truth. Below are review-specific verification tips:

| Search for...                                        | Flags violation of checklist item...                      |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `fetch(` in changed files                            | #1 — raw fetch (pre-auth exceptions OK)                   |
| `useQueryState` with bare string arg                 | #2 — missing `{ title, onRetry }` object form             |
| `void query.` / `void .*refetch` patterns            | #2 — use `detachPromise(query.refetch())`, not `void`     |
| `as` casts on API responses                          | #3 — unsafe casts (flag for contract fix, not more casts) |
| New component without `toHaveNoViolations()`         | #4 — missing vitest-axe test                              |
| `fireEvent` in test files                            | #5 — should use `userEvent.setup()`                       |
| `getByTestId`, `querySelector` in tests              | #6 — should use `getByRole` / `getByLabelText`            |
| Raw error JSX (`<span>Error`, `<p>Error`)            | #7 — should use `ErrorState` component                    |
| Manual `useState` per form field                     | #8 — should use Zod + react-hook-form                     |
| `useForm` with `defaultValues` in modals             | #9 — verify `reset()` in `useEffect([isOpen, item])`      |
| Copy-pasted dialogs or action handlers               | #10 — extract to shared component/hook                    |
| String literals for type discriminators              | #13 — use enum constants from `@ansible/nexus-contracts`  |
| Display strings in conditionals                      | #14 — compare API values, not translatable labels         |
| Hardcoded `px` for spacing/colors                    | #15 — use PF6 design tokens `var(--pf-t--global--*)`      |
| `void` used as operator in `.ts`/`.tsx`              | #16 — use `detachPromise(...)`, not unary `void`          |
| Native `<button>`, `<p>`, `<h1>`-`<h6>`, `<a>`, etc. | #16 — use PF6 components (see mapping table below)        |
| New route in `AppRoute.tsx` without registry entry   | #17 — add to `e2e/visual-regression/page-registry.ts`     |

**Also check these review-specific items:**

| Check                                                                          | How to verify                                                                                      |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **PR size within budget** ([PR_GUIDELINES.md](../../.github/PR_GUIDELINES.md)) | Soft limit: ≤ 500 lines / ≤ 15 files; flag if exceeded and suggest stacking                        |
| **UI PRs include screenshots**                                                 | PRs changing visible UI must include screenshots or recordings of key states                       |
| **New API endpoints have mock handlers**                                       | Check `packages/nexus-mock-api/src/handlers.ts`; note exception if backend not yet merged          |
| **Error handling consistency**                                                 | Verify `useQueryState` / `useMutationErrorHandler` — no ad-hoc try/catch with custom error display |

### HTML → PF6 Component Mapping

| Native HTML              | PF6 Replacement                                                          | Notes                                                              |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `<button>`               | `Button` (`variant="plain"` for icon-only buttons with `icon` prop)      | Always use PF6 Button for click actions                            |
| `<a>`                    | `Button variant="link"` or PatternFly `Nav` / wouter `Link`              | Use `Button variant="link"` for actions styled as links            |
| `<p>`                    | `Content component={ContentVariants.p}`                                  | Block text content                                                 |
| `<h1>`–`<h6>`            | `Title headingLevel="h1"` or `Content component={ContentVariants.h1}`    | Use `Title` for page/section headings                              |
| `<ul>` / `<ol>`          | `List` / `List component={ListComponent.ol}`                             | Structured lists                                                   |
| `<li>`                   | `ListItem`                                                               | List items inside `List`                                           |
| `<hr>`                   | `Divider`                                                                | Horizontal dividers                                                |
| `<small>`                | `Content component={ContentVariants.small}`                              | Small text                                                         |
| `<blockquote>`           | `Content component={ContentVariants.blockquote}`                         | Block quotes                                                       |
| `<pre>`                  | `Content component={ContentVariants.pre}` or `CodeBlock`                 | Preformatted text                                                  |
| `<dl>` / `<dt>` / `<dd>` | `DescriptionList` / `DescriptionListTerm` / `DescriptionListDescription` | Definition lists                                                   |
| `<span>`                 | **Keep as `<span>`**                                                     | `ContentVariants.span` does NOT exist in PF6 — use native `<span>` |
| `<code>`                 | **Keep as `<code>`**                                                     | No PF6 inline code equivalent                                      |
| `<div>`                  | **Keep as `<div>`** (or use `Flex`, `Stack`, `Card` if semantic)         | Generic containers are fine as native HTML                         |
| `<strong>` / `<em>`      | **Keep as native**                                                       | Inline emphasis — no PF6 wrapper needed                            |

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
- Use `detachPromise(...)` instead of unary `void` for intentionally unawaited promises
- Use PF6 components (`Button`, `List`, `Content`, `Title`) instead of native HTML (`<button>`, `<ul>`, `<p>`, `<h1>`)
- Use `useCursorPagination` instead of manual cursor/filter/queryParams boilerplate
- Use `ConfirmationDialog` instead of inline Modal+ModalHeader+ModalBody+ModalFooter
- Use `useDialogState` instead of manual `useState` pairs for dialog open/close
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
