# AI Agent Instructions

## Project Overview

Nexus is a distributed multi-agent system that enables coordinated AI agents to work together on complex tasks. The project uses Python 3.12, `uv` for dependency management, and enforces strict code quality standards.

## General Instructions

### Technology Choices

**Data Modeling**:

- Use **SQLModel** for all data models (both database tables and API schemas)
- **Do NOT** create separate Pydantic models for API and SQLAlchemy models for database
- Example: A `User` model defined with SQLModel serves both as a database table AND as a FastAPI request/response schema

### Environment Setup

- Use always `uv` to manage dependencies and run commands.
- The project includes a local development environment through make commands.

### Development Workflow

1. **After making changes**: All changes must pass:

   - `make format` - Code formatting
   - `make lint` - Linting checks (includes pre-commit hooks)
   - `make test-all` - All tests
   - `make typecheck` - Type checking (mypy strict mode)

2. **Documentation**: Update [README.md](README.md) if changes affect:

   - Installation steps
   - Available commands
   - Project structure
   - Development workflow

3. **CI Alignment**: Ensure [.github/workflows/ci.yml](.github/workflows/ci.yml) is updated if:
   - New dependencies are added
   - Test structure changes
   - Quality check requirements change
   - Database schema or migrations are modified
