# Imports and Modules Standards

This document defines standards for Python imports and module structure in the Nexus monorepo.

## Import Ordering

All Python files must organize imports in three sections, each alphabetically sorted:

```python
# 1. Standard library imports
import asyncio
import json
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

# 2. Third-party package imports
import httpx
import structlog
from fastapi import FastAPI, HTTPException, Request, status
from pydantic import ConfigDict, ValidationError
from sqlalchemy import BigInteger, String, Text, text
from sqlmodel import Column, DateTime, Field, Index

# 3. Local nexus imports (organized by domain, alphabetically)
from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.core.config.base import get_settings
from nexus.core.models import User, UserRole
from nexus.workflows.models import Execution, ExecutionStatus, Workflow
```

**Rules:**

- Blank line separates each section
- Within each section: alphabetical order by module path
- Group `import` statements before `from ... import` statements within each section
- Local nexus imports are sorted alphabetically by full module path (e.g., `nexus.agent_orchestrator` before `nexus.core`)
- No arbitrary grouping or domain-specific subsections within the local import block

**Tooling Enforcement:**

This is automatically enforced by `make format` via Ruff with isort (I) rules enabled:

```toml
[tool.ruff.lint]
select = ["ALL"]  # Includes isort (I) rules
```

Violations of import order will be caught by `make lint` and auto-fixed by `make format`.

## `__init__.py` Conventions

### No Re-exports

Nexus is not a library — it has no external consumers or public API to maintain. `__init__.py` files should **not** re-export symbols. Re-exports introduce circular import risks and add complexity without value.

**Standard:** Use full import paths to the defining module:

```python
# Correct — import from the defining module
from nexus.workflows.models.workflow import Workflow
from nexus.workflows.models.execution import Execution, ExecutionStatus

# Wrong — import via __init__.py re-export
from nexus.workflows.models import Workflow, Execution
```

Full import paths improve code readability, make it easier to trace where symbols are defined, and eliminate circular import issues.

**`__init__.py` files should be empty or minimal.** If a docstring is needed to describe the package, that is acceptable, but do not add re-exports or `__all__` definitions.

**Migration:** Existing re-exports are being removed under [AAP-67182](AAP-67182). New code must use full import paths from the start.

## TYPE_CHECKING Pattern

Use `TYPE_CHECKING` to avoid circular imports and reduce runtime import overhead.

**When to use:**

- Type hints that would cause circular imports
- Type hints for expensive-to-import modules (especially in hot paths)
- Forward references that aren't needed at runtime

**Pattern:**

```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from uuid import UUID
    from nexus.workflows.models.workflow import Workflow
    from nexus.workflows.models.workflow_version import WorkflowVersion
```

**Example (from `src/nexus/workflows/models/execution.py`):**

```python
from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any, ClassVar
from uuid import UUID

from pydantic import ConfigDict
from sqlalchemy import BigInteger, String, Text, text
from sqlmodel import Column, DateTime, Field, Index, Relationship

if TYPE_CHECKING:
    from nexus.workflows.models.activity_execution import ActivityExecution
    from nexus.workflows.models.workflow import Workflow
    from nexus.workflows.models.workflow_version import WorkflowVersion


class Execution(UserOwnedResource, SoftDeletableResource, table=True):
    """Execution SQLModel for workflow runtime instances."""

    # Relationships (TYPE_CHECKING imports used here)
    workflow: "Workflow" = Relationship(back_populates="executions")
    workflow_version: "WorkflowVersion" = Relationship(back_populates="executions")
    activities: list["ActivityExecution"] = Relationship(back_populates="execution")
```

**Key points:**

- Imports inside `if TYPE_CHECKING:` blocks are only loaded during type checking (mypy, IDE)
- Use deferred evaluation (quoted annotations) for type hints: `workflow: "Workflow"` instead of `workflow: Workflow` — this avoids runtime evaluation of the import
- This breaks circular dependencies between models that reference each other

## Enum and StrEnum over Literal

Prefer `Enum` or `StrEnum` over `Literal` for defining fixed sets of values. `Enum` types are extensible, introspectable, and produce clearer error messages than `Literal` unions.

```python
# Correct — use StrEnum
from enum import StrEnum

class ExecutionStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

# Wrong — avoid Literal for fixed value sets
from typing import Literal
ExecutionStatus = Literal["pending", "running", "completed", "failed"]
```

This does not affect the use of quoted annotations for deferred evaluation (e.g., `workflow: "Workflow"` for `TYPE_CHECKING` imports).

## Domain Module Structure

Each domain follows a consistent structure:

```
src/nexus/{domain}/
├── __init__.py           # Empty or minimal (no re-exports)
├── router.py             # FastAPI routes (auto-discovered by core.router_discovery)
├── models/
│   ├── __init__.py       # Package marker only (no re-exports)
│   ├── {entity}.py       # One model per file
│   └── ...
├── services/
│   └── {domain}_service.py
├── exceptions.py         # Domain-specific exceptions (optional)
├── error_handlers.py     # FastAPI exception handlers (optional)
├── utils/                # Domain-specific utilities (optional)
└── ws/                   # WebSocket handlers (optional)
```

**Router Auto-Discovery:**

Routers are automatically discovered and registered by `nexus.core.router_discovery` if they:

1. Are located at `src/nexus/{domain}/router.py` or `src/nexus/api/v1/{module}.py`
2. Export a router via one of these (tried in order):
   - A `router` variable (an `APIRouter` instance) — most common
   - A `build_router()` function that returns an `APIRouter`
   - A `build_{module}_router()` function that returns an `APIRouter`

**Example (`src/nexus/workflows/router.py`):**

```python
"""Workflow API endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.api.auth import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.workflows.models import WorkflowListParams
from nexus.workflows.services import WorkflowService

router = APIRouter(prefix="/workflows", tags=["workflows"])
```

**Models Organization:**

- One entity per file: `models/workflow.py`, `models/execution.py`, `models/activity_execution.py`
- Use SQLModel for both database tables and API schemas (no separate Pydantic models)
- Re-export all public models in `models/__init__.py`

**Services:**

- Domain-specific business logic lives in `services/{domain}_service.py`
- Services are dependency-injected via FastAPI `Depends()`

## When to Create a New Module

**Create a new domain module when:**

- Adding a new API resource with distinct business logic
- Introducing a new bounded context (DDD-style domain boundary)
- The functionality doesn't naturally fit into existing domains

**Extend an existing module when:**

- Adding related entities to an existing domain (e.g., `WorkflowVersion` to `workflows`)
- Adding new operations to existing resources
- Implementing additional API endpoints for existing entities

**Guidelines:**

- Prefer fewer, well-organized modules over many small modules
- Avoid creating modules for single classes unless they represent a distinct domain
- Follow the existing pattern: if similar functionality exists in another domain, mirror that structure

## Tooling vs Convention

**Automatically enforced by tooling:**

- Import ordering (Ruff isort rules via `make format` and `make lint`)
- Unused imports in non-`__init__.py` files (Ruff F401)
- Import style (Ruff I rules)

**Enforced by convention (code review):**

- `__all__` completeness in `__init__.py` files
- Proper use of `TYPE_CHECKING` for circular import avoidance
- Module structure (one entity per file, router auto-discovery)
- Domain organization and module boundaries

**Validation:**

Run these commands before committing:

```bash
make format    # Auto-fix import order
make lint      # Check all code quality rules
make typecheck # Verify type hints (mypy strict mode)
```

## Reference

| File | Purpose |
|---|---|
| `pyproject.toml` | Ruff isort configuration, per-file ignores for `__init__.py` |
| `src/nexus/core/router_discovery.py` | Router auto-discovery logic |
| `src/nexus/workflows/models/__init__.py` | Example of `__all__` re-export pattern |

Generated By: Claude Code (Claude Opus 4.6)
