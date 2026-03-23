# Contributing Walkthrough

A step-by-step guide for contributing features to Nexus using our specification-driven development workflow.

## Workflow Overview

```
Specify → Clarify → Plan → [APPROVE] → Tasks → Analyze → [APPROVE] → Implement → PR
```

Every feature goes through four phases: **Define**, **Plan Tasks**, **Build**, and **Ship**. The spec and plan must be approved before generating tasks, and tasks must be approved before implementation begins.

## Tools Used

This workflow uses two complementary toolsets:

| Tool | Source | Purpose |
|------|--------|---------|
| **SpecKit** | [spec-kit](https://github.com/github/spec-kit) | Specification-driven development framework for creating specs, plans, and tasks |
---

## Phase 1: Define

### 1. Write the Spec (SpecKit)

Run `/speckit.specify` with a natural language description of the feature. This creates a `spec.md` capturing user journeys, success criteria, and constraints. Give the important context and you can use previous SDP approved to that feature.

### 2. Clarify Gaps (SpecKit)

Run `/speckit.clarify` to surface underspecified areas. Answer the questions — they get encoded back into the spec.

### 3. Create the Plan (SpecKit)

Run `/speckit.plan` to generate the implementation plan, including architecture decisions, data model changes, and API design.

### 4. Get Approval

Share the spec and plan artifacts with the team for review. **Do not proceed to implementation until approved.**

---

## Phase 2: Plan Tasks

Once the spec and plan are approved, break down the work into actionable tasks.

### 5. Generate Tasks (SpecKit)

Run `/speckit.tasks` to produce a dependency-ordered `tasks.md` from the spec and plan.

### 6. Cross-check Artifacts (SpecKit)

Run `/speckit.analyze` for a consistency check across all artifacts (spec, plan, tasks).

### 7. Get Task Approval

Share the tasks with the team for review. **Do not proceed to implementation until tasks are approved.**

---

## Phase 3: Build

Once tasks are approved, implement the feature.

### 8. Implement (SpecKit)

Run `/speckit.implement` to execute tasks from `tasks.md`. Each task produces a focused, reviewable change.

---

## Phase 4: Ship

### 9. Run Quality Checks

All changes must pass before opening a PR:

```bash
pre-commit run --all
```

### 10. Before Commit
Commits must be [signed](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-commits)

Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add workflow retry configuration
fix: resolve database connection timeout
docs: update API documentation
```
### 11. Open a Pull Request

Open a PR against `main` following the [template](https://github.com/syntara-orchestration/syntara/blob/main/.github/pull_request_template.md) and contains:
- A clear description of the changes
- Link to the spec/plan artifacts
- Any breaking changes noted


---

## Quick Reference

| Step | Command | Source | Purpose |
|------|---------|--------|---------|
| 1 | `/speckit.specify` | SpecKit | Write feature spec |
| 2 | `/speckit.clarify` | SpecKit | Fill spec gaps |
| 3 | `/speckit.plan` | SpecKit | Generate implementation plan |
| 4 | **Spec/Plan approval** | — | Gate before task generation |
| 5 | `/speckit.tasks` | SpecKit | Generate ordered tasks |
| 6 | `/speckit.analyze` | SpecKit | Cross-artifact consistency |
| 7 | **Task approval** | — | Gate before implementation |
| 8 | `/speckit.implement` | SpecKit | Execute tasks |
| 9 | `make format lint test-all typecheck` | — | Quality gates |
| 10 | Open PR | — | Ship it |

## Use for Better Results

Tips to get the most out of AI-assisted development:

### 1. Be Explicit About the Role

Tell the assistant what role to assume. This shapes responses and focuses expertise.

```
You are a senior backend engineer reviewing this code for production readiness.
```

### 2. Add Real Context

Provide relevant background — prior decisions, constraints, or existing patterns in the codebase.

```
We use SQLModel for all data models (no separate Pydantic/SQLAlchemy).
The API follows REST conventions with kebab-case endpoints.
```

### 3. Define the Task Precisely

Be specific about what you want. Vague requests produce vague results.

| Vague | Precise |
|-------|---------|
| "Fix the bug" | "Fix the null pointer exception in `process_workflow()` when `config` is missing" |
| "Add tests" | "Add unit tests for the `WorkflowService.retry()` method covering success, failure, and timeout cases" |

### 4. Add Constraints

Specify boundaries to avoid over-engineering or unwanted changes.

```
- Do not modify existing tests
- Keep changes to the auth module only
- Use existing utility functions where possible
```

### 5. Consider Adding Evaluation Criteria

Define what "done" looks like so the assistant can self-check.

```
Success criteria:
- All existing tests pass
- New endpoint returns 401 for unauthenticated requests
- Response time under 100ms for cached requests
```

---

## Further Reading

- [README](../README.md) — Full project setup and architecture
- [CONTRIBUTING](../CONTRIBUTING.md) — Contribution guidelines and code standards
- [Developer Getting Started](developer-getting-started.md) — Architecture deep dive
- [Spec Kit](https://github.com/github/spec-kit) — Specification-driven development framework

---

## Development Flow Summary

| Phase | Purpose | SpecKit Commands |
|-------|---------|------------------|
| **1. Define** | Create and validate the feature specification | `/speckit.specify` → `/speckit.clarify` → `/speckit.plan` |
| **2. Plan Tasks** | Break down work into actionable items | `/speckit.tasks` → `/speckit.analyze` |
| **3. Build** | Implement the feature | `/speckit.implement` |
| **4. Ship** | Quality checks and PR | — |

**Checkpoints:**
- ✓ Get spec + plan approved before generating tasks
- ✓ Get tasks approved before implementation
- ✓ Run `make format && make lint && make test-all && make typecheck` before finalizing
