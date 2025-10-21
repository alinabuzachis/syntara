# Data Model: Development Environment Configuration

**Feature**: Initial Development Environment Setup
**Date**: 2025-10-08
**Status**: Design Complete

## Overview

This document defines the configuration entities for the containerized PostgreSQL development environment. These are **configuration entities**, not database schema entities. The database itself starts empty (no tables, no schema) per requirements FR-012 and FR-013.

---

## Entity: Container Configuration

Represents the PostgreSQL container definition in docker-compose.yml.

### Attributes

| Attribute | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `image` | string | Yes | `postgres:17` | PostgreSQL official Docker image with version tag |
| `container_name` | string | No | Auto-generated | Container identifier (let compose auto-generate) |
| `restart` | string | No | `unless-stopped` | Restart policy for container lifecycle |
| `ports` | list[string] | Yes | `["${NEXUS_DB_PORT:-5432}:5432"]` | Host-to-container port mapping |
| `volumes` | list[string] | Yes | `["nexus_postgres_data:/var/lib/postgresql/data"]` | Volume mounts for data persistence |
| `environment` | map[string, string] | Yes | See Environment Configuration | PostgreSQL environment variables |
| `healthcheck` | HealthCheck | Yes | See HealthCheck entity | Container health monitoring |

### Validation Rules
- `image` MUST be `postgres:17` (version pinned per FR-007)
- `ports` MUST expose PostgreSQL port 5432 from container
- `ports` MUST map to `${NEXUS_DB_PORT:-5432}` on host (configurable via environment)
- `volumes` MUST include named volume for `/var/lib/postgresql/data`
- `environment` MUST define POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB

### Relationships
- Has one HealthCheck configuration
- Has one Environment Configuration
- Has one Volume Configuration

---

## Entity: Environment Configuration

Represents environment variables for PostgreSQL container and application connection.

### Attributes

| Variable | Type | Required | Default | Description | Exposed In |
|----------|------|----------|---------|-------------|------------|
| `NEXUS_DB_HOST` | string | Yes | `localhost` | Database host address | `.env.example`, Application |
| `NEXUS_DB_PORT` | integer | Yes | `5432` | Database port number | `.env.example`, docker-compose.yml |
| `NEXUS_DB_USER` | string | Yes | `admin` | Database username | `.env.example`, docker-compose.yml |
| `NEXUS_DB_PASSWORD` | string | Yes | `admin` | Database password | `.env.example`, docker-compose.yml |
| `NEXUS_DB_NAME` | string | Yes | `nexus_api` | Initial database name | `.env.example`, docker-compose.yml |
| `POSTGRES_USER` | string | Container | `${NEXUS_DB_USER}` | PostgreSQL user (internal) | docker-compose.yml |
| `POSTGRES_PASSWORD` | string | Container | `${NEXUS_DB_PASSWORD}` | PostgreSQL password (internal) | docker-compose.yml |
| `POSTGRES_DB` | string | Container | `${NEXUS_DB_NAME}` | PostgreSQL database (internal) | docker-compose.yml |

### Validation Rules
- `NEXUS_DB_PORT` MUST be integer in range 1024-65535 (unprivileged ports)
- `NEXUS_DB_HOST` MUST be valid hostname or IP address
- `NEXUS_DB_USER` MUST NOT be empty string
- `NEXUS_DB_PASSWORD` MUST NOT be empty string (PostgreSQL requirement)
- `NEXUS_DB_NAME` MUST match PostgreSQL identifier rules (alphanumeric, underscore)
- All `NEXUS_DB_*` variables MUST have defaults in `.env.example`
- `POSTGRES_*` variables derived from `NEXUS_DB_*` (mapping only)

### Relationships
- Used by Container Configuration for environment setup
- Used by Connection Configuration for application connection strings
- Defined in .env.example file
- Overridable via .env file (not committed to git)

### State Transitions
N/A (configuration is static, no runtime state changes)

---

## Entity: Volume Configuration

Represents persistent storage for PostgreSQL data directory.

### Attributes

| Attribute | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | Yes | `nexus_postgres_data` | Volume identifier |
| `driver` | string | No | `local` | Volume driver (default local filesystem) |
| `mount_path` | string | Yes | `/var/lib/postgresql/data` | Container mount point |
| `persistence` | boolean | Yes | `true` | Data survives container restarts |

### Validation Rules
- `name` MUST be `nexus_postgres_data` (per clarifications)
- `mount_path` MUST be `/var/lib/postgresql/data` (PostgreSQL data directory)
- Volume MUST survive `docker-compose down` (no `-v` flag)
- Volume MUST be destroyed by `docker-compose down -v` (for db-clean target)

### Lifecycle

```
Created → Active → Preserved → Destroyed
   ↑         ↑          ↑           ↑
db-run   Container   db-stop    db-clean
         running
```

**Lifecycle Transitions**:
1. **Created**: Volume created on first `make db-run` if not exists
2. **Active**: PostgreSQL writes data while container running
3. **Preserved**: Volume persists when container stopped (`make db-stop`)
4. **Destroyed**: Volume removed with `make db-clean` (`docker-compose down -v`)

### Relationships
- Mounted in Container Configuration at `/var/lib/postgresql/data`
- Managed by docker-compose volumes section
- Referenced in Makefile targets (db-run, db-stop, db-clean)

---

## Entity: HealthCheck Configuration

Represents container health monitoring configuration.

### Attributes

| Attribute | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `test` | list[string] | Yes | `["CMD-SHELL", "pg_isready -U ${NEXUS_DB_USER:-admin}"]` | Health check command |
| `interval` | duration | Yes | `5s` | Time between health checks |
| `timeout` | duration | Yes | `5s` | Maximum time for health check to complete |
| `retries` | integer | Yes | `5` | Number of consecutive failures before unhealthy |
| `start_period` | duration | No | `10s` | Grace period before first health check |

### Validation Rules
- `test` MUST use `pg_isready` command (PostgreSQL utility)
- `test` MUST check connection as `${NEXUS_DB_USER}` (not default postgres user)
- `interval` MUST be ≥1s (reasonable check frequency)
- `timeout` MUST be ≥1s (allow time for pg_isready execution)
- `retries` MUST be ≥3 (prevent false positives during startup)
- Total unhealthy time = `interval * retries` ≈ 25s

### State Transitions

```
starting → healthy → unhealthy
    ↓          ↓          ↓
  (startup) (running) (restart/alert)
```

**States**:
- **starting**: Container started, within start_period grace window
- **healthy**: `retries` consecutive successful health checks
- **unhealthy**: `retries` consecutive failed health checks

### Relationships
- Part of Container Configuration
- Used by docker-compose to monitor container status
- Used by GitHub Actions to wait for database readiness
- Referenced in CI service container options

---

## Entity: Connection Configuration

Represents database connection parameters for application use (future features).

### Attributes

| Attribute | Type | Required | Source | Description |
|-----------|------|----------|--------|-------------|
| `host` | string | Yes | `${NEXUS_DB_HOST}` | Database server address |
| `port` | integer | Yes | `${NEXUS_DB_PORT}` | Database server port |
| `user` | string | Yes | `${NEXUS_DB_USER}` | Authentication username |
| `password` | string | Yes | `${NEXUS_DB_PASSWORD}` | Authentication password |
| `database` | string | Yes | `${NEXUS_DB_NAME}` | Database name |

### Computed Attributes

| Attribute | Type | Format | Example |
|-----------|------|--------|---------|
| `connection_string` | string | `postgresql://{user}:{password}@{host}:{port}/{database}` | `postgresql://admin:admin@localhost:5432/nexus_api` |
| `connection_uri` | string | `postgres://{user}:{password}@{host}:{port}/{database}` | `postgres://admin:admin@localhost:5432/nexus_api` |

### Validation Rules
- `host` MUST be reachable network address
- `port` MUST be open and accepting connections
- `user` and `password` MUST match PostgreSQL configured credentials
- `database` MUST exist in PostgreSQL (created automatically via POSTGRES_DB)
- Connection string MUST be valid PostgreSQL URI format

### Relationships
- Derived from Environment Configuration
- Used by application code (future features - not implemented in this feature)
- Documented in README.md and quickstart.md
- Validated by integration tests

---

## Configuration File Mapping

### podman-compose.yml
```yaml
services:
  database:  # Container Configuration
    image: postgres:17
    environment:  # Environment Configuration
      POSTGRES_USER: ${NEXUS_DB_USER:-admin}
      POSTGRES_PASSWORD: ${NEXUS_DB_PASSWORD:-admin}
      POSTGRES_DB: ${NEXUS_DB_NAME:-nexus_api}
    ports:
      - "${NEXUS_DB_PORT:-5432}:5432"
    volumes:  # Volume Configuration
      - nexus_postgres_data:/var/lib/postgresql/data
    healthcheck:  # HealthCheck Configuration
      test: ["CMD-SHELL", "pg_isready -U ${NEXUS_DB_USER:-admin}"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  nexus_postgres_data:  # Volume Configuration
    driver: local
```

### .env.example
```bash
# Environment Configuration
NEXUS_DB_HOST=localhost
NEXUS_DB_PORT=5432
NEXUS_DB_USER=admin
NEXUS_DB_PASSWORD=admin
NEXUS_DB_NAME=nexus_api
```

### .github/workflows/ci.yml
```yaml
services:
  database:  # Container Configuration (CI variant)
    image: postgres:17
    env:  # Environment Configuration (hardcoded)
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
      POSTGRES_DB: nexus_api
    ports:
      - 5432:5432
    options: >-  # HealthCheck Configuration (CLI format)
      --health-cmd "pg_isready -U admin"
      --health-interval 5s
      --health-timeout 5s
      --health-retries 5
```

---

## Design Principles Applied

### Explicit Configuration (Constitution III)
- All defaults documented in .env.example
- No hardcoded values in source code
- Environment variable override mechanism

### Modular Architecture (Constitution I)
- Each entity has clear boundaries and responsibility
- Container Configuration independent of Environment Configuration
- Volume Configuration decoupled from Container lifecycle

### Observability First (Constitution IV)
- HealthCheck Configuration enables monitoring
- Connection parameters logged (excluding password)
- Makefile targets provide feedback and status

---

## Future Extensions

This data model is designed for extensibility:

1. **Additional Services**: Valkey, message queue containers (add to docker-compose.yml)
2. **Schema Management**: Alembic migrations (separate feature, uses Connection Configuration)
3. **Seed Data**: Data loading utilities (separate feature, uses Connection Configuration)
4. **Multi-environment**: Production, staging configurations (separate docker-compose files)

---

## Validation

This data model will be validated by:
- **Contract tests**: Environment variable schema, defaults, validation rules
- **Integration tests**: Container startup, connection, persistence, health checks
- **Quickstart.md**: Manual end-to-end validation

---

**Status**: Design complete, ready for contract generation and test creation.
