# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

```bash
# Development
npm start                  # Start all services (UI, framework, mock API)
npm run start:nexus-ui     # Start UI only
npm run start:nexus-mock-api # Start mock API only

# Testing
npm test                   # Run all tests
npm run test:nexus-ui      # Run UI package tests
npm run test:coverage      # Run tests with coverage report

# Run a specific test
cd packages/nexus-ui
npm run vitest -- path/to/specific/test.test.ts

# Build
npm run build              # Build all packages
npm run build:nexus-ui     # Build UI package
npm run gen                # Regenerate API contracts

# Code Quality
npm run format             # Format code
npm run format:check       # Check formatting
```

## Architectural Context

### Core Architecture Principles

- **Modular Monorepo**: Separated packages with distinct responsibilities
- **Type-Driven Development**: Strict TypeScript and generated OpenAPI types
- **Reactive Design**: Modern React patterns with compiler-driven optimizations

### Key Architectural Components

#### Routing Strategy

- Centralized in `packages/nexus-ui/src/app/AppRoute.tsx`
- Lazy-loaded components via `navigationItems.tsx`
- Lightweight routing with Wouter

#### State Management

- Server state via TanStack Query
- Type-safe API interactions
- Automatic memoization through React Compiler

#### Component Ecosystem

- Headless UI components (Base UI)
- Shared library in `nexus-ui-framework`
- Styling: TailwindCSS 4
- Form handling: react-hook-form

### Critical Development Workflows

1. Dependency Management
   - `nexus-ui-framework` must be built before `nexus-ui`
   - Automatic rebuilds in watch mode
   - Hot reloading for framework changes

2. API Contract Generation
   - Types generated from external OpenAPI specs
   - Shared between UI and Mock API
   - Update via `npm run gen`

3. Mocking Approach
   - MSW (Mock Service Worker) for consistent API mocking
   - Enables uniform development and testing environments

## Development Constraints

### Technical Boundaries

- Node.js 22+ required
- TypeScript 5.9
- React 19
- Vite build system
- npm workspaces

### Port Configuration

- UI: http://localhost:5173
- Mock API: http://localhost:3000

## Deployment Considerations

- **Containerization**: Podman (local), Docker Buildx (CI/CD)
- **Multi-architecture**: Supports linux/amd64 and linux/arm64
- **Production build**: Nginx-based (UI), Node.js (Mock API)
- **Authentication**: Basic (demo/coffee)
- **Separate containers**: UI and Mock API
- **Build script**: `./build-multiarch.sh` for multi-arch Podman builds

## Performance Notes

- React Compiler for automatic optimization
- Vite for rapid builds
- Lazy loading of routes/components
- Vitest for lightweight testing
