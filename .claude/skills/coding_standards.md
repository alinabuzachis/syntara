# Coding Standards

Detailed code examples and patterns for this project. Referenced from CLAUDE.md's condensed checklist.

---

## 1. Always Use Typed API Clients — Never Raw `fetch()`

Every API endpoint has a type-safe client generated from OpenAPI contracts. Raw `fetch()` bypasses auth middleware (token refresh, 401 retry), error interceptors, base URL configuration, and TypeScript type safety.

```typescript
// ❌ BAD
const response = await fetch(`/api/v1/credentials/${id}/workflows`, {
  headers: { Authorization: `Bearer ${token}` },
})
const data = (await response.json()) as { id: string; name: string }[]

// ✅ GOOD
const { data } = credentialsClient.useQuery('get', '/credentials/{credential_id}/workflows', {
  params: { path: { credential_id: id } },
})
```

**Exception**: Pre-auth calls (e.g., fetching OIDC providers before login) where no token exists may use `fetch()` with a comment explaining why.

---

## 2. `useQueryState` — Always Use Object Form with `onRetry`

Prefer the object form with explicit `onRetry` for consistency and clear retry intent. The string form still works (it falls back to `refetch`), but should be avoided in new code.

```typescript
// ❌ BAD
const queryState = useQueryState(query, 'Error loading credentials')

// ✅ GOOD
const queryState = useQueryState(query, {
  title: 'Error loading credentials',
  onRetry: () => detachPromise(query.refetch()),
})
```

---

## 3. Never Use Unsafe `as` Casts on API Responses

The typed API client already returns properly typed data. If the response type doesn't match, fix the root cause (contract or types), or use a type guard.

```typescript
// ❌ BAD
const credentials = data?.resources as Credential[]

// ✅ GOOD — use the typed response directly
const { data } = credentialsClient.useQuery('get', '/credentials')
const credentials = data?.resources // Already typed as Credential[]

// ✅ GOOD — if narrowing is needed, use a type guard
function isCredentialArray(value: unknown): value is Credential[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'object' && v !== null && 'id' in v)
}
```

---

## 4. Always Use `ErrorState` Component — Never Raw Error Markup

The project has a standard `ErrorState` component that handles retryable errors, displays consistent UI, and shows a retry button automatically for 5xx errors.

```typescript
// ❌ BAD
{error && <span>Unable to load profile information.</span>}

// ✅ GOOD
<ErrorState
  title="Unable to load profile"
  message={error}
  onRetry={() => detachPromise(refetch())}
/>
```

---

## 5. Always Use Zod + react-hook-form for Forms

Never use manual `useState` per field with hand-written validation. The project standard is Zod schemas with `zodResolver` and `useFormMutationErrorHandler` for automatic 422 field error mapping.

```typescript
// ❌ BAD
const [name, setName] = useState('')
const [errors, setErrors] = useState({})
function validate() {
  if (!name) setErrors({ name: 'Required' })
}

// ✅ GOOD
const schema = z.object({ name: z.string().min(1, 'Required') })
const { register, handleSubmit } = useForm<FormData>({
  resolver: zodResolver(schema, undefined, { mode: 'sync' }),
})
```

### Step form (with Zod)

1. Create a schema file next to your form: `myNodeFormSchema.ts` — define shape and validation with `z.object()` (use `.superRefine()` for conditional rules, or `z.discriminatedUnion()` for executor-type-style forms). Export the schema and `type MyFormData = z.infer<typeof myNodeFormSchema>`. Import `z` from `'zod'`.
2. For optional number fields use `optionalNumber` from `src/routes/builder/node-forms/shared/formSchemaUtils` so empty `valueAsNumber` inputs (NaN) validate
3. In form component: `useForm<MyFormData>({ resolver: zodResolver(myNodeFormSchema, undefined, { mode: 'sync' }), defaultValues })` — import `zodResolver` from `./shared/formSchemaUtils`
4. Use `useFormMutationErrorHandler(setError)` for API 422 field errors; Zod handles client-side only. See: [`docs/error-handling.md`](../../docs/error-handling.md) - "Client-side validation (Zod + @hookform/resolvers)"

---

## 6. Handle `defaultValues` Reset for Edit Modals

When a form modal is always rendered (not unmounted), `defaultValues` only applies on first mount.

```typescript
// ❌ BAD — stale data on re-open
const { register } = useForm({ defaultValues: { name: item?.name ?? '' } })

// ✅ GOOD — reset when modal opens
const { register, reset } = useForm({ defaultValues: { name: '' } })

useEffect(() => {
  if (isOpen) {
    reset({ name: item?.name ?? '', description: item?.description ?? '' })
  }
}, [isOpen, item, reset])
```

---

## 7. Extract Shared UI Patterns — Avoid Duplication

```typescript
// ❌ BAD — same dialog copy-pasted in 3 files
// Credentials.tsx: 50 lines of disable dialog JSX
// CredentialDetail.tsx: 50 lines of nearly identical JSX

// ✅ GOOD — shared component + hook
<DisableCredentialDialog credential={selected} isOpen={isOpen} onClose={onClose} />
const { handleToggle, handleDelete } = useCredentialActions(credential)
```

### Pattern Recognition Checklist

| Pattern Detected                      | Action Required                                 |
| ------------------------------------- | ----------------------------------------------- |
| **Repeated JSX structure** (2+ times) | → Create a **Component**                        |
| **Repeated logic/state** (2+ times)   | → Create a **Hook**                             |
| **Repeated utility functions**        | → Create a **shared utility**                   |
| **Similar components with variants**  | → Extend existing component with props/variants |

### Code Review: Spotting Abstraction Opportunities

**CRITICAL: Before implementing new features or during code review, actively look for patterns that indicate abstraction opportunities.**

#### JSX Repetition → Component

**Signs you need a component:**

- Same JSX structure appears in multiple files
- Copy-pasted markup with minor variations
- Similar styling patterns repeated

```tsx
// ❌ BAD: Repeated JSX pattern
<div className="glass rounded-lg p-4">
  <h3 className="text-lg font-bold">{title1}</h3>
  <p className="text-white/60">{description1}</p>
</div>
<div className="glass rounded-lg p-4">
  <h3 className="text-lg font-bold">{title2}</h3>
  <p className="text-white/60">{description2}</p>
</div>

// ✅ GOOD: Extract to component
<InfoCard title={title1} description={description1} />
<InfoCard title={title2} description={description2} />
```

#### Logic Repetition → Hook

**Signs you need a hook:**

- Same useState + useEffect pattern repeated
- Identical data fetching logic
- Common event handling patterns
- Shared form validation logic

```tsx
// ❌ BAD: Repeated logic in multiple components
const [search, setSearch] = useState('')
const fuse = new Fuse(items, { keys: ['name'] })
const filtered = search ? fuse.search(search).map((r) => r.item) : items

// ✅ GOOD: Extract to hook
const { search, setSearch, items: filtered } = useFuse(items, ['name'])
```

#### Review Questions to Ask

When reviewing code, always ask:

1. **"Have I seen this JSX pattern before?"**
   - Search codebase for similar structures
   - Check if a PatternFly component or existing app component already exists
   - Consider if it should be an app-specific component or use PatternFly directly

2. **"Is this logic reusable?"**
   - Would other components benefit from this?
   - Is there already a hook for this in the codebase?
   - Should this be extracted to a shared hook?

3. **"Can I extend an existing component?"**
   - Does a similar component exist with different variants?
   - Can I add a prop instead of creating new component?
   - Would PatternFly variants or modifiers solve this?

#### Migration Triggers

Proactively identify migration opportunities:

```text
Codebase Search Patterns:
- Search for duplicate className patterns
- Look for repeated useState/useEffect combinations
- Find similar component structures across routes
- Check for copy-pasted utility functions
```

**When to extract to shared components:**

- Component used in 2+ unrelated features
- Hook provides generic, reusable functionality
- Pattern is not domain-specific to nexus-ui

### Shared Hooks Available

- `useCursorPagination(options?)` — cursor state + filters + queryParams + footer props
- `useCursorReset(itemCount, hasActiveFilters, cursor, isFetching, setCursor)` — reset to page 1
- `useDialogState<T>()` — dialog open/close state with associated item
- `useDeleteAction(options)` — delete mutation with success/error alerts
- `ConfirmationDialog` — reusable confirm/cancel modal (`src/components/ConfirmationDialog.tsx`)

### List Page Standard Pattern

```typescript
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import { useDeleteAction } from '../../hooks/useDeleteAction'
import { ConfirmationDialog } from '../../components/ConfirmationDialog'

export function MyListPage() {
  const {
    cursor, setCursor, filters, hasActiveFilters, queryParams,
    handleFilterChange, handleClearAllFilters, getFooterProps,
  } = useCursorPagination()

  const deleteDialog = useDialogState<MyItem>()

  const query = myClient.useQuery('get', '/items', { params: { query: queryParams } })
  const { mutate: deleteItem } = myClient.useMutation('delete', '/items/{item_id}')

  const handleDelete = useDeleteAction({
    deleteFn: deleteItem,
    buildParams: (item) => ({ params: { path: { item_id: item.id } } }),
    entityLabel: 'item',
    getItemName: (item) => item.name,
    onSuccess: () => detachPromise(query.refetch()),
    onSettled: deleteDialog.close,
  })

  const items = query.data?.resources ?? []
  useCursorReset(items.length, hasActiveFilters, cursor, query.isFetching, setCursor)

  return (
    <AppPage>
      <FilterBar ... />
      <ScrollableTableContainer
        footer={getFooterProps(query.data, items.length, 'item', 'items')}
      >
        {/* table content */}
      </ScrollableTableContainer>
      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        onClose={deleteDialog.close}
        onConfirm={() => handleDelete(deleteDialog.item)}
        title="Delete item"
        confirmLabel="Delete"
        confirmVariant="danger"
      >
        Are you sure?
      </ConfirmationDialog>
    </AppPage>
  )
}
```

---

## 8. PatternFly Component Guidelines

### PatternFly First Checklist

Before writing any new UI code, follow this checklist:

1. **Check for Existing Components**
   - Search `packages/nexus-ui/src/components/` for existing application-specific components
   - Check PatternFly documentation for available components: Button, Alert, Switch, Table, Dialog, EmptyState, Menu, Tooltip, Checkbox, etc.
   - Verify if a PatternFly component or existing app component can be reused or extended

2. **Component Location Strategy**
   - **Application-specific components** → `packages/nexus-ui/src/components/`
   - Use PatternFly components directly from `@patternfly/react-core` and related packages
   - When in doubt, prefer PatternFly components over custom implementations

3. **Building New Components**
   - ALWAYS use PatternFly components as the foundation
   - Build accessible components following PatternFly patterns and design system
   - Include comprehensive tests (see existing `.test.tsx` files)
   - Place in `packages/nexus-ui/src/components/` for app-specific components
   - **Use PF6 design tokens instead of hardcoded pixel values** for spacing, sizing, colors, and icons. Use `var(--pf-t--global--spacer--*)` for margins/padding, `var(--pf-t--global--icon--size--*)` for icon dimensions, `var(--pf-t--global--color--*)` for colors, and content-aware units (`ch`, `rem`) for input widths. Hardcoded `px` values are acceptable only for layout constraints (table column widths, fixed panel heights) where no semantic token applies.

4. **Custom Hooks**
   - Extract reusable logic into custom hooks
   - Place hooks in `packages/nexus-ui/src/hooks/`
   - Follow naming convention: `useXxx`
   - Include TypeScript types

5. **Code Abstraction**
   - Identify and eliminate redundant code patterns
   - Create shared utilities for common operations
   - Use composition over duplication
   - Follow DRY (Don't Repeat Yourself) principles

6. **React Best Practices**
   - Leverage React 19 features
   - Use functional components and hooks
   - Use proper TypeScript typing (avoid `any`)
   - Implement proper error boundaries
   - Follow component composition patterns
   - Use proper key props for lists
   - Prefer controlled components for forms (react-hook-form)
   - Use proper semantic HTML
   - For PatternFly form controls (TextInput, TextArea, FormSelect, FormGroup), use `validated={hasError ? 'error' : 'default'}` so the non-error state is explicit; do not use `undefined` for the default case

**Example Workflow:**

```text
User Request: "Add a confirmation dialog"
Step 1: Check PatternFly for Dialog/Modal component (exists)
Step 2: Check app components for ConfirmDialog variant (may exist)
Step 3: Use PatternFly Modal or existing app component
Result: Use PatternFly Modal component or extend existing app component
```

### Code Readability Enforcement (ESLint)

ESLint enforces readability constraints that keep functions small, files focused, and logic simple. All are set to `error` — CI will block violations. **New code must respect these limits.**

These thresholds are based on industry standards (Code Complete, SonarQube, BiomeJS):

| Rule                     | Limit              | Purpose & Research Basis                                                 |
| ------------------------ | ------------------ | ------------------------------------------------------------------------ |
| `max-lines`              | 500 lines/file     | One responsibility per file                                              |
| `max-lines-per-function` | 200 lines/function | Maintainability degrades beyond ~200 lines (Code Complete, SonarQube)    |
| `complexity`             | 20 (cyclomatic)    | Balanced threshold used by many enterprise configs; catches complex code |
| `max-depth`              | 4 levels           | Use early returns, not pyramids                                          |
| `max-params`             | 5 parameters       | Use a typed options object for 6+ params                                 |
| `max-nested-callbacks`   | 4 levels           | Flatten with named functions or async/await                              |

Additional code quality rules (enforced as `error` — CI will block violations):

| Rule                                             | What it enforces                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `eqeqeq`                                         | Use `===`/`!==` instead of `==`/`!=` (null comparisons exempt)            |
| `no-void`                                        | Disallow the unary `void` operator (readability / Sonar S3735)            |
| `no-restricted-exports`                          | Prefer named exports over `export default` for refactorability            |
| `@typescript-eslint/prefer-optional-chain`       | Use `a?.b?.c` instead of `a && a.b && a.b.c`                              |
| `@typescript-eslint/prefer-nullish-coalescing`   | Use `??` instead of `\|\|` to avoid bugs with `0`/`''`                    |
| `@typescript-eslint/require-array-sort-compare`  | Require a compare function for `Array.sort()`                             |
| `@typescript-eslint/switch-exhaustiveness-check` | Ensure all union/enum cases are handled in switch statements              |
| `@typescript-eslint/prefer-includes`             | Use `.includes()` instead of `.indexOf() !== -1`                          |
| `react-hooks/exhaustive-deps`                    | Require all dependencies in React hook dependency arrays                  |
| `react/jsx-no-useless-fragment`                  | Remove unnecessary `<>{child}</>` wrappers                                |
| `react/no-array-index-key`                       | Avoid using array index as React `key` prop                               |
| `react/self-closing-comp`                        | Use `<Icon />` instead of `<Icon></Icon>`                                 |
| `sonarjs/no-nested-conditional`                  | Prevent nested ternaries (Sonar typescript:S3358; aligns with SonarCloud) |
| `unicorn/consistent-template-literal-escape`     | Consistent `\${` escaping in template literals                            |
| `unicorn/no-useless-iterator-to-array`           | Flag unnecessary `.toArray()` on iterators                                |
| `unicorn/prefer-simple-condition-first`          | Put simple conditions before complex ones in `&&` chains                  |
| `unicorn/switch-case-break-position`             | Consistent `break` placement inside switch cases                          |
| `import-x/no-cycle`                              | Detect circular dependencies (max depth: 2)                               |
| `import-x/no-self-import`                        | Catch accidental self-imports                                             |

Type-safe linting rules (enforced as `error` — CI will block violations):

The ESLint config extends `tseslint.configs.recommendedTypeChecked`, which enables type-aware rules that catch bugs string-based linting cannot.

| Rule                                               | What it catches                                     |
| -------------------------------------------------- | --------------------------------------------------- |
| `@typescript-eslint/no-unsafe-argument`            | Passing `any`-typed values as function arguments    |
| `@typescript-eslint/no-unsafe-assignment`          | Assigning `any` to a typed variable                 |
| `@typescript-eslint/no-unsafe-call`                | Calling a value typed as `any`                      |
| `@typescript-eslint/no-unsafe-member-access`       | Accessing members on `any`-typed values             |
| `@typescript-eslint/no-unsafe-return`              | Returning `any` from a typed function               |
| `@typescript-eslint/await-thenable`                | `await`-ing a non-Promise value                     |
| `@typescript-eslint/require-await`                 | `async` functions that never `await`                |
| `@typescript-eslint/unbound-method`                | Passing class methods as callbacks without binding  |
| `@typescript-eslint/no-base-to-string`             | Objects without meaningful `.toString()` in strings |
| `@typescript-eslint/restrict-template-expressions` | Only safe types in template literals                |
| `@typescript-eslint/only-throw-error`              | Only `Error` objects in `throw` statements          |

Blank lines and comments are excluded from counts. Test files are exempt from size limits and complexity.

### Refactoring Strategies When Limits Are Hit

- **Long function** → Extract sub-components, custom hooks, or helper functions
- **Deep nesting** → Early returns / guard clauses
- **High complexity** → Split into predicate functions or lookup tables
- **Many params** → Group into `{ options }` object with a TypeScript type
- **Large file** → Split into co-located modules (e.g., `utils.ts`, `hooks.ts`, sub-components)

---

## 9. Internationalization (i18n) — Never Compare Display Strings

User-facing strings that will be translated must only be used for display, never in conditional logic.

```typescript
// ❌ BAD — breaks when translated
const cadence = durationToHumanReadableCadence(parsed.cadence)
if (cadence !== 'Does not repeat') { ... }
if (label === 'Active') { return 'success' }

// ✅ GOOD — compare raw/internal values
if (parsed.cadence) { ... }           // ISO duration like 'P1D'
if (status === 'active') { ... }      // API contract value
```

### Correct Patterns

**1. Compare raw/internal values:**

```typescript
if (parsed.cadence) {
  // parsed.cadence is the ISO duration like 'P1D', not 'Daily'
  parts.push(`Repeats ${cadence.toLowerCase()}`)
}
```

**2. Use TypeScript union types:**

```typescript
type CadenceValue = 'none' | 'daily' | 'weekly' | 'monthly' | 'annually'

// Compare internal values
if (cadence === 'daily') {
  return 'P1D'
}

// Map to display strings separately
const cadenceLabels: Record<CadenceValue, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  annually: 'Annually',
}
```

**3. Use value-to-label mapping:**

```typescript
const statusMap: Record<StatusValue, { label: string; variant: 'success' | 'danger' }> = {
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
  pending: { label: 'Pending', variant: 'warning' },
}
const config = statusMap[apiStatus] // Use value for logic, label for display
```

### Allowed String Comparisons

These types of strings are **safe** to use in logic (they won't be translated):

- **API contract values**: `type === 'converge'`, `status === 'success'`, `type === 'script'`
- **TypeScript enum values**: `activity.type === ActivityTypeEnum.SCRIPT`
- **Internal constants**: `mode === 'development'`, `edge.type === 'buttonEdge'`
- **Technical identifiers**: `file.endsWith('.tsx')`, `id.startsWith('parallel_')`

### Enum Checklist

Before writing conditional logic with strings:

1. Is this string from an API response or TypeScript type? → **Safe to use**
2. Is this an internal constant/identifier? → **Safe to use**
3. Is this string shown to users in the UI? → **Do NOT use in logic**
4. Would this string be translated to other languages? → **Do NOT use in logic**

---

## 10. Use Enum Constants — Never String Literals for Discriminators

**CRITICAL: Use centralized enum constants instead of string literals for discriminators and identifiers to prevent typos.**

String literals in comparisons and assignments are error-prone. A single typo in a string comparison (`activity.type === 'converge'` vs `activity.type === 'convege'`) will silently fail without any TypeScript error, leading to bugs that are hard to track down.

### Why Use Enum Constants

**Problem with string literals:**

```typescript
// ❌ BAD: Typo-prone, no compile-time safety
if (activity.type === 'condition') {
  // works
}
if (activity.type === 'condtion') {
  // typo! No TypeScript error — this condition will never match (silent bug)
}

// ❌ BAD: Inconsistent casing
if (edge.sourceHandle === 'Loop') {
  // Should be 'loop' — never matches (silent bug)
}
```

**Solution with enum constants:**

```typescript
// ✅ GOOD: TypeScript catches typos at compile time
if (activity.type === ActivityTypeEnum.CONDITION) {
  // autocomplete + type checking
}
if (activity.type === ActivityTypeEnum.CONDTION) {
  // TypeScript error! Property 'CONDTION' does not exist
}
```

### Available Enum Values

The codebase provides centralized enum constants in `@ansible/nexus-contracts`:

```typescript
import { ActivityTypeEnum, TriggerTypeEnum, ExecutorTypeEnum, EdgeHandleEnum } from '@ansible/nexus-contracts'

// Activity types (v2 — executor types are first-class node types, no 'task' wrapper)
ActivityTypeEnum.SCRIPT // 'script'
ActivityTypeEnum.HTTP_REQUEST // 'http_request'
ActivityTypeEnum.AGENTIC // 'agentic'
ActivityTypeEnum.AAP_JOB_TEMPLATE // 'aap_job_template'
ActivityTypeEnum.APPROVAL // 'approval'
ActivityTypeEnum.CONDITION // 'condition'
ActivityTypeEnum.LOOP // 'loop'
ActivityTypeEnum.CONVERGE // 'converge'

// Trigger types
TriggerTypeEnum.MANUAL_TRIGGER // 'manual_trigger'
TriggerTypeEnum.SCHEDULED // 'scheduled'
TriggerTypeEnum.EVENT // 'event'

// Executor types (v2 — executor types are the node type directly, no task.executor wrapper)
ExecutorTypeEnum.SCRIPT // 'script'
ExecutorTypeEnum.HTTP_REQUEST // 'http_request'
ExecutorTypeEnum.AGENTIC // 'agentic'
ExecutorTypeEnum.AAP_JOB_TEMPLATE // 'aap_job_template'
ExecutorTypeEnum.APPROVAL // 'approval'

// Edge handles
EdgeHandleEnum.SOURCE // 'source'
EdgeHandleEnum.TARGET // 'target'
EdgeHandleEnum.LOOP // 'loop'
EdgeHandleEnum.DONE // 'done'
EdgeHandleEnum.END // 'end'
EdgeHandleEnum.TRUE // 'true'
EdgeHandleEnum.FALSE // 'false'
EdgeHandleEnum.APPROVED // 'approved'
EdgeHandleEnum.REJECTED // 'rejected'
```

### When to Use Enum Constants

**Always use enum constants for:**

1. **Type discriminators** - `activity.type`, `trigger.type`
2. **Handle identifiers** - `edge.sourceHandle`, `edge.targetHandle`
3. **Type assignments** - Creating new activities, edges, triggers
4. **Switch statements** - Pattern matching on discriminated unions

**Examples:**

```typescript
// ✅ GOOD: Comparisons
if (activity.type === ActivityTypeEnum.LOOP) { ... }
if (edge.sourceHandle === EdgeHandleEnum.LOOP) { ... }

switch (activity.type) {
  case ActivityTypeEnum.CONDITION:
    return handleCondition(activity)
  case ActivityTypeEnum.LOOP:
    return handleLoop(activity)
}

// ✅ GOOD: Assignments
const activity = {
  type: ActivityTypeEnum.SCRIPT,
  id: generateId(),
  name: 'My Script',
}

const edge = {
  source: nodeId,
  target: targetId,
  sourceHandle: EdgeHandleEnum.LOOP,
  targetHandle: EdgeHandleEnum.END,
}

// ✅ GOOD: Function parameters
function createEdge(sourceHandle: string = EdgeHandleEnum.SOURCE) { ... }
```

### Benefits

1. **Autocomplete** - IDE suggests available values
2. **Type safety** - TypeScript catches typos at compile time
3. **Refactoring** - Rename all usages in one place
4. **Documentation** - Single source of truth for valid values
5. **Consistency** - Prevents case mismatches (`'Loop'` vs `'loop'`)

### Quick Checklist

Before writing a string comparison or assignment:

1. Is this a type discriminator, handle identifier, or status value?
2. If yes → Check if an enum constant exists (ActivityTypeEnum, TriggerTypeEnum, etc.)
3. If enum exists → Use it instead of string literal
4. If no enum exists → Consider creating one if the value is reused

---

## 11. Error Handling with RFC 9457 Problem Details

The application uses RFC 9457 Problem Details for API error responses. See [`docs/error-handling.md`](../../docs/error-handling.md) for complete patterns.

### Error Format

All API errors follow the RFC 9457 Problem Details format:

```typescript
{
  type: "https://api.nexus.com/errors/validation-error",
  title: "Validation Error",
  detail: "Field 'name' must be between 1 and 255 characters",
  code: "VALIDATION_ERROR",
  retryable: false,
  instance: "/api/v1/workflows"
}
```

### Error Handling Utilities

**Always use error utilities** - never access error fields directly:

```typescript
import {
  getErrorMessage,
  getErrorTitle,
  getErrorCode,
  isRetryableError,
  isServiceUnavailableError,
  isValidationError,
  isConflictError,
} from '../utils/apiErrors'

// ✅ GOOD
const message = getErrorMessage(error)
const title = getErrorTitle(error)

// ❌ BAD
const message = error.detail || error.message // Don't access directly
```

### Error Codes

| Code                    | HTTP Status | Description                      | Retryable |
| ----------------------- | ----------- | -------------------------------- | --------- |
| VALIDATION_ERROR        | 422         | Input validation failed          | No        |
| WORKFLOW_NAME_CONFLICT  | 409         | Workflow name already exists     | No        |
| WORKFLOW_DISABLED       | 400         | Cannot execute disabled workflow | No        |
| PROVIDER_NAME_CONFLICT  | 409         | Provider name already exists     | No        |
| FILE_TOO_LARGE          | 413         | File exceeds size limit          | No        |
| LLM_CONFIGURATION_ERROR | 503         | LLM service not configured       | Yes       |
| TEMPORAL_UNAVAILABLE    | 503         | Workflow engine unavailable      | Yes       |
| INTERNAL_ERROR          | 500         | Internal server error            | Yes       |

### Mutation Error Hooks

Use the correct mutation error hook by context:

- `useFormMutationErrorHandler` for react-hook-form mutations (maps 422 field errors to form fields)
- `useMutationErrorHandler` for non-form mutations

Never use ad-hoc manual error parsing. Use `getErrorMessage()` and `isConflictError()` from `apiErrors.ts` for error inspection.

### Retry Support

For retryable errors, pass an `onRetry` callback:

```typescript
// Query retry support
const query = workflowClient.useQuery('get', '/workflows')
const queryState = useQueryState(query, {
  title: 'Error loading workflows',
  onRetry: () => detachPromise(query.refetch()),
})

// Mutation retry support
const handleError = useMutationErrorHandler()
const { mutate } = workflowClient.useMutation('post', '/workflows')

mutate(data, {
  onError: handleError({
    title: 'Failed to create workflow',
    onRetryable: () => setShowRetry(true),
  }),
})
```

### Retry Button in Error States

The `ErrorState` component automatically shows a retry button for retryable errors when `onRetry` is provided:

```typescript
// Retry button appears automatically for 5xx errors or errors with retryable=true
<ErrorState
  title="Failed to load data"
  message={error}
  onRetry={() => detachPromise(refetch())}
/>
```

---

## 12. `ConfirmationDialog` — Never Inline Modal Boilerplate

```typescript
// ❌ BAD — 15+ lines repeated per dialog
<Modal isOpen={isOpen} onClose={onClose} variant="small">
  <ModalHeader title="Delete item" />
  <ModalBody>Are you sure?</ModalBody>
  <ModalFooter>
    <Button variant="danger" onClick={onConfirm}>Delete</Button>
    <Button variant="link" onClick={onClose}>Cancel</Button>
  </ModalFooter>
</Modal>

// ✅ GOOD
<ConfirmationDialog
  isOpen={isOpen}
  onClose={onClose}
  onConfirm={handleDelete}
  title="Delete item"
  confirmLabel="Delete"
  confirmVariant="danger"
>
  Are you sure you want to delete &quot;{item?.name}&quot;?
</ConfirmationDialog>
```

---

## 13. `useDialogState` — Never Manual useState Pairs

```typescript
// ❌ BAD
const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
const [itemToDelete, setItemToDelete] = useState<User | null>(null)

// ✅ GOOD
const deleteDialog = useDialogState<User>()
// Open: deleteDialog.open(user)
// Close: deleteDialog.close()
// Use: deleteDialog.isOpen, deleteDialog.item
```

---

## 14. `useCursorPagination` — Never Duplicate Cursor Boilerplate

```typescript
// ❌ BAD — 50+ lines repeated per list view
const [cursor, setCursor] = useState<string | null>(null)
const { filters, clearAllFilters, setAllFilters } = useFilterState()
const filterParams = buildFilterParams(filters)
const queryParams = { limit: 20, ...filterParams, ...(cursor ? { cursor } : {}) }

// ✅ GOOD
const {
  cursor,
  setCursor,
  filters,
  hasActiveFilters,
  queryParams,
  handleFilterChange,
  handleClearAllFilters,
  getFooterProps,
} = useCursorPagination({ limit: 20, extraParams, defaultFilters, transformFilters })
```

---

## 15. Stable React context provider values (Sonar)

Do not pass a **fresh object or array literal** as `value` to `React.createContext().Provider` when that value is assembled from stable callbacks or data. A new identity every render forces unnecessary work in `useContext` consumers.

Prefer `useMemo` (with an accurate dependency list) or split stable callbacks from changing data so the context contract stays intentional.

`packages/nexus-ui/eslint.config.js` enables **`react/jsx-no-constructed-context-values`** for the whole UI package so inline object/array `value`s on context providers fail CI the same way as other React lint rules.

```typescript
// ❌ BAD — new object every render
<MyContext.Provider value={{ foo, bar }}>

// ✅ GOOD — stable reference when deps are stable
const value = useMemo(() => ({ foo, bar }), [foo, bar])
<MyContext.Provider value={value}>
```

---

## 16. Module-scoped pure helpers (Sonar)

Prefer **module scope** (or another stable outer scope) for helpers that are **pure**: they only use their parameters and do not close over React props, state, context, or hooks from the component body. Defining those helpers inside the component recreates the function every render and tends to re-trigger Sonar “move to outer scope” maintainability findings without adding behavior.

There is **no ESLint rule** in this repo that matches that Sonar check narrowly; `unicorn/consistent-function-scoping` is broader and was not adopted globally. Use **SonarCloud / code review** to catch new cases until a dedicated lint strategy exists (for example a custom rule or a repo-wide Unicorn cleanup).

```typescript
// ❌ BAD — recreated each render; avoid when the helper is pure
function MyForm() {
  function formatLabel(id: string) {
    return id.toUpperCase()
  }
  // ...
}

// ✅ GOOD — module scope (or a colocated `*.utils.ts` if large)
function formatLabel(id: string) {
  return id.toUpperCase()
}

function MyForm() {
  // ...
}
```

---

## 17. Prefer `Set` for membership-only checks (Sonar **typescript:S7776**)

Sonar rule **typescript:S7776** (_Arrays used only for existence checks should be Sets_) applies when a collection is used **mainly or only** to answer “is this value present?”—for example repeated **`Array#includes()`** lookups.

**Why it matters (per Sonar):** `includes()` is **O(n)** per call because it may scan the whole array. **`Set#has()`** is **O(1)** on average. For very small collections the difference is usually negligible; it matters more for **larger lists** and when checks run **often** (loops, drag/drop handlers, render-hot paths).

**What to do:** If membership is the primary use case, keep or build a **`Set`**, use **`.has()`** (and **`.add()`** / **`.delete()`** when the allowed set changes). Do **not** replace arrays when you need **order**, **duplicates**, **indexing**, or **array-specific APIs**—those are valid reasons to stay on an array.

**Official references:** Sonar rule **typescript:S7776** in the Sonar rules catalog; related discussion in ESLint **`unicorn/prefer-set-has`** ([rule doc](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/prefer-set-has.md)); [MDN `Set.prototype.has()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Set/has), [MDN `Array.prototype.includes()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes).

```typescript
// ❌ Non-compliant (Sonar S7776) — array used only as a membership bag
const allowedValues = [1, 2, 3, 4, 5]
const isAllowed = (value: number) => allowedValues.includes(value)

// ✅ Compliant — Set for existence
const allowedValues = new Set([1, 2, 3, 4, 5])
const isAllowed = (value: number) => allowedValues.has(value)
```

---

## 18. No nested React components; stable PatternFly `toggle` / render props (Sonar **typescript:S6478**)

Sonar **typescript:S6478** (_React components should not be nested_): do not declare **function or class components inside** another component’s body. A nested definition is a **new component type on every parent render**, which can **reset subtree state** and waste reconciliation work.

**PatternFly `Select`, `Dropdown`, `Popover`, etc.** often require a **`toggle={(toggleRef) => …}`** or **`bodyContent={(hide) => …}`**. You cannot remove that callback, but you **must not** declare `function Inner()` / `const Inner = () => …` **inside** the parent component just to return JSX from it.

**Do instead:** define a **named component at module scope** (same file above the export is fine), pass all dynamic bits as **props**, and return that type from the PF prop:

```tsx
// ❌ Non-compliant — component type recreated every parent render
function Parent() {
  function Toggle(props: { toggleRef: Ref<MenuToggleElement> }) {
    return <MenuToggle ref={props.toggleRef}>…</MenuToggle>
  }
  return <Select toggle={(ref) => <Toggle toggleRef={ref} />} />
}

// ✅ Compliant — stable element type; PF still receives a toggle render prop
function ParentMenuToggle(props: Readonly<{ toggleRef: Ref<MenuToggleElement>; label: string }>) {
  return <MenuToggle ref={props.toggleRef}>{props.label}</MenuToggle>
}

function Parent() {
  return <Select toggle={(ref) => <ParentMenuToggle toggleRef={ref} label={label} />} />
```

Sonar’s docs also allow factories in props whose names match **`render*`** (and some **`children`** patterns). PatternFly uses names like **`toggle`**, so **module-scoped** presentational components are the usual fix.

**ESLint:** `react/no-unstable-nested-components` overlaps this theme but often still flags **valid** `(ref) => <ModuleScopedToggle … />` shapes unless **`allowAsProps: true`**, which then **permits** many other “component in prop” patterns Sonar would still reject. This repo therefore relies on **SonarCloud S6478** (and review) rather than enabling that rule globally.
