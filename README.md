# Nexus UI

A modern React application with a shared UI component library for building automation workflows.

## Quick Start

```bash
# Install dependencies
npm ci

# Start development (builds framework + runs dev server)
npm start
```

The application will be available at http://localhost:5173.

## Project Structure

This is a monorepo using npm workspaces:

```
next-ui/
├── packages/
│   ├── nexus-ui/            # Main React 19 application
│   └── nexus-ui-framework/  # Shared UI component library
├── package.json             # Root workspace configuration
└── Containerfile            # Production deployment
```

## Development

### Prerequisites

- Node.js 22+ (see package.json for exact requirements)
- npm (comes with Node.js)

### Available Commands

```bash
# Development
npm start                      # Start both packages (framework watch + UI dev server)
npm run start:nexus-ui         # Start UI only (requires framework to be built)
npm run start:nexus-ui-framework  # Start framework in watch mode

# Building
npm run build                  # Build all packages
npm run build:nexus-ui         # Build UI only
npm run build:nexus-ui-framework  # Build framework only

# Testing & Linting
npm test                       # Run all tests (format check + ESLint + TypeScript)
npm run format                 # Format code with Prettier
npm run format:check           # Check code formatting

# Deployment
npm run podman:build           # Build container image
npm run podman:run             # Run container (serves on port 4000)
```

## Technology Stack

### Nexus UI (Application)

- React 19 with TypeScript
- Vite build tool
- TailwindCSS 4
- Base UI headless components
- Wouter (routing)
- Zustand (state management)
- Fuse.js (fuzzy search)
- ReactFlow/XYFlow (workflow diagrams)
- Lucide icons

### Nexus UI Framework (Component Library)

- Base UI primitives
- TailwindCSS 4
- Vite library mode
- TypeScript declarations
- ESM + UMD builds

### Build & Deployment

- npm workspaces
- Vite
- TypeScript 5.9
- ESLint 9 + Prettier
- Podman/Docker with Nginx
