# Research: Development Environment Setup

**Feature**: Initial Development Environment Setup
**Date**: 2025-10-08
**Status**: Complete

## Executive Summary

Research findings for containerized PostgreSQL 17 development environment with Podman. Key decisions: use podman-compose v3.8 syntax, leverage GitHub Actions services for CI, implement simple foreground execution make commands following existing project patterns.

---

## 1. Podman-compose Configuration

### Decision
Use podman-compose file format version 3.8 for container orchestration.

### Rationale
- **Format version 3.8**: Widely supported by podman-compose
- **Podman**: Daemonless container engine with rootless support
- **podman-compose**: Python-based tool for orchestrating containers with Podman (installed as dev dependency)
- **Syntax compatibility**: Standard compose file features work with podman-compose
- **Dev dependency**: podman-compose is a Python package, installed via uv with dev dependencies

### Key Findings

**Supported features**:
- Service definitions with image, ports, volumes, environment
- Named volumes for data persistence
- Environment variable substitution (`${VARIABLE:-default}`)
- Health checks using `test`, `interval`, `timeout`, `retries`
- Container networking (bridge networks auto-created)
- Foreground/detached execution modes

**Detection strategy**:
```makefile
# Container runtime detection
# Use podman-compose for container orchestration (via uv)
COMPOSE_CMD := uv run podman-compose
```

### Alternatives Considered
1. **Podman kube**: More complex, requires YAML conversion, different workflow
2. **Dockerfile + manual commands**: No orchestration, harder to maintain
3. **Docker**: Not aligned with project requirements for Podman usage

### References
- Podman-compose: https://github.com/containers/podman-compose
- Podman documentation: https://docs.podman.io/

---

## 2. PostgreSQL 17 Official Image Configuration

### Decision
Use official `postgres:17` image with environment variables for configuration. No custom Dockerfile, no initialization scripts for this feature (delegated to future migration features).

### Rationale
- **Official image**: Maintained by PostgreSQL team, security updates, best practices
- **Version pinning**: `postgres:17` (not `postgres:17-alpine` for simplicity, not `latest` for reproducibility)
- **Environment variables**: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB match standard PostgreSQL container configuration
- **Empty database**: No initdb scripts - schema management delegated to future Alembic migration feature

### Configuration
```yaml
services:
  database:
    image: postgres:17
    environment:
      POSTGRES_USER: ${NEXUS_DB_USER:-admin}
      POSTGRES_PASSWORD: ${NEXUS_DB_PASSWORD:-admin}
      POSTGRES_DB: ${NEXUS_DB_NAME:-nexus_api}
    ports:
      - "${NEXUS_DB_PORT:-5432}:5432"
    volumes:
      - nexus_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${NEXUS_DB_USER:-admin}"]
      interval: 5s
      timeout: 5s
      retries: 5
```

### Key Findings

**Environment variables**:
- `POSTGRES_USER`: Creates superuser (default: `postgres`, override: `admin`)
- `POSTGRES_PASSWORD`: Required for authentication (default: `admin` for dev)
- `POSTGRES_DB`: Initial database name (default: `postgres`, override: `nexus_api`)
- Credentials intentionally simple for local development (security not a concern for localhost)

**Volume mount**:
- `/var/lib/postgresql/data`: PostgreSQL data directory
- Named volume `nexus_postgres_data` persists across container lifecycle
- Volume survives `docker-compose down` but not `docker-compose down -v`

**Health check**:
- `pg_isready -U <user>`: PostgreSQL utility to check server readiness
- Interval: 5s (check every 5 seconds)
- Retries: 5 (mark unhealthy after 25 seconds of failures)
- Enables dependent services to wait for database readiness

### Alternatives Considered
1. **Alpine-based image**: Smaller size but potential compatibility issues (musl vs glibc)
2. **Custom Dockerfile with initialization**: Over-engineering for empty database requirement
3. **PostgreSQL 16 or 15**: User requested latest stable (17)

### References
- Official PostgreSQL Docker image: https://hub.docker.com/_/postgres
- PostgreSQL environment variables: https://www.postgresql.org/docs/17/libpq-envars.html

---

## 3. GitHub Actions PostgreSQL Service Configuration

### Decision
Use GitHub Actions service containers with PostgreSQL 17 image. Configure using same environment variables as local development for consistency.

### Rationale
- **Service containers**: Native GitHub Actions feature for database testing
- **Consistency**: Same image (`postgres:17`), same environment variables, same configuration
- **Health checks**: Automatic wait for database readiness before running tests
- **Port mapping**: Standard 5432 port accessible from test jobs

### Configuration
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

### Key Findings

**Service container lifecycle**:
- Started before job steps execute
- Accessible via `localhost:5432` or `database:5432` (service name)
- Automatic cleanup after job completion

**Health check options**:
- `--health-cmd`: Command to execute for health check
- `--health-interval`, `--health-timeout`, `--health-retries`: Same as docker-compose
- GitHub Actions waits for healthy state before proceeding

**Environment configuration**:
- No `.env` file in CI (environment variables set directly in workflow)
- Hardcoded values acceptable for CI (no port conflicts, controlled environment)

### Alternatives Considered
1. **Docker Compose in CI**: Extra complexity, slower startup, not idiomatic GitHub Actions
2. **Hosted database service**: Unnecessary for integration tests, latency, cost
3. **SQLite for tests**: Different database engine, not representative of production

### References
- GitHub Actions service containers: https://docs.github.com/en/actions/using-containerized-services/about-service-containers
- PostgreSQL service example: https://docs.github.com/en/actions/using-containerized-services/creating-postgresql-service-containers

---

## 4. Make Integration Patterns

### Decision
Implement two make targets following existing Makefile patterns: `db-run` (foreground), `db-clean`. Use `.PHONY` declarations, runtime detection, and help text documentation.

### Rationale
- **Consistency**: Match existing Makefile style (targets with `##` help text, `.PHONY` declarations)
- **Simplicity**: Minimal commands for initial setup - start (foreground) and clean
- **Foreground execution**: Immediate log visibility, Ctrl+C to stop, simpler workflow
- **Runtime detection**: Transparent docker compose V2/V1 selection
- **No db-stop needed**: Ctrl+C handles stopping gracefully
- **No db-logs needed**: Logs visible in foreground execution
- **No dev-run needed**: Premature for single-service setup

### Target Specifications

**`make db-run`**: Start database container in foreground
```makefile
.PHONY: db-run
db-run: ## Start PostgreSQL database container (foreground, Ctrl+C to stop)
	@echo "🚀 Starting PostgreSQL database..."
	@echo "📍 Connection: postgresql://admin:admin@localhost:${NEXUS_DB_PORT:-5432}/nexus_api"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_CMD) up database
```

**`make db-clean`**: Stop and remove volume (purge data)
```makefile
.PHONY: db-clean
db-clean: ## Stop database and remove all data (destructive)
	@echo "🧹 Stopping database and removing data..."
	@echo "⚠️  WARNING: This will delete all database data!"
	$(COMPOSE_CMD) down -v
	@echo "✅ Database stopped and data purged"
```

### Key Findings

**Command patterns**:
- `@echo` with emojis for user feedback (matches existing style)
- **NO** `-d` flag: Run in foreground for immediate log visibility
- `up` without `-d`: Attaches to container output, stops with Ctrl+C
- `down -v`: Removes containers and volumes (complete cleanup)
- Ctrl+C: Gracefully stops foreground containers

**Foreground execution benefits**:
- Immediate log visibility without separate command
- Simpler mental model (one terminal = one process)
- Natural stop mechanism (Ctrl+C)
- Matches developer expectations from other tools

**Error handling**:
- Runtime detection error if neither compose tool found
- No explicit error handling for compose command failures (rely on compose exit codes)
- Foreground execution shows errors immediately

**Help integration**:
- `##` comment syntax for `make help` auto-discovery
- Commands sorted alphabetically in help output (existing pattern)

### Alternatives Considered
1. **Detached mode with separate db-stop**: More complex, requires separate log viewing
2. **Shell scripts instead of Make**: Not idiomatic for this project, breaks existing workflow
3. **Docker CLI commands**: Lower-level, no orchestration, requires manual volume management

### References
- GNU Make documentation: https://www.gnu.org/software/make/manual/make.html
- Existing Makefile patterns in project (reviewed existing targets for consistency)

---

## Implementation Notes

### Environment Variable Schema
```bash
# .env.example (to be created)
# PostgreSQL Database Configuration
NEXUS_DB_HOST=localhost
NEXUS_DB_PORT=5432
NEXUS_DB_USER=admin
NEXUS_DB_PASSWORD=admin
NEXUS_DB_NAME=nexus_api
```

### Testing Strategy
- **Contract tests**: Validate environment variable parsing and defaults
- **Integration tests**: Database connectivity, CRUD operations, persistence
- **CI tests**: Same integration tests run with GitHub Actions service

### Migration Path
This feature is intentionally minimal (empty database). Future features will add:
- Alembic migrations for schema management
- Seed data management
- Additional services (Redis, message queue, etc.)
- Multi-service orchestration

### Podman-specific Considerations
- **Rootless mode**: Podman can run containers without root privileges
- **SELinux**: May require volume mount options (`:Z` or `:z`) on SELinux systems
- **Networking**: Podman uses CNI for networking, similar to Kubernetes

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Podman-compose incompatibility | Development broken | Test with podman-compose, use standard compose syntax |
| Port conflicts | Database won't start | Environment variable override, clear error messages |
| Volume permission issues | Data loss or startup failure | Use named volumes (managed by Podman) |
| Health check timeout | CI flaky tests | Conservative timeout values (5s interval, 5 retries) |
| SELinux permission issues | Volume mount failures | Document SELinux considerations, use `:Z` flag if needed |

---

## Conclusion

Research complete. All technical decisions documented with rationale. Ready to proceed to Phase 1 (Design & Contracts).

**Next Phase**: Create data-model.md, contracts/database-config.yml, quickstart.md, and update agent context.
