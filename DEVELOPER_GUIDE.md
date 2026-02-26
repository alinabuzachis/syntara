# Nexus UI Developer Guide

## Table of Contents

1. [Project Overview](#project-overview)
2. [Local Development Setup](#local-development-setup)
3. [Architecture](#architecture)
4. [Updating API Contracts](#updating-api-contracts)
5. [Development Workflow](#development-workflow)
6. [Testing](#testing)
7. [Performance Optimization](#performance-optimization)
8. [Debugging](#debugging)
9. [Common Pitfalls](#common-pitfalls)
10. [Best Practices](#best-practices)

## Project Overview

### Purpose

Nexus UI is a React-based application for building and managing complex automation workflows, focusing on type-safety, performance, and developer experience.

### Technology Stack

- **Frontend**: React 19, TypeScript, Wouter
- **Styling**: PatternFly 6
- **State Management**: TanStack Query
- **API Integration**: openapi-fetch, openapi-react-query
- **Testing**: Vitest, React Testing Library
- **Build**: Vite, npm workspaces

## Local Development Setup

### Prerequisites

- Node.js 22+
- npm 10+
- Git

### Initial Setup

```bash
# Clone the repository
git clone https://github.com/syntara-orchestration/syntara-ui.git
cd nexus-ui

# Install dependencies
npm ci

# Start development environment
npm start
```

### Environment Ports

- UI: http://localhost:5173
- Mock API: http://localhost:3000

## Architecture

### Monorepo Structure

- `packages/nexus-ui`: Main React application
- `packages/nexus-contracts`: OpenAPI TypeScript types
- `packages/nexus-mock-api`: MSW-based mock API server

### Key Architectural Patterns

- Centralized routing in `src/app/AppRoute.tsx`
- Lazy-loaded components
- Type-safe API calls
- Automatic memoization via React Compiler

## Updating API Contracts

The `nexus-contracts` package contains auto-generated TypeScript types from the backend OpenAPI schemas. These must be updated whenever the backend API changes.

### Prerequisites

- Local clone of the [nexus backend](https://github.com/syntara-orchestration/syntara) repository
- The backend repo should be at a sibling path or you'll need to adjust the paths below

### Updating Contracts

```bash
cd packages/nexus-contracts

# Generate TypeScript types from OpenAPI schemas
# Replace /path/to/nexus with your local backend path
npx openapi-typescript /path/to/nexus/schemas/workflows/workflow-api.yaml \
  --output ./src/workflow-api.ts --default-non-nullable false

npx openapi-typescript /path/to/nexus/schemas/tool_management/tools.yaml \
  --output ./src/tools.ts --default-non-nullable false

npx openapi-typescript /path/to/nexus/schemas/tool_management/tool-providers.yaml \
  --output ./src/tool-providers.ts --default-non-nullable false

# Copy example workflows to mock API
cp -r /path/to/nexus/tests/integration/workflow/examples ../nexus-mock-api/src/

# Format the generated files
cd ../..
npm run format
```

### Alternative: Using the gen script

If you have SSH access to the backend repo, you can use the built-in script:

```bash
cd packages/nexus-contracts
npm run gen
```

This will:

1. Clone the backend repo temporarily
2. Generate all TypeScript types
3. Copy example workflows
4. Clean up the cloned repo

### After Updating

1. Run tests to ensure nothing is broken: `npm test`
2. Check for TypeScript errors in the UI: `npm run tsc --prefix packages/nexus-ui`
3. Update any UI code that uses changed types
4. Commit the updated contract files

### Contract Files

| File                | Source Schema                                 | Description                  |
| ------------------- | --------------------------------------------- | ---------------------------- |
| `workflow-api.ts`   | `schemas/workflows/workflow-api.yaml`         | Workflow and execution types |
| `tools.ts`          | `schemas/tool_management/tools.yaml`          | Tool management types        |
| `tool-providers.ts` | `schemas/tool_management/tool-providers.yaml` | Tool provider types          |

## Development Workflow

### Branch Strategy

- `main`: Stable production branch
- Feature branches: `feature/descriptive-name`
- Bugfix branches: `bugfix/descriptive-name`

### Typical Development Process

1. Create a new branch
2. Make changes
3. Run tests: `npm test`
4. Format code: `npm run format`
5. Create pull request to `main`

### Package-Specific Commands

```bash
# UI Package
cd packages/nexus-ui
npm run test          # Run tests
npm run build         # Build package
npm run start         # Start dev server

# Mock API Package
cd packages/nexus-mock-api
npm run start         # Start mock API server
```

## Testing

### Testing Tools

- Vitest
- React Testing Library
- Mock Service Worker (MSW)

### Running Tests

```bash
# Run all tests
npm test

# Run specific package tests
npm run test:ui
npm run test:nexus-mock-api

# Run with coverage
npm run test:coverage

# End to end tests
npm run e2e
```

### Writing Tests

- Use React Testing Library
- Mock external dependencies
- Cover edge cases
- Aim for high coverage

## Performance Optimization

### Techniques

- Use React Compiler
- Lazy load routes and components
- Minimize re-renders
- Use TanStack Query for efficient data fetching

### Profiling

- Use React DevTools
- Analyze bundle size: `npm run build`
- Check Lighthouse metrics

## Debugging

### Common Debugging Tools

- React DevTools
- Browser Developer Console
- Vitest debug mode
- Source map support

### Debugging Strategies

- Use `console.log()` sparingly
- Leverage TypeScript for type checking
- Use React DevTools performance tab
- Check network requests in browser tools

## Common Pitfalls

### Dependency Issues

- Always use `npm ci` instead of `npm install`
- Keep dependencies updated
- Check peer dependency conflicts

### Performance Warnings

- Avoid unnecessary re-renders
- Use memoization carefully
- Be mindful of bundle size

## Best Practices

### Code Quality

- Follow TypeScript strict mode
- Use ESLint and Prettier
- Write comprehensive tests
- Keep components small and focused

### API Interaction

- Use generated OpenAPI types
- Handle loading and error states
- Use TanStack Query hooks

### State Management

- Prefer local state when possible
- Use context for global state sparingly
- Leverage React Query for server state

## Troubleshooting

### Common Issues

- Dependency conflicts
- Port already in use
- Build or type errors

### Solutions

- `npm ci` to reset dependencies
- Check Node.js and npm versions
- Refer to error messages
- Consult team or open an issue

## Continuous Learning

- Stay updated with React 19 changes
- Follow project best practices
- Contribute back to the project
