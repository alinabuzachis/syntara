# AI Agent Instructions

This is a monorepo with backend and frontend components. See component-specific agent instructions:

- [backend/AGENTS.md](backend/AGENTS.md) — Backend development standards (SQLModel, Alembic migrations, uv, pytest, mypy)
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — Frontend development standards (React, TypeScript, PatternFly, Vitest, Playwright)

## Monorepo-Specific Guidance

- Use `make install` before running any checks or tests
- Backend changes that modify API schemas require running `make gen-contracts` and including the regenerated types
- The root `Makefile` delegates to `backend/Makefile` and `frontend/package.json` scripts
- The root `podman-compose.yml` provides the full stack for local development
