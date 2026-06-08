# Claude Agent Instructions

This is a monorepo with backend (Python/FastAPI) and frontend (React/TypeScript) components. See component-specific instructions:

- [backend/CLAUDE.md](backend/CLAUDE.md) — Backend-specific Claude guidance
- [backend/AGENTS.md](backend/AGENTS.md) — Backend development standards, database migrations, testing
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — Frontend-specific Claude guidance, skills, PR checklist

## Monorepo Commands

```bash
make install        # Install all dependencies
make format         # Format both codebases
make lint           # Lint both codebases
make test           # Run all tests
make typecheck      # Type-check both codebases
make gen-contracts  # Regenerate TypeScript types from backend OpenAPI specs
```

## Contract Generation

TypeScript API types are generated from backend OpenAPI specs. In this monorepo, specs are at `backend/src/nexus/schemas/` and types are generated to `frontend/packages/nexus-contracts/src/`. Run `make gen-contracts` after changing any backend API schema.
