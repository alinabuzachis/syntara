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

### Component Development Guidelines

**CRITICAL: Always prioritize reusing and extending existing components from `nexus-ui-framework`**

Before writing any new UI code, follow this checklist:

1. **Check for Existing Components**
   - Search `packages/nexus-ui-framework/src/components/` for existing components
   - Review current components: Button, Alert, Switch, Table, Dialog, EmptyState, Menu, Tooltip, Checkbox, etc.
   - Verify if an existing component can be reused or extended

2. **Component Location Strategy**
   - **Reusable/Generic components** → `packages/nexus-ui-framework/src/components/`
   - **Application-specific components** → `packages/nexus-ui/src/components/`
   - When in doubt, prefer framework location for better reusability

3. **Building New Framework Components**
   - ALWAYS use `@base-ui-components/react` as the foundation
   - Build headless, accessible components following Base UI patterns
   - Include comprehensive tests (see existing `.test.tsx` files)
   - Export from `packages/nexus-ui-framework/src/index.tsx`

4. **Custom Hooks**
   - Extract reusable logic into custom hooks
   - Place hooks in `packages/nexus-ui-framework/src/hooks/` (create if needed)
   - Follow naming convention: `useXxx`
   - Include TypeScript types

5. **Code Abstraction**
   - Identify and eliminate redundant code patterns
   - Create shared utilities for common operations
   - Use composition over duplication
   - Follow DRY (Don't Repeat Yourself) principles

6. **React Best Practices**
   - Leverage React 19 features
   - Use functional components and hooks
   - Use proper TypeScript typing (avoid `any`)
   - Implement proper error boundaries
   - Follow component composition patterns
   - Use proper key props for lists
   - Prefer controlled components for forms (react-hook-form)
   - Use proper semantic HTML

**Example Workflow:**

```text
User Request: "Add a confirmation dialog"
Step 1: Check nexus-ui-framework for Dialog component ✓ (exists)
Step 2: Check for ConfirmDialog variant ✓ (exists)
Step 3: Use existing ConfirmDialog from framework
Result: No new code needed, use import from 'nexus-ui-framework'
```

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

- UI: <http://localhost:5173>
- Mock API: <http://localhost:3000>

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
