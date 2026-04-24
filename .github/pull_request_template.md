## What Changed?

<!-- A description and screenshots/screen recordings of what changed in this PR -->

## Out of Scope

<!-- What this PR intentionally does NOT include, to set reviewer expectations -->

## How to Test

<!-- Manual testing directions, for example:

1. Log in as an admin
2. Go to the `/workflows` route
3. Click on <whatever>
4. Validate that <a thing changed>

-->

## PR Checklist

Steps to take before considering a PR ready for human review:

- [ ] Add [manual testing directions](#how-to-test)
- [ ] Add screen shots and/or screen recordings demonstrating the change working
- [ ] Run the `/review-pr` command with Claude Code
- [ ] Leverage the `.claude/skills/coding_standards.md` and `.claude/skills/patternfly_ux_design_system.md` Claude Code skills
- [ ] Unit and/or E2E tests added/updated to support change (hint: use `.claude/skills/playwright_e2e.md` and `.claude/skills/testing_guidelines.md`)
- [ ] Manage visual regression screenshot changes if any (comment `/update-screenshots` in the PR if an intentional difference occurs and screenshots need to be updated)
- [ ] Validate the end user experience with the UX team (screen recordings are especially helpful here)
- [ ] Address SonarQube findings
- [ ] Resolve CodeRabbit suggestions
