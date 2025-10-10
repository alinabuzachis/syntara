# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo using npm workspaces with two packages:

- **packages/frontend**: React 19 + TypeScript + Vite application with TailwindCSS 4 and Base UI components
- **packages/backend**: Express + TypeScript server providing AI streaming endpoints with Model Context Protocol (MCP) integration

## Development Commands

### Starting Development Servers

```bash
# Start both frontend and backend concurrently
npm start

# Start frontend only (Vite dev server on port 5173)
npm run frontend

# Start backend only (tsx watch mode on port 3000)
npm run backend
```

### Building

```bash
# Build all packages
npm run build

# Build frontend only
npm run build --prefix packages/frontend

# Build backend only
npm run build --prefix packages/backend
```

### Frontend-Specific Commands

```bash
cd packages/frontend

# Development server
npm start

# Type checking + production build
npm run build

# Lint
npm run lint

# Preview production build
npm run preview
```

### Backend-Specific Commands

```bash
cd packages/backend

# Development with watch mode
npm start

# Type checking + build
npm run build
```

### Testing

```bash
# Run tests in all packages
npm test
```

### Docker

```bash
# Build Docker images
npm run docker:build

# Run frontend and backend containers
npm run docker:run
```

## Architecture

### Frontend Architecture

- **Router**: Uses Wouter for client-side routing
- **Navigation**: Centralized route definitions in [navigationItems.tsx](packages/frontend/src/app/navigationItems.tsx), with lazy-loaded route components
- **Layout**: App uses a login wrapper ([AppLogin](packages/frontend/src/app/AppLogin.tsx)), header ([AppHeader](packages/frontend/src/app/AppHeader.tsx)), and router ([AppRouter](packages/frontend/src/app/AppRouter.tsx))
- **Route Definitions**: All routes are defined in [AppRoute.tsx](packages/frontend/src/app/AppRoute.tsx) with nested structure for sections like Configuration and Support
- **UI Components**: Uses Base UI (headless components) with TailwindCSS 4 for styling
- **Build Tool**: Uses Rolldown (next-gen bundler) via the `rolldown-vite` package for faster builds
- **React Compiler**: Enabled via babel-plugin-react-compiler for automatic memoization

### Backend Architecture

- **AI Integration**: Uses Vercel AI SDK with Ollama provider for streaming AI responses
- **MCP Integration**: Connects to multiple MCP (Model Context Protocol) servers to provide tools for the AI agent
  - MCP clients are created in [createMCPClient.ts](packages/backend/src/createMCPClient.ts) using SSE or StreamableHTTP transports
  - Tools from MCP servers are converted to AI SDK format in [getMCPClientTools.ts](packages/backend/src/getMCPClientTools.ts)
- **Main Endpoint**: `POST /api/ai/stream` accepts UIMessage arrays and streams AI responses with tool execution
- **Tool Execution**: Tools can be called directly via `POST /api/tools/:toolName` endpoint
- **System Prompt**: Configured to help users interact with Ansible Automation Platform using available MCP tools

### MCP Server Configuration

The backend connects to multiple MCP servers defined in [index.ts](packages/backend/src/index.ts):

- AAP server (port 3003)
- Dashboard server (port 3002)
- Additional servers can be enabled by uncommenting

### Environment Variables

Backend requires a `.env` file (see [.env.example](packages/backend/.env.example)):

- `OPENAI_API_KEY`: Optional OpenAI key
- `ANTHROPIC_API_KEY`: Optional Anthropic key
- `PORT`: Server port (default: 3000)
- `MCP_URL`: Override URL for MCP servers

## Key Technologies

- **Frontend**: React 19, TypeScript, Wouter, TailwindCSS 4, Base UI, Vite/Rolldown, Lucide icons, Fuse.js
- **Backend**: Express 5, TypeScript, Vercel AI SDK, Ollama, MCP SDK, tsx
- **Build**: npm workspaces, Docker multi-stage builds
