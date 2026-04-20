# Contributing to Nexus UI

## Welcome Contributors!

We're excited that you're interested in contributing to the Nexus UI project. This document provides guidelines to help you contribute effectively.

## Prerequisites

- Node.js 22+ (see package.json for exact requirements)
- npm (comes with Node.js)
- Familiarity with React, TypeScript, and modern web development practices

## Getting Started

### Choose Your Contribution Path

We have two development workflows depending on the size of your change:

#### Quick Fix Path (No Spec Needed)

**Use this for:**

- Bug fixes (typos, styling issues, broken links)
- Documentation updates
- Dependency updates
- Small refactors (< 50 lines changed)
- UI tweaks and polish

**Workflow:**

1. Create branch: `git checkout -b fix/short-description` or `docs/short-description`
2. Make your change
3. Run tests: `npm test`
4. Commit with conventional commit format: `fix: description` or `docs: description`
5. Create PR

**No spec, plan, or tasks files needed!**

#### Feature Development Path (Spec Kit Required)

**Use this for:**

- New features
- Significant refactors
- Architecture changes
- Multi-file changes (> 50 lines)
- Changes requiring design decisions

**Follow the Spec Kit workflow** (see section below)

---

### Specification-Driven Development with GitHub Spec Kit

This project utilizes [GitHub's Spec Kit](https://github.com/github/spec-kit) for **feature development**. This aligns our development workflow with the backend repository.

**When to use Spec Kit:**

- You're adding new functionality
- Multiple files will be changed
- You need to make design/architecture decisions
- The change requires planning and task breakdown

**When NOT to use Spec Kit:**

- Simple bug fixes
- Documentation updates
- Trivial changes (see "Quick Fix Path" above)

#### Setup

1.  **Configuration**: The project is already configured with:
    - `.specify/` - Templates and configuration
    - `.cursor/commands/` - Cursor AI commands (prefixed with `speckit.`)

    To sync new commands from `.claude/` to `.cursor/`, run:

    ```bash
    npm run sync-cursor-commands
    ```

#### Workflow (Using Cursor AI)

We use **Cursor Composer** (Cmd+I / Ctrl+I) to drive the Spec Kit workflow.

1.  **Specify** (`@speckit.specify`)
    - Open Composer and type: `@speckit.specify "Description of your feature"`
    - This generates a specification file in `specs/NNN-feature-name/spec.md`.
    - Review and refine the generated spec.

2.  **Plan** (`@speckit.plan`)
    - With the spec file open or referenced, type: `@speckit.plan`
    - This generates an implementation plan in `specs/NNN-feature-name/plan.md`.
    - It covers architecture, data models, and technical approach.

3.  **Tasks** (`@speckit.tasks`)
    - With the plan file open, type: `@speckit.tasks`
    - This breaks the plan into actionable, sequential tasks in `specs/NNN-feature-name/tasks.md`.

4.  **Implement** (`@speckit.implement`)
    - Type: `@speckit.implement`
    - The agent will read the tasks and start implementing them one by one.
    - It will create/edit files, run tests, and mark tasks as complete.

### Spec Numbering and Branching

To align with the backend process:

1.  **One Branch Per Feature**: Create a branch for your feature (e.g., `feature/dark-mode`).
2.  **Numbered Specs**: Specs must be placed in `specs/` with a sequential number prefix.
    - Example: `specs/011-theme-switcher/`
    - Check the `specs/` directory to find the next available number.
    - You can verify the sequence by running:
      ```bash
      npm run check-specs
      ```
3.  **Commit Specs**: The spec files (`spec.md`, `plan.md`, `tasks.md`) should be committed to the repository to serve as permanent documentation.

### 1. Fork and Clone the Repository

1. Fork the repository on GitHub
2. Clone your forked repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/nexus-ui.git
   cd nexus-ui
   ```

### 2. Set Up Development Environment

```bash
# Install dependencies
npm ci

# Start development services
npm start
```

The application will be available at:

- UI: http://localhost:5173
- Mock API: http://localhost:3000

## Development Workflow

### Branch Strategy

- Create a new branch for each feature or bugfix
- Branch naming convention:
  - `feature/short-description` — new features
  - `bugfix/short-description` or `fix/short-description` — bug fixes
  - `docs/short-description` — documentation updates

### Making Changes

1. Create a new branch

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes
   - Follow existing code style
   - Add/update tests for your changes
   - Ensure all tests pass

3. Run tests and linting

   ```bash
   # Run all tests
   npm test

   # Format code
   npm run format
   ```

### Commit Guidelines

- Use meaningful commit messages
- Follow conventional commits format:

  ```
  type(scope): short description

  [optional detailed description]
  ```

  Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

## Pull Request Process

1. Ensure your code passes all tests and linting
2. Update documentation if necessary
3. Create a pull request with:
   - Clear title
   - Description of changes
   - Link to any related issues

### Code Review Process

- All submissions require review
- Maintainers will provide feedback
- Be prepared to make requested changes

## Code Readability Rules

We enforce code readability through ESLint rules that keep functions small, files focused, and logic simple. The size/readability thresholds below are generally configured as `warn` so they guide refactoring without blocking every PR, but new code should still respect them.

These thresholds are based on industry standards (Code Complete, SonarQube, BiomeJS):

| Rule                     | Limit              | What it enforces                                             |
| ------------------------ | ------------------ | ------------------------------------------------------------ |
| `max-lines`              | 500 lines/file     | Keep files focused on a single responsibility                |
| `max-lines-per-function` | 200 lines/function | Extract helpers instead of writing monoliths                 |
| `complexity`             | 20 (cyclomatic)    | Break complex branching into smaller functions               |
| `max-depth`              | 4 levels           | Use early returns instead of deep nesting                    |
| `max-params`             | 5 parameters       | Use an options object for functions with many inputs         |
| `max-nested-callbacks`   | 4 levels           | Flatten nested callbacks with named functions or async/await |

We also enforce modern TypeScript, React, and import hygiene rules as CI-blocking `error`s:

- **`prefer-optional-chain`** / **`prefer-nullish-coalescing`** — Use `?.` and `??` for safer, cleaner code
- **`require-array-sort-compare`** — Prevent subtle `Array.sort()` bugs
- **`switch-exhaustiveness-check`** — Handle all enum/union cases
- **`prefer-includes`** — Use `.includes()` instead of `.indexOf() !== -1`
- **`jsx-no-useless-fragment`** / **`self-closing-comp`** — Cleaner JSX
- **`sonarjs/no-nested-conditional`** — Prevent nested ternaries (Sonar S3358; aligns with SonarCloud)
- **`no-cycle`** / **`no-self-import`** — Catch circular dependencies

Blank lines and comments are excluded from line counts. Test files (`*.test.*`, `*.spec.*`) are exempt from size limits and complexity.

**If a rule blocks your work**, don't disable it inline. Instead, refactor:

- Long component? Extract sub-components or custom hooks.
- Deep nesting? Use early returns or guard clauses.
- Many parameters? Group them into a typed options object.

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run UI package tests
npm run test:ui

# Run with coverage (from packages/nexus-ui)
cd packages/nexus-ui
npm run test:coverage
```

### Test Coverage

- Aim to maintain or improve test coverage
- Write unit and integration tests for new features

## Reporting Issues

### Bug Reports

- Use GitHub Issues
- Include:
  - Steps to reproduce
  - Expected behavior
  - Actual behavior
  - Environment details (OS, Node version, etc.)

### Feature Requests

- Describe the proposed feature
- Provide context and use cases
- Be open to discussion

## Code of Conduct

- Be respectful and inclusive
- Collaborate constructively
- Focus on technical merit

## Questions?

If you have questions, please:

- Check existing documentation
- Open an issue for discussion
- Reach out to maintainers

Thank you for contributing to Nexus UI!
