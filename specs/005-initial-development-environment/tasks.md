# Tasks: Initial Development Environment Setup

**Input**: Design documents from `/specs/005-initial-development-environment/`
**Prerequisites**: plan.md, research.md, data-model.md, quickstart.md
**Feature Branch**: `005-initial-development-environment`

## Execution Flow (main)
```
1. Load plan.md from feature directory
   → Extract: podman-compose, PostgreSQL 17, Make integration
2. Load design documents:
   → data-model.md: 5 configuration entities (Container, Environment, Volume, HealthCheck, Connection)
   → quickstart.md: Developer onboarding validation
3. Generate tasks by category:
   → Setup: Infrastructure files (podman-compose.yml, .env.example, .gitignore)
   → Core: Makefile targets (db-run foreground, db-clean)
   → Integration: CI configuration (GitHub Actions service)
   → Polish: Documentation updates
4. Apply task rules:
   → Different files = mark [P] for parallel
   → Same file (Makefile) = sequential
   → Infrastructure → Implementation → CI → Documentation
5. Number tasks sequentially (T001-T008)
6. Return: SUCCESS (8 tasks ready for execution)
```

**Note**: This is infrastructure setup. No application code exists yet, so no unit/integration tests are needed. Health checks verify container readiness.

## Format: `[ID] [P?] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- Include exact file paths in descriptions

## Path Conventions
- **Single project structure** (matches existing src/, tests/ layout)
- Paths at repository root: `podman-compose.yml`, `.env.example`, `Makefile`
- Infrastructure: root directory

---

## Task Dependency Visualization

```mermaid
graph TB
    subgraph "Phase 1: Infrastructure Setup"
        T001[T001: podman-compose.yml]
        T002[T002: .env.example]
        T003[T003: .gitignore]
    end

    subgraph "Phase 2: Make Commands"
        T004[T004: Runtime Detection]
        T005[T005: make db-run foreground]
        T006[T006: make db-clean]
    end

    subgraph "Phase 3: CI & Documentation"
        T007[T007: Update CI Workflow]
        T008[T008: Update README.md]
    end

    %% Infrastructure enables Make commands
    T001 --> T004
    T002 --> T004
    T003 --> T004

    %% Sequential Make Targets
    T004 --> T005
    T005 --> T006

    %% CI and Documentation after implementation
    T006 --> T007
    T006 --> T008

    %% Styling
    style T001 fill:#d4f1d4
    style T002 fill:#d4f1d4
    style T003 fill:#d4f1d4

    style T004 fill:#fff4d4
    style T005 fill:#fff4d4
    style T006 fill:#fff4d4

    style T007 fill:#e1f5ff
    style T008 fill:#e1f5ff
```

**Legend**:
- 🟢 Green: Infrastructure (parallel execution)
- 🟡 Yellow: Make commands (sequential - same Makefile)
- 🔵 Blue: CI integration & Documentation (parallel execution)

---

## Phase 1: Infrastructure Setup

- [x] **T001** [P] Create podman-compose.yml with PostgreSQL 17 service, volume configuration, health check
  - File: `podman-compose.yml`
  - Content:
    - Service named "database"
    - Image: `postgres:17`
    - Ports: `${NEXUS_DB_PORT:-5432}:5432`
    - Volume: `nexus_postgres_data:/var/lib/postgresql/data`
    - Environment: `POSTGRES_USER=${NEXUS_DB_USER:-admin}`, `POSTGRES_PASSWORD=${NEXUS_DB_PASSWORD:-admin}`, `POSTGRES_DB=${NEXUS_DB_NAME:-nexus_api}`
    - Healthcheck: `pg_isready -U ${NEXUS_DB_USER:-admin}`, interval 5s, timeout 5s, retries 5
    - Restart policy: `unless-stopped`
  - Volume definition: `nexus_postgres_data` with driver `local`

- [x] **T002** [P] Create .env.example with documented NEXUS_DB_* variables
  - File: `.env.example`
  - Variables with inline comments:
    - `NEXUS_DB_HOST=localhost` (Database server hostname)
    - `NEXUS_DB_PORT=5432` (Database server port - change if 5432 conflicts)
    - `NEXUS_DB_USER=admin` (Database username)
    - `NEXUS_DB_PASSWORD=admin` (Database password - simple for local dev)
    - `NEXUS_DB_NAME=nexus_api` (Initial database name)
  - Add header comment explaining purpose and customization

- [x] **T003** [P] Update .gitignore to exclude .env file
  - File: `.gitignore`
  - Add entry: `.env` (ensure .env.example is NOT ignored)
  - Add comment: `# Environment variables (use .env.example as template)`
  - Verify no conflicting entries exist

---

## Phase 2: Make Commands Implementation

**Note**: All tasks modify the same Makefile - MUST be executed sequentially

- [x] **T004** Implement runtime detection for podman-compose in Makefile
  - File: `Makefile`
  - Add after help target:
    ```makefile
    # Container runtime detection
    # Use podman-compose for container orchestration (via uv)
    COMPOSE_CMD := uv run podman-compose
    ```
  - Location: Top of Makefile, before first .PHONY target
  - Note: podman-compose is installed as dev dependency via pyproject.toml

- [x] **T005** Implement make db-run target in Makefile
  - File: `Makefile`
  - Target:
    ```makefile
    .PHONY: db-run
    db-run: ## Start PostgreSQL database container (foreground, Ctrl+C to stop)
        @echo "🚀 Starting PostgreSQL database..."
        @echo "📍 Connection: postgresql://admin:admin@localhost:$${NEXUS_DB_PORT:-5432}/nexus_api"
        @echo "Press Ctrl+C to stop"
        @echo ""
        $(COMPOSE_CMD) up database
    ```
  - Dependencies: T004 (COMPOSE_CMD variable)
  - Note: Runs in foreground (no -d flag), logs visible, Ctrl+C to stop

- [x] **T006** Implement make db-clean target in Makefile
  - File: `Makefile`
  - Target:
    ```makefile
    .PHONY: db-clean
    db-clean: ## Stop database and remove all data (destructive)
        @echo "🧹 Stopping database and removing data..."
        @echo "⚠️  WARNING: This will delete all database data!"
        $(COMPOSE_CMD) down -v
        @echo "✅ Database stopped and data purged"
    ```
  - Dependencies: T004
  - Note: Simplified - only db-run and db-clean needed

---

## Phase 3: CI Integration & Documentation

- [x] **T007** [P] Update .github/workflows/ci.yml with PostgreSQL service container
  - File: `.github/workflows/ci.yml`
  - Update the `test` job (after line ~37) to add services section:
    ```yaml
    services:
      database:
        image: postgres:17
        env:
          POSTGRES_USER: admin
          POSTGRES_PASSWORD: admin
          POSTGRES_DB: nexus_api
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U admin"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    ```
  - Location: Inside `test` job, at same level as `steps`
  - Note: Database available for future integration tests

- [x] **T008** [P] Update README.md with database setup section
  - File: `README.md`
  - Add new section after "Quick Start" (around line 50):
    ```markdown
    ### Database Setup

    The project includes a PostgreSQL 17 database for local development.

    **Start database**:
    ```bash
    make db-run
    ```

    **Connection parameters**:
    - Host: `localhost`
    - Port: `5432` (customizable via `NEXUS_DB_PORT` in `.env`)
    - Database: `nexus_api`
    - Username: `admin`
    - Password: `admin`
    - Connection string: `postgresql://admin:admin@localhost:5432/nexus_api`

    **Reset database** (removes all data):
    ```bash
    make db-clean
    ```

    **Troubleshooting**:
    - **Port conflict**: Copy `.env.example` to `.env` and change `NEXUS_DB_PORT` to another value (e.g., 5433)
    - **Container won't start**: Check the logs in the terminal where `make db-run` is running
    - **Reset everything**: Stop the running database (Ctrl+C), then run `make db-clean`
    ```
  - Note: Simplified documentation for foreground-only db-run command

---

## Dependencies

### Critical Path
1. **Infrastructure** (T001-T003) → enables Make commands
2. **Runtime Detection** (T004) → enables all Make targets
3. **Make Commands** (T005-T006) → enables CI & Docs
4. **CI & Docs** (T007-T008) → implementation complete

### Parallel Execution Groups

**Group 1: Infrastructure** (can run in parallel)
- T001 (podman-compose.yml)
- T002 (.env.example)
- T003 (.gitignore)

**Group 2: Make Commands** (MUST be sequential - same Makefile)
- T004 → T005 → T006

**Group 3: Final** (can run in parallel)
- T007 (CI workflow)
- T008 (README.md)

### Dependency Graph
```
T001, T002, T003 [P]
    ↓
T004 → T005 → T006 (sequential)
    ↓
T007, T008 [P]
```

---

## Validation Checklist

### Functional Requirements (from spec.md)
- [x] FR-001: Single command to start (T005 - make db-run foreground)
- [x] FR-002: Single command to stop (foreground: Ctrl+C)
- [x] FR-003: Data persistence (T001 volume configuration)
- [x] FR-004: Port exposed to host (T001 ports mapping)
- [x] FR-005: Credentials admin/admin (T002 .env.example)
- [x] FR-006: Database named nexus_api (T002 .env.example)
- [x] FR-007: PostgreSQL version 17 (T001 docker-compose.yml)
- [x] FR-008: View logs (foreground mode shows logs directly)
- [x] FR-009: Reset database (T006 - make db-clean)
- [x] FR-010: Document connection params (T008 README.md)
- [x] FR-011: Port configuration via env var (T001 docker-compose.yml)
- [x] FR-012: Empty database (T001 - no init scripts)
- [x] FR-013: No seed data (T001 - no init scripts)
- [x] FR-014: Podman container runtime (T004 podman-compose detection)

### Constitution Compliance
- [x] Explicit configuration: All values in .env.example (T002)
- [x] Modular architecture: podman-compose.yml self-contained (T001)
- [x] Observability: Health checks, foreground logs (T001, T005)
- [x] No hardcoded values: Environment variable substitution (T001, T002)

### Infrastructure Quality
- [x] Podman-compose configured (T004)
- [x] Health check configured (T001)
- [x] Volume persistence (T001)
- [x] CI database service (T007)
- [x] Documentation complete (T008)

---

## Notes

- **No tests needed**: This is infrastructure setup with no application code yet
- **Health check is validation**: Container health check verifies PostgreSQL readiness
- **Simple passwords**: admin/admin acceptable for local development only
- **Empty database**: Intentionally no schema - future migration feature will handle it
- **Foreground execution**: db-run runs in foreground for immediate log visibility
- **Simplified commands**: Only db-run and db-clean needed for initial setup
- **Podman-compose**: Use podman-compose for container orchestration
- **Commit frequency**: Commit after each task or logical group (T001-T003, T004-T006, T007-T008)

---

## Task Execution Order

**Recommended Sequential Execution**:
1. T001, T002, T003 (parallel) - Infrastructure files
2. T004 - Runtime detection
3. T005, T006 (sequential) - Make targets (same file)
4. T007, T008 (parallel) - CI and documentation

**Total Tasks**: 8
**Parallel Opportunities**: 2 groups (T001-T003, T007-T008)
**Critical Sequential Path**: T004 → T005 → T006 (3 tasks)
**Estimated Time**: 30-60 minutes

---

**Status**: ✅ Implementation complete. Simplified setup with foreground database execution and two make commands (db-run, db-clean).
