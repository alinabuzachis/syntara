# Nexus UI

A modern full-stack application with AI-powered features.

## Quick Start

```bash
# Install dependencies
npm ci

# Start
npm start
```

The frontend will be available at http://localhost:5173.

## Project Structure

```
next-ui/
├── packages/
│   └── frontend/    # React 19 + Vite application
streaming
├── package.json     # Root workspace configuration
└── docker-compose.yml
```

## Development

### Prerequisites

- Node.js (see package.json for version requirements)
- npm (comes with Node.js)

### Available Commands

```bash
# Development
npm start

# Building
npm run build

# Testing
npm test               # Run tests in all packages

# Docker
npm run docker:build   # Build Docker images
npm run docker:run     # Run with Docker Compose
```

## Technology Stack

### Frontend
- React 19 with TypeScript
- Vite (Rolldown bundler)
- TailwindCSS 4
- Base UI components
- Wouter (routing)
- Fuse.js (search)
