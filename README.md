# Nexus UI

A modern React application with a shared UI component library for building automation workflows.

## Quick Start

```bash
# Install dependencies
npm ci

# Start development (builds framework, runs dev server, starts mock API)
npm start
```

The application will be available at http://localhost:5173 with the mock API running on http://localhost:3000.

## Project Structure

This is a monorepo using npm workspaces:

```
next-ui/
├── packages/
│   ├── nexus-ui/              # Main React 19 application
│   ├── nexus-ui-framework/    # Shared UI component library
│   ├── nexus-contracts/       # OpenAPI TypeScript types
│   └── nexus-mock-api/        # MSW-based mock API server
├── package.json               # Root workspace configuration
└── Containerfile              # Production deployment
```

## Development

### Prerequisites

- Node.js 22+ (see package.json for exact requirements)
- npm (comes with Node.js)

### Available Commands

```bash
# Development
npm start                          # Start all services (framework watch + UI dev server + mock API)
npm run start:nexus-ui             # Start UI only (requires framework to be built)
npm run start:nexus-ui-framework   # Start framework in watch mode
npm run start:nexus-mock-api       # Start mock API server only

# Building
npm run build                      # Build all packages
npm run build:nexus-ui             # Build UI only
npm run build:nexus-ui-framework   # Build framework only

# Testing & Linting
npm test                           # Run all tests (format check + ESLint + TypeScript)
npm run format                     # Format code with Prettier
npm run format:check               # Check code formatting

# API Contracts
npm run gen                        # Regenerate TypeScript types from OpenAPI specs

# Deployment
npm run podman:build               # Build all container images
npm run podman:build:nexus-ui      # Build UI image only
npm run podman:build:nexus-mock-api # Build mock API image only
npm run podman:run                 # Run all containers (UI on 4000, API on 3000)
npm run podman:run:nexus-ui        # Run UI container only
npm run podman:run:nexus-mock-api  # Run mock API container only
```

## Technology Stack

### Nexus UI (Application)

- React 19 with TypeScript
- Vite build tool
- TailwindCSS 4
- Base UI headless components
- Wouter (routing)
- TanStack Query (data fetching)
- openapi-fetch + openapi-react-query (type-safe API client)
- Fuse.js (fuzzy search)
- ReactFlow/XYFlow (workflow diagrams)
- Lucide icons
- MSW (API mocking)

### Nexus UI Framework (Component Library)

- Base UI primitives
- TailwindCSS 4
- react-hook-form (form handling)
- Vite library mode
- TypeScript declarations
- ESM + UMD builds

### Nexus Contracts (Type Definitions)

- openapi-typescript (type generation)
- Generated from [syntara-orchestration/syntara](https://github.com/syntara-orchestration/syntara) OpenAPI specs
- Shared types for UI and mock API

### Nexus Mock API (Development Server)

- MSW (Mock Service Worker)
- @mswjs/http-middleware (Node.js server)
- tsx (TypeScript execution)
- Serves mock responses for API contracts

### Build & Deployment

- npm workspaces
- Vite
- TypeScript 5.9
- ESLint 9 + Prettier
- Vitest + React Testing Library
- Podman/Docker with Nginx
