# Visual Regression Testing

Automated screenshot testing for every page in the application.

## How It Works

- **Baselines** are Linux-generated PNGs committed in the repo under `e2e/visual-regression/page-screenshots.spec.ts-snapshots/`.
- **CI** builds the app against the mock API, takes screenshots on Ubuntu, and compares them pixel-by-pixel to the committed baselines.
- **`/update-screenshots`** is a PR comment command that triggers a workflow to regenerate baselines on Ubuntu and commit them to your branch.
- **macOS snapshots** are gitignored. Only Linux baselines are used in CI.
- **Explicit viewport** (1280x720) is set in `playwright.config.ts` so every screenshot uses identical dimensions regardless of the runner's display.
- **`fullPage: true`** captures the entire scrollable page, including content below the fold.
- **Pinned runner** -- CI uses `ubuntu-24.04` (not `ubuntu-latest`) to guarantee consistent font rendering and system libraries across runs.

## Advisory, Not Blocking

Visual regression is a **review aid**, not a merge gate. The CI job always reports success regardless of whether screenshots match. Instead of blocking the PR, it posts a comment on the PR showing pass/fail status and links to diff artifacts.

- **On every PR**: CI takes screenshots and compares them to committed baselines. Results are posted as a PR comment.
- **If screenshots changed**: Reviewers should inspect the comment and diff artifacts to decide whether the changes are intentional.
  - If intentional, comment `/update-screenshots` on the PR to regenerate baselines.
  - If unintentional, fix the code and push again.
- **Merging is not blocked**: The visual regression check does not prevent merging. It is the reviewer's responsibility to check the PR comment before approving.

## Three Flows

### Flow 1: Adding a New Page

1. Add your route to `AppRoute.tsx`
2. Add an entry to `e2e/visual-regression/page-registry.ts`:
   ```typescript
   {
     section: 'my-section',
     name: 'my-page',
     path: '/my-section/my-page',
     waitFor: async (page) => {
       await expect(page.getByRole('heading', { name: 'My Page' })).toBeVisible()
     },
   },
   ```
3. Push your PR
4. CI posts a comment indicating missing baselines (the job still passes)
5. Comment `/update-screenshots` on the PR
6. The workflow generates Linux baselines and commits them to your branch
7. CI re-runs and the comment shows all screenshots matching

If the route is intentionally unimplemented, add it to `excludedUnimplemented` in `page-registry.ts` instead.

### Flow 2: Modifying an Existing Page

1. Make your UI changes
2. Push your PR
3. CI posts a comment showing screenshot diffs (the job still passes)
4. Review the diff artifacts in the CI run to confirm changes are intentional
5. Comment `/update-screenshots` on the PR
6. Baselines are regenerated and committed
7. CI re-runs and the comment shows all screenshots matching

### Flow 3: Removing a Page

1. Remove the route from `AppRoute.tsx`
2. Remove the entry from `page-registry.ts`
3. Delete the baseline PNG files from `e2e/visual-regression/page-screenshots.spec.ts-snapshots/`
4. Push your PR
5. CI passes (route excluded, no stale baselines)

The enforcement script warns about orphan baselines (PNG files with no matching registry entry), so step 3 is required.

## Multiple States Per Page

A single page can have multiple registry entries for different visual states:

- **Empty/filtered state** -- use `setup` to type a non-matching filter term
- **Modals/dialogs** -- use `setup` to click the button that opens the modal
- **Kebab menu actions** -- use `setup` to open a row's kebab and trigger a dialog
- **Detail pages** -- use mock API IDs for `:id` parameters in the path
- **Form pages** -- navigate directly to the create/edit route

See existing entries in `page-registry.ts` for examples.

## Running Locally

```bash
cd packages/nexus-ui

# Run page screenshot tests
npx playwright test e2e/visual-regression/page-screenshots

# Update baselines locally (macOS -- for local dev only)
npx playwright test e2e/visual-regression/page-screenshots --update-snapshots

# Run the baseline enforcement check
node scripts/check-visual-baselines.js
```

## Reviewing Screenshot Diffs in PRs

When the PR comment reports diffs:

1. Download the `visual-regression-diffs` artifact from the workflow run
2. For each changed page you will find `*-expected.png`, `*-actual.png`, and `*-diff.png`
3. If the changes are intentional, comment `/update-screenshots`

After baselines are updated, review image diffs in the PR's **Files Changed** tab using GitHub's 2-up, swipe, or onion skin modes.
