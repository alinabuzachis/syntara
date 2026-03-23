# Pull Request Size Policy

The goal is to keep pull requests small, reviewable, and stackable.

## PR Budget

Line counts apply to **feature code only** — test files (`*.test.*`, `*.spec.*`, `__tests__/`, `e2e/`) are excluded from the budget. Tests are expected and encouraged but should not inflate the PR size metric.

**Preferred:**

- 1 concern per PR
- 100–300 changed lines (feature code)
- ≤ 10 files

**Soft limits:**

- ≤ 500 lines (feature code)
- ≤ 15 files

If work exceeds these limits, split it into multiple PRs.

## Stacked PR Strategy

Do not implement a full feature in one pass if it spans multiple layers.

Large features must be split into a stack of PRs. Typical order:

| Order | Scope                     |
| ----- | ------------------------- |
| PR 1  | Types / contracts         |
| PR 2  | API client or data access |
| PR 3  | Hooks / state wiring      |
| PR 4  | UI components             |
| PR 5  | Page integration          |
| PR 6  | Cleanup or refactor       |

Each PR includes tests for the behavior it introduces (see [Testing Rule](#testing-rule)).

This order can be adjusted based on feature needs. Document any deviations in the PR plan.

Each PR should introduce only one logical layer or concern, and be independently reviewable and mergeable.

## Testing Rule

Each PR must be independently testable.

If behavior changes:

- Add or update tests for that slice only
- Tests should ship in the same PR as the behavior they cover

Do not postpone all tests to the final PR unless earlier PRs are infrastructure-only and have no user-visible behavior.

## Stacked PR Format

When proposing work, use this format:

```text
PR 1 - [title]
- scope:
- files:
- estimated size:
- risk: low / medium / high
- dependencies:
- tests:

PR 2 - [title]
- scope:
- files:
- estimated size:
- risk: low / medium / high
- depends on: PR 1
- tests:
```

## Change Isolation

Never mix these in one PR:

- Feature work + refactor
- Feature work + dependency upgrades
- Feature work + formatting
- Bug fix + broad cleanup
- UI changes + unrelated data model changes

If both are needed, separate them into stacked PRs.

## Stop Rule

Stop and re-scope when:

- The change would exceed the PR budget
- More than one architectural layer is involved
- Unrelated cleanup becomes tempting
- Refactor work is discovered that is not essential to the current slice

When this happens:

1. Create a follow-up PR plan instead of continuing to add code
2. Suggest manageable pieces and ask for human approval before implementing

## Required Plan Before Code

Before editing files, always produce a short implementation plan with:

- Feature goal
- Proposed PR stack
- Title of each PR
- Files touched by each PR
- Estimated diff size for each PR
- Risks and test plan

Do not start coding until the work is split into reviewable slices. Only implement the first PR in the stack unless explicitly asked to continue. Always ask a human for approval.

## PR Description

Each PR must include (see [pull_request_template.md](pull_request_template.md)):

- **Purpose** — what problem this PR solves
- **Scope** — what is included in this PR
- **Out of Scope** — what this PR intentionally does not include
- **Size Check** — single concern, within budget, no unrelated refactors
- **Testing** — existing tests pass, tests added if behavior changed
- **Stack Context** — depends on / follow-up PRs
