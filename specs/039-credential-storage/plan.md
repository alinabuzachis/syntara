# Implementation Plan: Credential Storage Foundation

**Branch**: `036-credential-storage-plan` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/039-credential-storage/spec.md`

## Summary

Implement the credential storage foundation for Nexus — a pluggable StorageBackend Protocol with AES-256-GCM DatabaseBackend, an extensible credential type system with 5 GA preseeded managed types (EDA/AWX-compatible inputs + injectors format), and a complete CRUD REST API with encrypted storage. This is the enabler specification (AAP-69551) that all other credential specifications depend on.

## Technical Context

**Language/Version**: Python 3.12
**Primary Dependencies**: FastAPI, SQLModel, Pydantic, cryptography (AES-256-GCM)
**Storage**: PostgreSQL 15 (credential_types + credentials + secrets + encrypted_secrets tables)
**Testing**: pytest, pytest-asyncio, 90%+ coverage minimum (per constitution)
**Target Platform**: Linux server (containerized via podman)
**Project Type**: Single backend application (monolithic, domain-driven)
**Performance Goals**: Credential save < 1.5s, decrypt < 50ms, list < 200ms
**Constraints**: Never expose decrypted secret values in API responses. All field values encrypted at rest.
**Scale/Scope**: 10K+ credentials, 5 GA credential types, extensible to custom types

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Modular Architecture | PASS | Credentials domain in `src/nexus/credentials/` with clear boundaries |
| II. Test-Driven Development | PASS | Tests required before implementation per task ordering |
| III. Explicit Configuration | PASS | Encryption key via `NEXUS_SECRET_ENCRYPTION_KEY` env var, default insecure key for dev/test with startup WARNING |
| IV. Observability First | PASS | Structured audit logging for all CRUD operations (deferred to Epic 2) |
| V. API Stability | PASS | RESTful API under `/api/v1/credentials` with OpenAPI spec |
| Code Architecture: SOLID | PASS | StorageBackend Protocol (DIP), CredentialService (SRP), InjectorResolver (SRP) |
| Code Architecture: DI | PASS | Services injected via FastAPI Depends(), encryptor injected at construction |
| API Standards: snake_case | PASS | All field names snake_case |
| API Standards: RFC 9457 | PASS | Error handlers use `create_problem_details_response()` |
| API Standards: Pagination | PASS | `limit`/`cursor` via BaseService.list_resources() |
| Code Quality: 90% coverage | PASS | Target 90%+ per spec and constitution |
| Code Style: Enum over Literal | PASS | No Literal types planned |
| Data Models: SQLModel | PASS | All models use SQLModel (table=True for DB, plain for schemas) |

## Project Structure

### Documentation (this feature)

```text
specs/039-credential-storage/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 research findings
├── data-model.md        # Entity relationships and schemas
├── checklists/
│   └── requirements.md  # Quality checklist
└── contracts/
    └── openapi.yaml     # REST API contract
```

### Source Code (repository root)

```text
src/nexus/core/
├── models/
│   └── secret.py                      # Secret, EncryptedSecret, StorageBackendType
├── services/
│   ├── secret_service.py              # SecretService (encrypt/decrypt lifecycle)
│   └── storage_backend.py             # StorageBackend Protocol + DatabaseBackend

src/nexus/credentials/
├── __init__.py
├── router.py                          # Auto-discovered, CRUD + /credential-types
├── exceptions.py                      # CredentialNotFoundError, etc.
├── error_handlers.py                  # RFC 9457 handlers
├── models/
│   ├── __init__.py
│   ├── credential.py                  # Credential(Resource), Create/Read/Patch schemas
│   ├── credential_type.py             # CredentialType(BaseResource), Read schema
│   └── query_params.py                # CredentialListParams
├── services/
│   ├── __init__.py
│   └── credential_service.py          # CredentialService(BaseService), uses SecretService
└── lib/
    ├── __init__.py
    ├── encryption.py                  # CredentialEncryptor (AES-256-GCM)
    ├── injector_resolver.py           # InjectorResolver ({{field_id}} templates)
    └── preseed.py                     # preseed_credential_types() for lifespan

tests/
├── unit/core/
│   ├── test_secret_service.py
│   └── test_database_backend.py
├── unit/credentials/
│   ├── test_encryption.py
│   ├── test_credential_types.py
│   ├── test_injector_resolver.py
│   └── test_credential_service.py
└── integration/credentials/
    └── test_credential_router.py
```

### Modified Files

```text
src/nexus/core/config/base.py                    # Add CredentialEncryptionSettings mixin
src/nexus/core/models/__init__.py                 # Export Secret, EncryptedSecret
src/nexus/core/database/migrations/env.py         # Register Secret, EncryptedSecret models
src/nexus/api/main.py                             # Add preseed in lifespan
tests/conftest.py                                 # Add credential fixtures
pyproject.toml                                    # Add cryptography dependency
```

**Structure Decision**: Single project, backend-only. Follows established Nexus domain pattern with `models/`, `services/`, `lib/`, `router.py`. Frontend is out of scope (Epic 2: AAP-69552).

## Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | EDA/AWX `inputs` + `injectors` format | Design reuse from battle-tested AAP pattern, not runtime sharing |
| D2 | DB-backed credential types with preseed | Extensible — users can add custom types without code changes |
| D3 | AES-256-GCM with per-field nonce + AAD | Industry standard authenticated encryption with integrity protection |
| D4 | StorageBackend as generic Protocol | Serves all sensitive data (per March 20 meeting), not just Credentials |
| D4a | Secret routing table + encrypted_secrets | Encrypted data stored separately from credential metadata via `secret_id` FK. `secrets` table is a shared routing layer (zero secret values); `encrypted_secrets` holds AES-256-GCM encrypted field data for DatabaseBackend. Enables post-GA Vault/AWS SM backends without schema changes to consumer tables. |
| D4b | SecretService in core, not credentials | SecretService lives in `src/nexus/core/services/` because it serves all consumers (credentials, app settings, OIDC). CredentialService delegates to SecretService for all encrypt/store/retrieve/decrypt operations. |
| D5 | Encrypt ALL field values (not just secrets) | Defense in depth — non-secret fields also protected at rest |
| D6 | `$encrypted$` sentinel for PATCH preservation | Distinguishes "keep existing" from "set to literal string". Submitting `$encrypted$` as actual input returns 422 — sentinel is reserved. |
| D7 | Soft-delete for Credentials | Audit trail, recovery window, consistent with other Nexus resources |
| D8 | Resource (not BaseResource) for Credential | Full audit trail: name, description, labels, soft-delete, user ownership |
| D9 | BaseResource for CredentialType | Manages own name field without Resource's name uniqueness constraints |

## Implementation Phases

### Phase 0: Infrastructure Setup
- Add `cryptography>=42.0.0` to pyproject.toml
- Add `CredentialEncryptionSettings` mixin to config
- Create `src/nexus/credentials/` package structure

### Phase 1: Encryption Layer + Secret Infrastructure (AAP-68626 partial + AAP-68629)
- `CredentialEncryptor` — AES-256-GCM encrypt/decrypt with nonce + AAD (`secret_id:field_name`)
- `Secret` + `EncryptedSecret` models in `src/nexus/core/models/secret.py`
- `StorageBackend` Protocol + `DatabaseBackend` (real impl, stores in `encrypted_secrets` table) in `src/nexus/core/services/`
- `SecretService` in `src/nexus/core/services/secret_service.py` — wraps encryption + backend
- Unit tests for encryption round-trip, nonce uniqueness, AAD binding, SecretService lifecycle, DatabaseBackend CRUD

### Phase 2: Credential Type System (AAP-68627)
- `CredentialType` model (BaseResource, table=True)
- `InjectorResolver` — `{{field_id}}` template resolution
- `preseed_credential_types()` — 5 GA managed types, idempotent upsert
- Add preseed call to lifespan in main.py
- Unit tests for type schemas, preseed idempotency, injector resolution

### Phase 3: Credential Model + Service (AAP-68628)
- `Credential` model (Resource, table=True) with `secret_id` FK (no `inputs` JSONB)
- `CredentialService(BaseService)` — delegates to `SecretService` for encrypt/store/retrieve/decrypt
  - create: `SecretService.create_secret(inputs)` → `credential.secret_id = secret_id`
  - read: `SecretService.retrieve_secret(secret_id)` → mask secrets
  - update: retrieve → merge with `$encrypted$` preservation → `SecretService.update_secret()`
  - delete: soft-delete credential + `SecretService.delete_secret()`
  - list: mask all fields as `$encrypted$` without contacting backend
- Input validation against type schema (required, unknown, choices)
- Secret masking logic (type schema `secret: true` → `$encrypted$` in response)

### Phase 4: API Layer (AAP-68628 continued)
- `router.py` — CRUD endpoints for credentials + GET-only for credential types (extensible data model, full CRUD deferred to post-GA)
- `exceptions.py` + `error_handlers.py` — RFC 9457 compliant
- Alembic migration for secrets + encrypted_secrets + credential_types + credentials tables
- OpenAPI schema generation
- Integration tests for all endpoints

### Phase 5: Unit Tests (AAP-68646)
- Comprehensive unit tests for all components
- Integration tests with test database
- Coverage verification (90%+ target per constitution)

## Dependencies

```
Phase 0 (setup) → Phase 1 (encryption) → Phase 2 (types) → Phase 3 (model + service) → Phase 4 (API) → Phase 5 (tests)
```

Phase 1 and 2 can run in parallel if two developers work simultaneously.

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Encryption key management | Medium | Default insecure key for dev/test with startup WARNING; production must set `NEXUS_SECRET_ENCRYPTION_KEY` |
| Secret masking inconsistency | High | All reads through CredentialService masking, never bypass |
| Migration conflicts with other PRs | Medium | Single migration, coordinate with team |
| Preseed race condition on parallel startup | Low | Idempotent upsert with unique constraint |
| cryptography library version conflicts | Low | Pin minimum version, test in CI |
