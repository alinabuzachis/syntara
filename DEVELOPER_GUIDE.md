# Nexus UI Developer Guide

## Table of Contents

1. [Project Overview](#project-overview)
2. [Local Development Setup](#local-development-setup)
3. [Architecture](#architecture)
4. [Development Workflow](#development-workflow)
5. [Testing](#testing)
6. [Performance Optimization](#performance-optimization)
7. [Debugging](#debugging)
8. [Common Pitfalls](#common-pitfalls)
9. [Best Practices](#best-practices)

## Project Overview

### Purpose

Nexus UI is a React-based application for building and managing complex automation workflows, focusing on type-safety, performance, and developer experience.

### Technology Stack

- **Frontend**: React 19, TypeScript, Wouter
- **Styling**: TailwindCSS 4
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
- `packages/nexus-ui-framework`: Shared UI component library
- `packages/nexus-contracts`: OpenAPI TypeScript types
- `packages/nexus-mock-api`: MSW-based mock API server

### Key Architectural Patterns

- Centralized routing in `src/app/AppRoute.tsx`
- Lazy-loaded components
- Type-safe API calls
- Automatic memoization via React Compiler

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

# Framework Package
cd packages/nexus-ui-framework
npm run dev           # Component development
npm run build         # Build library
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
npm run test:nexus-ui
npm run test:nexus-ui-framework

# Run with coverage
npm run test:coverage

# Interactive test runner
npm run test:ui
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
