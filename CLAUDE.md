# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo using npm workspaces with four packages:

- **packages/nexus-ui**: React 19 + TypeScript + Vite application using TailwindCSS 4 and Base UI components
- **packages/nexus-ui-framework**: Shared UI component library built as a Vite library package with Base UI, consumed by nexus-ui
- **packages/nexus-contracts**: OpenAPI TypeScript type definitions generated from syntara-orchestration/syntara specs
- **packages/nexus-mock-api**: MSW-based mock API server for development/testing (runs on port 3000)

## Development Commands

### Starting Development

```bash
# Start all development services (builds framework, runs nexus-ui dev server, starts mock API)
npm start

# Start nexus-ui only (requires framework to be built first)
npm run start:nexus-ui

# Start framework in watch mode only
npm run start:nexus-ui-framework

# Start mock API server only
npm run start:nexus-mock-api
```

The nexus-ui dev server runs on port 5173, and the mock API runs on port 3000.

### Building

```bash
# Build all packages (builds framework first, then nexus-ui)
npm run build

# Build framework only
npm run build:nexus-ui-framework

# Build nexus-ui only
npm run build:nexus-ui
```

### Testing and Linting

```bash
# Run all tests (format check + package tests)
npm test

# Format code with Prettier
npm run format

# Check formatting
npm run format:check

# Test individual packages
npm run test:nexus-ui              # ESLint + TypeScript check + Vitest
npm run test:nexus-ui-framework    # ESLint + TypeScript check
```

### Per-Package Commands

```bash
cd packages/nexus-ui
npm start          # Vite dev server
npm run build      # TypeScript check + Vite build
npm run test       # ESLint + TypeScript check + Vitest
npm run vitest     # Run Vitest tests only
npm run test:ui    # Run Vitest with UI
npm run test:coverage  # Run Vitest with coverage report
npm run eslint     # ESLint only
npm run tsc        # TypeScript check only

cd packages/nexus-ui-framework
npm start          # Vite build in watch mode
npm run dev        # Vite dev server for component development
npm run build      # Vite library build
npm run test       # ESLint + TypeScript check
npm run eslint     # ESLint only
npm run tsc        # TypeScript check only
```

### Deployment

```bash
# Build all Podman/Docker images (nexus-ui and nexus-mock-api)
npm run podman:build

# Build nexus-ui image only
npm run podman:build:nexus-ui

# Build mock API image only
npm run podman:build:nexus-mock-api

# Run all containers (UI on port 4000, mock API on port 3000)
npm run podman:run

# Run nexus-ui container only
npm run podman:run:nexus-ui

# Run mock API container only
npm run podman:run:nexus-mock-api
```

The nexus-ui Containerfile creates a production build with Nginx and basic auth (demo/coffee).

### Generating API Contracts

```bash
# Regenerate TypeScript types from OpenAPI specs (clones syntara-orchestration/syntara repo, generates types, formats code)
npm run gen
```

This clones the syntara-orchestration/syntara repository, generates TypeScript types from OpenAPI specs in `packages/nexus-contracts/src/`, then cleans up.

## Architecture

### Package Dependencies

Package dependency graph:

- **nexus-ui-framework** → standalone (no internal dependencies)
- **nexus-contracts** → standalone (generates types from external OpenAPI specs)
- **nexus-mock-api** → depends on nexus-contracts
- **nexus-ui** → depends on nexus-ui-framework and nexus-contracts

The nexus-ui-framework must be built before nexus-ui can run. Both the framework and contracts are consumed via file dependencies in package.json.

When developing:

1. Framework changes trigger automatic rebuild in watch mode (`npm start` or `npm run start:nexus-ui-framework`)
2. Nexus-ui hot-reloads when framework dist changes
3. Root `npm start` handles this orchestration automatically, starting framework watch mode, UI dev server, and mock API concurrently

### Nexus UI Application

- **Router**: Wouter for client-side routing
- **Route Structure**: Nested route definitions in [AppRoute.tsx](packages/nexus-ui/src/app/AppRoute.tsx) - centralized object defining all route paths
- **Navigation**: Centralized navigation tree in [navigationItems.tsx](packages/nexus-ui/src/app/navigationItems.tsx) with lazy-loaded components
- **Layout**: Main app wrapper in [App.tsx](packages/nexus-ui/src/app/App.tsx) with header ([AppHeader](packages/nexus-ui/src/app/AppHeader.tsx)) and router ([AppRouter](packages/nexus-ui/src/app/AppRouter.tsx))
- **Data Fetching**: TanStack Query (React Query) for server state management via [QueryClientProvider](packages/nexus-ui/src/main.tsx)
- **API Client**: openapi-fetch + openapi-react-query for type-safe API calls using nexus-contracts types
- **Search**: Fuse.js for fuzzy search functionality
- **React Compiler**: Enabled via babel-plugin-react-compiler for automatic memoization
- **Styling**: TailwindCSS 4 via @tailwindcss/vite plugin
- **Testing**: Vitest with React Testing Library, jsdom environment, and coverage support
- **Mocking**: MSW (Mock Service Worker) for API mocking in development and tests

Route components live in `packages/nexus-ui/src/routes/` organized by feature area (automations, automation-builder, configuration, documentation, welcome).

### Nexus UI Framework

A library package providing:

- Reusable UI components built on Base UI primitives
- Components: Button, IconButton, Menu, Scrollable, Toolbar
- Form components in `src/forms/` built with react-hook-form
- Exports both ESM and UMD builds via Vite library mode
- Includes TypeScript declarations generated by vite-plugin-dts
- Uses vite-plugin-externalize-deps to exclude peer dependencies from bundle
- Exports CSS stylesheet via `@ansible/nexus-ui-framework/style.css`

Base UI components, React, and React DOM are peer dependencies, allowing nexus-ui to control versions.

### Nexus Contracts

TypeScript types auto-generated from OpenAPI specifications:

- Generated from the [syntara-orchestration/syntara](https://github.com/syntara-orchestration/syntara) repository specs
- Covers tool management (tools, tool-providers) and workflow engine APIs
- Run `npm run gen` to update types (clones repo, generates types, cleans up)
- Used by both nexus-ui and nexus-mock-api for type safety

### Nexus Mock API

Development mock API server:

- Built with MSW (Mock Service Worker) and @mswjs/http-middleware
- Serves mock responses for nexus-contracts API contracts
- Runs as Node.js HTTP server on port 3000
- Containerized for deployment alongside nexus-ui

## Key Technologies

- **Frontend**: React 19, TypeScript, Wouter, TailwindCSS 4, Base UI, Vite, Lucide icons, Fuse.js, TanStack Query, ReactFlow/XYFlow
- **API Integration**: openapi-fetch, openapi-react-query, openapi-typescript (type generation)
- **Framework**: Base UI (headless components), TailwindCSS 4, Vite library mode, react-hook-form
- **Testing**: Vitest, React Testing Library, jsdom, MSW (Mock Service Worker)
- **Build**: npm workspaces, Vite, TypeScript 5.9, ESLint 9, Prettier
- **Mock API**: MSW, @mswjs/http-middleware, tsx
- **Deployment**: Podman/Docker with Nginx and basic auth
