# Nexus UI

A modern full-stack application with AI-powered features.

## Quick Start

```bash
# Install dependencies
npm ci

# Start both frontend and backend
npm start
```

The frontend will be available at http://localhost:5173 and the backend at http://localhost:3000.

## Project Structure

```
next-ui/
├── packages/
│   ├── frontend/    # React 19 + Vite application
│   └── backend/     # Express server with AI streaming
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
npm start              # Start both frontend and backend
npm run frontend       # Start frontend only
npm run backend        # Start backend only

# Building
npm run build          # Build all packages

# Testing
npm test               # Run tests in all packages

# Docker
npm run docker:build   # Build Docker images
npm run docker:run     # Run with Docker Compose
```

## Environment Setup

Create a `.env` file in `packages/backend/` (see `.env.example`):

```env
PORT=3000
OPENAI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
```

## Technology Stack

### Frontend
- React 19 with TypeScript
- Vite (Rolldown bundler)
- TailwindCSS 4
- Base UI components
- Wouter (routing)
- Fuse.js (search)

### Backend
- Express 5
- TypeScript
- Vercel AI SDK
- Ollama AI provider
- Model Context Protocol (MCP) SDK
