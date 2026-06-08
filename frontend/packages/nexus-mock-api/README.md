# Nexus Mock API

## Overview

`@ansible/nexus-mock-api` is the mock API server for the Nexus UI. It provides realistic API responses during development and testing so you can work on the frontend without a running backend.

Built with [MSW (Mock Service Worker)](https://mswjs.io/) and [`@mswjs/http-middleware`](https://github.com/mswjs/http-middleware), it serves mock handlers as a standalone Node.js server.

## Quick Start

```bash
# From the repository root
npm run start:mock-api

# Or from this package
npm start
```

The mock API runs on **http://localhost:3000** by default.

## How It Works

- Serves mock responses that match the OpenAPI contracts defined in `@ansible/nexus-contracts`
- Includes example workflows loaded from the backend test fixtures
- Used automatically when running `npm start` from the repository root (starts alongside the UI)

## Example Workflows

Example workflow definitions live in `src/examples/`. These are copied from the backend repo during contract generation (`npm run gen`).

| Directory     | Description                      |
| ------------- | -------------------------------- |
| `agentic/`    | AI agent-based workflow examples |
| `real-world/` | Real-world workflow patterns     |

## Limitations

- **No WebSocket support** — WebSocket channels require the real backend server
- **No persistent state** — Data resets on restart
- **Simplified responses** — Some edge cases may not match the real API exactly
