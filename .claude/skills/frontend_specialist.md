# Claude Skill: Frontend Specialist

Standards for implementing, reviewing, and refactoring frontend code using React 19, TypeScript 5.9+, PatternFly 6, Vite, and Vitest. Ensures production-grade code with exceptional testability, readability, and error resilience.

---

## CRITICAL: Read Project Standards Before Writing Code

**Before implementing ANY code**, read these project skill files:

1. **`.claude/skills/coding_standards.md`** — API integration rules, form patterns, shared hooks (`useCursorPagination`, `useDialogState`, `useDeleteAction`, `ConfirmationDialog`), PatternFly guidelines, i18n rules, and enum constant usage.

2. **`.claude/skills/testing_guidelines.md`** — Testing rules (userEvent over fireEvent, accessible queries, vitest-axe), coverage requirements (80%), AAA pattern, and accessibility testing at three levels.

3. **`.claude/skills/library_references.md`** — `llms.txt` URLs for React, Zod, Zustand, Vitest, Vite, and TanStack Query. **Fetch the relevant URL(s) before writing code against any of those libraries** — do not rely on training-data knowledge alone for libraries with breaking changes across major versions.

**Accessibility is mandatory in every task:** Always explicitly consider accessibility — semantics, labels, roles, keyboard interaction, focus management, and tests (Testing Library query order, `jsx-a11y`, vitest-axe). Do not ship or approve UI changes without an accessibility pass.

---

## Core Standards

### React 19

- Use functional components exclusively with proper hook patterns
- Implement proper component composition over prop drilling
- Apply memoization strategically — only when profiling indicates performance issues
- Use proper error boundaries for graceful error handling
- Prefer controlled components for forms using react-hook-form
- Follow the Single Responsibility Principle

### TypeScript

- Never use `any` types — use `unknown` and narrow with type guards
- Leverage type inference where possible, explicit types where clarity demands
- Create discriminated unions for state machines and variant types
- Use `as const` for literal type narrowing
- Leverage utility types (Partial, Pick, Omit, Record) appropriately

### PatternFly 6

- Follow PatternFly 6 component patterns and accessibility standards
- Use PatternFly's layout components (Stack, Flex, Grid) for consistent spacing. Re-usable components should never have their own baked-in margin.
- Use PF6 design tokens (`var(--pf-t--global--*)`) — never hardcoded values for spacing, colors, or icons
- Never use native HTML when a PatternFly component exists (Button, TextInput, Form, Table, Modal, Select, etc.)

### Vitest Testing

- Follow AAA pattern (Arrange-Act-Assert) for every test
- Test user behavior, not implementation details
- Use Testing Library queries in priority order: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
- Always use `userEvent.setup()` — never `fireEvent`
- Every new component must have a `vitest-axe` `toHaveNoViolations()` test
- 80% coverage threshold on all new/modified files

---

## Pre-Submission Checklist

**Before delivering any implementation, verify ALL of these. These are the issues most frequently caught in PR reviews:**

### API & Error Handling

- [ ] No raw `fetch()` — all API calls use typed clients from `client.tsx`
- [ ] `useQueryState` uses object form with `{ title, onRetry }` — use `detachPromise(query.refetch())`, not `void`
- [ ] No unsafe `as` casts on API responses — use typed responses or type guards
- [ ] Errors displayed via `ErrorState` component — no raw error markup
- [ ] Mutations use `useMutationErrorHandler` or `useFormMutationErrorHandler`

### Forms

- [ ] Forms use Zod + react-hook-form with `zodResolver` — no manual `useState` per field AKA controlled inputs
- [ ] Edit modals reset form via `useEffect` keyed on `[isOpen, item]`

### Testing

- [ ] New components have `vitest-axe` tests with `toHaveNoViolations()`
- [ ] Tests use `userEvent.setup()` — no `fireEvent`
- [ ] Tests use accessible queries — no `getByTestId`/`querySelector` when role/label queries work

### Code Organization

- [ ] No duplicated dialogs/logic — use `ConfirmationDialog`, `useDialogState`, `useDeleteAction`
- [ ] List views use `useCursorPagination` — no manual cursor state
- [ ] File/function within ESLint size limits — extraction preferred over suppression
- [ ] Enum constants from `@ansible/nexus-contracts` — no string literals for discriminators
- [ ] PF6 design tokens for spacing/colors — no hardcoded `px` values

### PR Completeness

- [ ] UI changes include screenshots or screen recordings
- [ ] New API endpoints have mock handlers in `packages/nexus-mock-api/src/handlers.ts`
- [ ] It is the responsibility of the PR creator to _prove their change works_ — not the reviewer.

---

## Implementation Workflow

1. **Read the skills** — `coding_standards.md`, `testing_guidelines.md`, and `library_references.md` (fetch the relevant `llms.txt` URLs for any library you will use)
2. **Check for reusability** — Search `src/components/` and PatternFly docs before creating new components
3. **Implement incrementally** — Happy path first, then edge cases
4. **Write tests concurrently** — Tests alongside implementation
5. **Verify accessibility** — Keyboard navigation, ARIA attributes, axe tests
6. **Run quality checks** — `npm run lint`, `npm run tsc`, `npm test`

---

## Quality Gates

Code must meet these standards before delivery:

1. Zero TypeScript errors
2. All tests pass, new tests written for new features
3. No ESLint warnings or errors
4. Prettier formatting applied
5. WCAG 2.1 AA accessibility standards met
