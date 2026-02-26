# Nexus UI

## Overview

Nexus UI is a cutting-edge React application designed for building and managing complex automation workflows. It provides a robust, type-safe, and performant solution for creating, visualizing, and managing automated processes.

### Key Features

- 🚀 Modern React 19 with TypeScript
- 🎨 Responsive UI with PatternFly 6
- 🔀 Advanced workflow canvas and node-based automation
- 🔒 Type-safe API integrations
- 🧪 Comprehensive testing infrastructure
- 🚢 Docker/Podman containerization

## Quick Start

### Prerequisites

- Node.js 22+ (recommended)
- npm 10+

### Installation

```bash
# Clone the repository
git clone https://github.com/syntara-orchestration/syntara-ui.git
cd nexus-ui

# Install dependencies
npm ci
```

### Development Server

```bash
# Start all services (framework, UI, mock API)
npm start
```

### Connecting to Real Backend

To use the real Nexus backend instead of the mock API:

1. Clone and setup the backend from https://github.com/syntara-orchestration/syntara
2. Follow the backend README to start the API server
3. Export the backend URL and start the UI:

```bash
export VITE_API_URL=http://localhost:8000
npm start
```

### Access Applications

- **UI**: http://localhost:5173
- **Mock API**: http://localhost:3000

### Common Commands

```bash
# Run tests
npm test

# Build for production
npm run build

# Run linter
npm run format:check

# Generate API contracts
npm run gen
```

### Troubleshooting

- Ensure you're using Node.js 22+
- Run `npm ci` instead of `npm install`
- Check that all dependencies are installed correctly
- Refer to [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines
- Check out our [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) for comprehensive development information

## Project Documentation

- [Contributing Guidelines](CONTRIBUTING.md)
- [Developer Guide](DEVELOPER_GUIDE.md)
- [Architectural Overview](CLAUDE.md)

## Project Structure

This is a monorepo using npm workspaces:

```
nexus-ui/
├── packages/
│   ├── nexus-ui/              # Main React 19 application
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
npm start                          # Start all services (UI dev server + mock API)
npm run start:ui                   # Start UI only
npm run start:mock-api             # Start mock API server only

# Building
npm run build                      # Build all packages
npm run build:ui                   # Build UI only

# Testing & Linting
npm test                           # Run all tests (format check + ESLint + TypeScript)
npm run format                     # Format code with Prettier
npm run format:check               # Check code formatting

# Playwright integration tests
npm run e2e                        # Run Playwright tests
npm run e2e:ui                     # Run Playwright UI mode

# E2E environment
# Tests run against the mock backend by default.
# UI runs on port 4173 and mock API on port 3300.
# Override ports with NEXUS_E2E_PORT and NEXUS_E2E_API_PORT.


# API Contracts
npm run gen                        # Regenerate TypeScript types from OpenAPI specs

# Deployment
npm run podman:build               # Build all container images
npm run podman:build:ui            # Build UI image only
npm run podman:build:mock-api      # Build mock API image only
npm run podman:run                 # Run all containers (UI on 4000, API on 3000)
npm run podman:run:ui              # Run UI container only
npm run podman:run:mock-api        # Run mock API container only

# Multi-architecture builds (AMD64 + ARM64)
./build-multiarch.sh               # Build multi-arch images with Podman
./build-multiarch.sh push          # Build and push to registry
```

## Multi-Architecture Container Builds

The project uses **Podman** for local container builds and supports multiple architectures (AMD64 and ARM64).

### Local Development (Podman)

All local container operations use Podman:

```bash
# Multi-architecture builds (AMD64 + ARM64)
./build-multiarch.sh               # Build for both architectures
./build-multiarch.sh push          # Build and push to registry

# Single-architecture builds (faster for development)
podman build -f packages/nexus-ui/Containerfile -t nexus-ui:latest .
podman build -f packages/nexus-mock-api/Containerfile -t nexus-mock-api:latest .

# Run containers
podman run -p 4000:80 nexus-ui:latest
podman run -p 3000:3000 nexus-mock-api:latest
```

### Custom Registry Configuration

```bash
# Build and push to custom registry
REGISTRY=ghcr.io REPOSITORY_OWNER=your-org ./build-multiarch.sh push
```

### CI/CD (Docker Buildx)

GitHub Actions uses Docker Buildx for automated builds. When you push to `main`:

- Builds images for both `linux/amd64` and `linux/arm64`
- Pushes multi-arch manifests to GitHub Container Registry
- Creates a single image that works on both architectures

### Supported Platforms

- **linux/amd64** - Intel/AMD x86_64 processors
- **linux/arm64** - ARM64/AArch64 processors (Apple Silicon, ARM servers, Raspberry Pi 4+)

Multi-arch images automatically select the correct architecture when pulled.

## Contributing

We welcome contributions! Please read our [Contributing Guidelines](CONTRIBUTING.md) for details on how to get started, our development process, and how you can contribute.

## Technology Stack

### Nexus UI (Application)

- React 19 with TypeScript
- Vite build tool
- PatternFly 6
- Base UI headless components
- Wouter (routing)
- TanStack Query (data fetching)
- openapi-fetch + openapi-react-query (type-safe API client)
- Fuse.js (fuzzy search)
- ReactFlow/XYFlow (workflow diagrams)
- MSW (API mocking)

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
