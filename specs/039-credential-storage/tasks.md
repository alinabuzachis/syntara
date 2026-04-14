# Tasks: Credential Storage Foundation

**Input**: Design documents from `/specs/039-credential-storage/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, `src/nexus/schemas/credentials/openapi.yaml`

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, package structure

- [ ] T001 Add `cryptography>=42.0.0` to `pyproject.toml` dependencies
- [ ] T002 Create `src/nexus/credentials/__init__.py` and package structure (`models/`, `services/`, `lib/`)
- [ ] T003 [P] Add `CredentialEncryptionSettings` mixin to `src/nexus/core/config/base.py` — `credential_encryption_key: SecretStr`, insecure default for dev/test, startup WARNING log if using default key
- [ ] T004 [P] Add `CredentialEncryptionSettings` to `Settings` class inheritance in `src/nexus/core/config/base.py`

**Checkpoint**: Package structure exists, encryption key configurable via `NEXUS_SECRET_ENCRYPTION_KEY`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Encryption layer and StorageBackend Protocol — MUST complete before any user story

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Create `src/nexus/credentials/lib/encryption.py` — `CredentialEncryptor` class: AES-256-GCM encrypt/decrypt, 96-bit nonce via `os.urandom(12)`, AAD binding (`secret_id:field_name`), `key_from_string()` for hex key loading
- [ ] T006 [P] Create `tests/unit/credentials/test_encryption.py` — encrypt/decrypt round-trip, nonce uniqueness, AAD binding (swap attack detection), invalid key handling, all-type serialization (string, boolean, integer)
- [ ] T007 Create `src/nexus/core/models/secret.py` — `Secret` (SQLModel, table=True) with `storage_backend` field, `EncryptedSecret` (SQLModel, table=True) with `secret_id` FK (UNIQUE) and `encrypted_data` JSONB, `StorageBackendType` StrEnum. Update `src/nexus/core/models/__init__.py` exports and `src/nexus/core/database/migrations/env.py` model registration
- [ ] T007a Create `src/nexus/core/services/storage_backend.py` — `StorageBackend` Protocol with 5 async methods (`store`, `retrieve`, `update`, `delete`, `health_check`) + `DatabaseBackend` real implementation that stores/retrieves from `encrypted_secrets` table via AsyncSession
- [ ] T007b Create `src/nexus/core/services/secret_service.py` — `SecretService(session, encryptor, backend)` with `create_secret(plaintext_fields) -> UUID`, `retrieve_secret(secret_id) -> dict`, `update_secret(secret_id, plaintext_fields)`, `delete_secret(secret_id)`. AAD binding uses `secret_id:field_name`
- [ ] T007c [P] Create `tests/unit/core/test_secret_service.py` — create/retrieve/update/delete lifecycle, AAD binding with secret_id
- [ ] T007d [P] Create `tests/unit/core/test_database_backend.py` — real store/retrieve/update/delete against encrypted_secrets table
- [ ] T008 Create `src/nexus/credentials/exceptions.py` — `CredentialError` base, `CredentialNotFoundError`, `CredentialNameConflictError`, `CredentialValidationError`, `CredentialDecryptionError` with `@fastapi_exception` decorators
- [ ] T009 [P] Create `src/nexus/credentials/error_handlers.py` — RFC 9457 handlers using `create_problem_details_response()` for each exception type (404, 409, 422, 500). Use generic user-facing messages; detailed context goes to server logs only

**Checkpoint**: Encryption infrastructure ready, Secret routing table + encrypted_secrets defined, SecretService operational, StorageBackend Protocol with real DatabaseBackend, error handling in place

---

## Phase 3: User Story 1 — Encrypted Credential Storage (Priority: P1) MVP

**Goal**: Create Credentials with encrypted field values. CRUD lifecycle with secret masking.

**Independent Test**: `POST /credentials` creates a Credential, `GET /credentials/{id}` returns it with secrets masked as `$encrypted$`. Database inspection shows only encrypted values.

### Implementation for User Story 1

- [ ] T010 [US1] Create `src/nexus/credentials/models/credential.py` — `Credential(Resource, table=True)` with `credential_type_id` FK, `secret_id` FK → secrets.id (NOT NULL), `enabled` bool. Plus `CredentialCreate` (with `inputs` dict for plaintext), `CredentialRead` (with `inputs` dict for masked/decrypted), `CredentialPatch` schemas. Note: `inputs` exists on schema models only, not on the table model
- [ ] T011 [P] [US1] Create `src/nexus/credentials/models/query_params.py` — `CredentialListParams(BaseListParams)` with `credential_type_id` filter
- [ ] T012 [US1] Create `src/nexus/credentials/models/__init__.py` — export all models
- [ ] T013 [US1] Create `src/nexus/credentials/services/credential_service.py` — `CredentialService(BaseService)` that delegates to `SecretService` for all encrypt/store/retrieve/decrypt operations. `create_credential()` calls `SecretService.create_secret(inputs)` and stores returned `secret_id`. `get_credential()` calls `SecretService.retrieve_secret()` then masks secrets. `list_credentials()` masks all fields as `$encrypted$` without contacting backend. `update_credential()` retrieves current plaintext, merges with `$encrypted$` preservation, calls `SecretService.update_secret()`. `delete_credential()` soft-deletes credential + calls `SecretService.delete_secret()`
- [ ] T014 [US1] Create `src/nexus/credentials/router.py` — `POST /credentials`, `GET /credentials`, `GET /credentials/{id}`, `PATCH /credentials/{id}`, `DELETE /credentials/{id}`
- [ ] T015 [US1] Generate Alembic migration — `uv run alembic revision --autogenerate -m "add secrets, encrypted_secrets, credential_types, and credentials tables"`
- [ ] T016 [P] [US1] Create `tests/unit/credentials/test_credential_service.py` — CRUD operations, secret masking ($encrypted$), $encrypted$ preservation on PATCH, soft-delete, name uniqueness
- [ ] T017 [US1] Create `tests/integration/credentials/test_credential_router.py` — full API endpoint tests: create, list, get (masked), update, delete, validation errors (422), conflict (409)

**Checkpoint**: Full CRUD lifecycle works via curl. Secrets masked in API responses. Database shows only encrypted values.

---

## Phase 4: User Story 2 — Credential Type System (Priority: P1)

**Goal**: 5 GA managed Credential types preseeded on startup with field schemas and injector templates.

**Independent Test**: After startup, `GET /credential-types` returns 5 types with valid `inputs` and `injectors` schemas. Types are idempotent on restart.

### Implementation for User Story 2

- [ ] T018 [US2] Create `src/nexus/credentials/models/credential_type.py` — `CredentialType(BaseResource, table=True)` with `name`, `description`, `inputs` JSONB, `injectors` JSONB, `managed` bool. Plus `CredentialTypeRead` schema. Data model is extensible for custom types post-GA
- [ ] T019 [US2] Create `src/nexus/credentials/lib/injector_resolver.py` — `InjectorResolver` class with `resolve(type_def, decrypted_inputs) -> ResolvedInjectors`, `{{field_id}}` template substitution for `extra_vars`, `env`, `file`
- [ ] T020 [US2] Create `src/nexus/credentials/lib/preseed.py` — `preseed_credential_types(session)` with 5 GA managed types: HTTP Bearer Token, HTTP Basic Auth, AAP API Credentials, LLM Provider, SSH Key (Non-Protected with `multiline: true`). Idempotent: created on first run, updated in place on subsequent runs, never duplicated
- [ ] T021 [US2] Modify `src/nexus/api/main.py` — add `preseed_credential_types()` call in lifespan after router discovery
- [ ] T022 [US2] Add `GET /credential-types` and `GET /credential-types/{id}` endpoints to `src/nexus/credentials/router.py` — read-only for GA, full CRUD deferred to post-GA
- [ ] T023 [P] [US2] Create `tests/unit/credentials/test_credential_types.py` — type schema validation for preseeded GA types, preseed idempotency, managed flag behavior
- [ ] T024 [P] [US2] Create `tests/unit/credentials/test_injector_resolver.py` — template resolution for all 5 GA types, missing field handling, extra_vars/env/file output

**Checkpoint**: 5 managed types available via API after startup. InjectorResolver resolves templates correctly.

---

## Phase 5: User Story 3 — Credential CRUD API (Priority: P1)

**Goal**: Input validation against type schema — reject unknown fields, enforce required fields.

**Independent Test**: `POST /credentials` with unknown field returns 422. Missing required field returns 422. Name conflict returns 409.

### Implementation for User Story 3

- [ ] T025 [US3] Add input validation logic to `CredentialService.create_credential()` in `src/nexus/credentials/services/credential_service.py` — validate inputs against `CredentialType.inputs` schema: check required fields, reject unknown field IDs, validate choices, reject `$encrypted$` sentinel as input value (reserved for masking, returns 422), enforce 64KB max on serialized inputs payload
- [ ] T026 [US3] Add input validation to `CredentialService.update_credential()` — validate changed fields (skip `$encrypted$` preservation), re-validate against type schema, reject `$encrypted$` as literal input value on create (422), enforce 64KB max on serialized inputs payload
- [ ] T027 [P] [US3] Add validation error tests to `tests/unit/credentials/test_credential_service.py` — unknown fields (422), missing required (422), invalid choices (422), `$encrypted$` sentinel as input value (422)
- [ ] T028 [P] [US3] Add validation endpoint tests to `tests/integration/credentials/test_credential_router.py` — 422 responses with clear error messages, 409 name conflict, 422 for `$encrypted$` sentinel as input

**Checkpoint**: Invalid inputs rejected with clear RFC 9457 error messages. All validation rules enforced.

---

## Phase 6: User Story 4 — Encrypt All Field Values (Priority: P1)

**Goal**: ALL field values encrypted at rest, including booleans and integers.

**Independent Test**: Create a Credential with boolean field (`verify_ssl: true`), inspect database — value is encrypted. Retrieve via API — boolean returned correctly.

### Implementation for User Story 4

- [ ] T029 [US4] Update `CredentialEncryptor.encrypt_fields()` in `src/nexus/credentials/lib/encryption.py` — serialize all values to strings before encryption (bool → `"true"`, int → `"42"`), deserialize on decryption back to original types
- [ ] T030 [P] [US4] Add all-type encryption tests to `tests/unit/credentials/test_encryption.py` — boolean round-trip, integer round-trip, string round-trip, None handling, mixed-type credential fields

**Checkpoint**: Database inspection shows no plaintext values of any type. Boolean/integer fields round-trip correctly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Test fixtures, OpenAPI schema, coverage verification

- [ ] T031 Modify `tests/conftest.py` — add `credential_type_factory`, `credential_factory` test fixtures
- [ ] T032 [P] Verify `src/nexus/schemas/credentials/openapi.yaml` is up to date with implemented endpoints (file already exists, moved from specs/contracts/)
- [ ] T033 [P] Verify 90%+ test coverage on all credential code — `make test-coverage` (per constitution)
- [ ] T034 Run `make lint` and `make typecheck` — fix any ruff or mypy issues
- [ ] T035 Run quickstart.md validation — verify curl commands work against running server

**Checkpoint**: All tests green, 90%+ coverage, lint clean, OpenAPI spec verified, quickstart validated.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 Encrypted Storage (Phase 3)**: Depends on Phase 2 — creates Credential model + service + router
- **US2 Type System (Phase 4)**: Depends on Phase 2 — can run parallel with US1 (different files)
- **US3 Validation (Phase 5)**: Depends on US1 (needs CredentialService) and US2 (needs CredentialType for schema validation)
- **US4 Encrypt All (Phase 6)**: Depends on Phase 2 (needs CredentialEncryptor) — can run parallel with US1/US2
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (Encrypted Storage)**: Foundational only — no cross-story deps
- **US2 (Type System)**: Foundational only — no cross-story deps (parallel with US1)
- **US3 (Validation)**: Depends on US1 + US2 (validates inputs against type schema)
- **US4 (Encrypt All)**: Foundational only — can start parallel with US1/US2

### Within Each User Story

- Models before services
- Services before router endpoints
- Core implementation before integration tests
- Commit after each task or logical group

### Parallel Opportunities

```
Phase 1 (T001-T004, some parallel)
    ↓
Phase 2 (T005-T009, foundational)
    ↓
    ├──→ US1 (T010-T017) — Credential CRUD
    ├──→ US2 (T018-T024) — Type System (parallel with US1)
    └──→ US4 (T029-T030) — Encrypt All (parallel with US1/US2)
              ↓
         US3 (T025-T028) — Validation (after US1 + US2)
              ↓
         Phase 7 (T031-T035) — Polish
```

---

## Parallel Example: US1 + US2 Concurrent

```bash
# Developer A: US1 — Credential CRUD
Task: "Create Credential model in src/nexus/credentials/models/credential.py"
Task: "Create CredentialService in src/nexus/credentials/services/credential_service.py"
Task: "Create router endpoints in src/nexus/credentials/router.py"

# Developer B: US2 — Type System (different files, no conflicts)
Task: "Create CredentialType model in src/nexus/credentials/models/credential_type.py"
Task: "Create InjectorResolver in src/nexus/credentials/lib/injector_resolver.py"
Task: "Create preseed in src/nexus/credentials/lib/preseed.py"
```

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (encryption + error handling)
3. Complete Phase 3: US1 (Credential CRUD with encryption)
4. **STOP and VALIDATE**: Create and retrieve Credentials via curl
5. This alone delivers a working encrypted credential store

### Incremental Delivery

1. Setup + Foundational → Encryption infrastructure ready
2. Add US1 → Credential CRUD works → **Demo-ready**
3. Add US2 → Types preseeded, injectors resolve → **Type-aware**
4. Add US3 → Input validation enforced → **Production-quality**
5. Add US4 → All values encrypted → **Security hardened**
6. Polish → Coverage, OpenAPI, lint → **PR-ready**

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- All 4 user stories are P1 priority but have different dependency chains
- US1 + US2 can run in parallel (different models, services, files)
- US3 requires both US1 and US2 complete (validates inputs against type schema)
- US4 is independent (only touches encryption layer)
- Total: 39 tasks (4 setup, 9 foundational, 8 US1, 7 US2, 4 US3, 2 US4, 5 polish)
- Updated 2026-03-26: Spec renamed to 039, added $encrypted$ sentinel input rejection (T025-T028), credential types GET-only for GA per Helen's feedback (T022)
- Updated 2026-03-27: Added Secret/EncryptedSecret models (T007), SecretService (T007b), DatabaseBackend real impl (T007a), core tests (T007c-d) per ANSTRAT-1901 Pluggable Secret Storage proposal (PR #1327). Credential model uses `secret_id` FK instead of `inputs` JSONB. AAD binding changed from `credential_id:field_name` to `secret_id:field_name`
- Updated 2026-03-31: Added Epic 2 backend tasks (T036-T051) for Credential Management UI support (AAP-69552)

---

# Epic 2: Credential Management Backend (AAP-69552)

**Prerequisites**: Credential Storage Foundation (PR #520, merged)
**Branch**: `feat/AAP-69552-credential-management-backend` from `feature/ANSTRAT-1901-credential-secret`

Backend API enhancements needed by the Credential Management UI (Epic 2).
Independent of Epic 3 (Workflow Credential Integration). Unblocks frontend.

---

## Phase 8: Enabled Filter (AAP-68665 — partial)

**Purpose**: Allow credential list endpoint to filter by `enabled` status

- [X] T036 [P] Add `enabled: bool | None` query parameter to `CredentialListParams` in `src/nexus/credentials/models/query_params.py`
- [ ] T037 [P] Add unit test in `tests/unit/credentials/test_credential_service.py` — verify `enabled` filter applied correctly
- [X] T038 [P] Add integration test in `tests/integration/credentials/test_credential_router.py` — `GET /credentials?enabled=true` returns only enabled, `?enabled=false` returns only disabled

**Notes**: `enabled` is already in `Credential.__filterable_fields__`. `BaseService.list_resources()` handles filtering automatically via `query_params_items`. Only the query param definition is missing.

**Checkpoint**: `GET /credentials?enabled=true` filters correctly

---

## Phase 9: Credential Count per Type (backend for AAP-68641)

**Purpose**: Types list endpoint returns the number of credentials using each type

- [X] T039 Add `credential_count: int = 0` field to `CredentialTypeRead` schema in `src/nexus/credentials/models/credential_type.py`
- [X] T040 Rewrite `list_credential_types()` in `src/nexus/credentials/router.py` — join with subquery counting non-deleted credentials per type (LEFT OUTER JOIN, types with 0 credentials show `credential_count: 0`)
- [X] T041 Update `get_credential_type()` in `src/nexus/credentials/router.py` — also return `credential_count` for single type
- [ ] T042 [P] Add unit test — verify count subquery returns correct counts
- [X] T043 [P] Add integration test — create credentials of different types, verify counts on `GET /credential-types`

**Notes**: Only count non-deleted credentials (`deleted_at IS NULL`). Import `Credential` model in router (new import).

**Checkpoint**: `GET /credential-types` includes `credential_count` for each type

---

## Phase 10: Workflows Endpoint (backend for AAP-69885)

**Purpose**: Backend endpoint to find which workflows reference a given credential

- [X] T044 Create `CredentialWorkflowRef` response schema in `src/nexus/credentials/models/credential.py` — `id: UUID`, `name: str`
- [X] T045 Add `get_credential_workflows()` method to `CredentialService` in `src/nexus/credentials/services/credential_service.py`:
  - Verify credential exists (reuse `_get_or_raise`)
  - Query `workflow_versions` for latest version per workflow (subquery: `MAX(version) GROUP BY workflow_id`)
  - Filter: `workflow_definition::text LIKE '%"credentialId":%'` then Python-side filter for exact UUID match
  - Join with `workflows` table to get workflow name
  - Only include non-deleted workflows
  - Return `list[CredentialWorkflowRef]`
- [X] T046 Add `GET /credentials/{credential_id}/workflows` endpoint to `src/nexus/credentials/router.py` — returns `list[CredentialWorkflowRef]`, 404 if credential not found, empty list if no workflows reference it
- [ ] T047 [P] Add unit test — mock workflow_versions query, verify UUID filtering, verify latest-version-only logic
- [X] T048 [P] Add integration test — verify endpoint returns empty list (credentialId not in executor configs yet)

**Notes**: Returns empty until Epic 3 adds `credentialId` to executor configs. API contract is ready for frontend. Serves 3 UI tickets: AAP-69885 (Workflows tab), AAP-68665 (disable/delete confirmation), AAP-68639 (workflow count column).

**Checkpoint**: `GET /credentials/{id}/workflows` returns referencing workflows

---

## Phase 11: Polish & Verification

- [ ] T049 [P] Update `src/nexus/schemas/credentials/openapi.yaml` — add `GET /credentials/{id}/workflows`, `credential_count` to CredentialTypeRead, `enabled` query param
- [X] T050 [P] Run `make lint && make typecheck` — fix any issues
- [ ] T051 Verify 90%+ test coverage on all new code

**Checkpoint**: All tests green, lint clean, OpenAPI spec matches implementation

---

## Epic 2 Dependencies & Execution Order

```
├──→ Phase 8  (T036-T038) — enabled filter
├──→ Phase 9  (T039-T043) — credential count per type
├──→ Phase 10 (T044-T048) — workflows endpoint
         ↓
    Phase 11 (T049-T051) — polish
```

All three main phases are independent and can run in parallel.

## Epic 2 Jira Mapping

| Tasks | Jira Ticket | Notes |
|-------|-------------|-------|
| T036-T038 | AAP-68665 (partial) | Backend for enable/disable UI |
| T039-T043 | Backend for AAP-68641 | No dedicated backend ticket |
| T044-T048 | Backend for AAP-69885 | No dedicated backend ticket |
| T049-T051 | Cross-cutting | Polish |

Total: 16 tasks. Estimated effort: ~4-5 hours.
- Updated 2026-03-31: Added Epic 3 backend tasks (T052-T075) for Workflow Credential Integration (AAP-69553)

---

# Epic 3: Workflow Credential Integration — Backend (AAP-69553)

**Prerequisites**: Credential Storage Foundation (PR #520, merged), Epic 2 backend (PR #528, merged)
**Branch**: from `feature/ANSTRAT-1901-credential-secret`
**Proposals**: PR #1255 (Section 6: Workflow Credential Binding)

Backend work to enable workflows to reference, resolve, and consume Nexus credentials
at execution time. Secrets never stored in workflow definitions or execution records.

---

## Phase 12: Executor Config Models [AAP-68638]

**Purpose**: Add `credentialId` field to executor configs so workflow definitions can reference Nexus credentials per node

- [X] T052 Add `credential_id: str | None = Field(default=None, alias="credentialId")` to `APIExecutorConfig` in `src/nexus/workflows/workflow_engine/models/workflow_definition.py` (line ~236). Keep existing `authentication: Authentication | None` field for backward compat with `${secrets.XXX}` pattern
- [X] T053 Add `credential_id: str | None = Field(default=None, alias="credentialId")` to `AgenticExecutorConfig` in same file (line ~261). Used for LLM provider credentials
- [X] T054 Add `credential_id: str | None = Field(default=None, alias="credentialId")` to `AAPJobTemplateExecutorConfig` in same file (line ~307). Separate from existing `credentials: list[int]` (AAP-native IDs). Nexus credential provides host/auth, AAP credentials are job-level
- [X] T055 [P] Add unit tests in `tests/unit/workflows/test_workflow_definition.py`:
  - Verify credentialId serializes/deserializes correctly (camelCase alias)
  - Verify backward compat: configs without credentialId still parse
  - Verify both credential_id and authentication can coexist on APIExecutorConfig

**Notes**:
- `ScriptExecutorConfig` does NOT get credential_id — scripts use env vars via `environment` field
- `credentialId` is a string (UUID as string), not UUID type, because workflow definitions are JSONB and UUIDs serialize as strings
- The field is optional (None default) for backward compat — existing workflows without credentials continue to work
- `_resolve_config_templates()` (line 844) must EXCLUDE `credentialId` from template resolution (same pattern as `authentication`)

**Checkpoint**: Executor configs accept `credentialId` field. Existing workflows parse without errors.

---

## Phase 13: Credential Resolution Activity [AAP-68636 — Part 1]

**Purpose**: Temporal activity that resolves credentials from SecretService at execution time

- [X] T056 Create `CredentialDisabledError` exception in `src/nexus/credentials/exceptions.py`:
  - `class CredentialDisabledError(CredentialError)` with 422 status code
  - Message: "Credential '{name}' is disabled. Re-enable it before running workflows."
  - Add `@fastapi_exception` decorator with RFC 9457 handler
  - Import module in `src/nexus/api/main.py` before `register_exceptions(app)`
- [X] T057 Create `src/nexus/workflows/workflow_engine/activities/credential_resolution_activity.py`:
  - `@activity.defn(name="resolve_workflow_credentials")`
  - Signature: `async def resolve_workflow_credentials(credential_map: dict[str, str]) -> dict[str, Any]`
  - For each `{activity_id: credential_id}` entry:
    1. Get DB session via `AsyncSessionLocal()` (same pattern as `activity_monitoring.py:66` — Temporal activities run outside FastAPI request context, so `get_db()` cannot be used)
    2. Fetch `Credential` by ID — raise `ApplicationError(non_retryable=True)` if not found or deleted
    3. Check `credential.enabled == True` — else raise `ApplicationError(non_retryable=True)` with CredentialDisabledError message
    4. Create `CredentialEncryptor` + `DatabaseBackend` + `SecretService`
    5. Call `SecretService.retrieve_secret(credential.secret_id)` → decrypted inputs
    6. Fetch `CredentialType` by `credential.credential_type_id`
    7. Call `InjectorResolver.resolve(type.injectors, decrypted_inputs)` → `ResolvedInjectors`
    8. Return `{activity_id: {"credential_id": str, "credential_type_name": str, "extra_vars": dict, "env": dict, "file": dict}}`
  - All errors are `ApplicationError(non_retryable=True)` — missing/disabled/decryption failures should not retry
  - Structured logging: `logger.info("Credential resolved", credential_id=..., activity_id=..., type_name=...)`
- [X] T058 Register `resolve_workflow_credentials` in `src/nexus/workflows/workflow_engine/services/temporal_worker.py` activities list (line ~110)
- [X] T059 [P] Create `tests/unit/workflows/test_credential_resolution_activity.py`:
  - Test happy path: credential resolved with correct extra_vars
  - Test disabled credential raises non-retryable error
  - Test missing credential raises non-retryable error
  - Test deleted credential (deleted_at not None) raises non-retryable error
  - Test decryption failure raises non-retryable error
  - Mock DB session, SecretService, InjectorResolver

**Notes**:
- Use `AsyncSessionLocal()` for DB sessions (same as `activity_monitoring.py:66`). Temporal activities run outside FastAPI request context, so `get_db()` dependency cannot be used. The preseed uses `get_db()` because it runs during FastAPI lifespan startup, which is a different context.
- `ApplicationError` is from `temporalio.exceptions` — this is the Temporal-specific non-retryable signal, not our domain exception
- `CredentialDisabledError` is used for the REST API handler; inside the Temporal activity, wrap it as `ApplicationError(non_retryable=True)`
- 30-second `start_to_close_timeout` when called from dynamic workflow

**Checkpoint**: Activity resolves credentials from DB → decrypts → resolves injectors → returns structured result

---

## Phase 14: Dynamic Workflow Integration [AAP-68636 — Part 2]

**Purpose**: Wire credential resolution into the workflow execution flow

- [X] T060 Add `_collect_activity_credential_ids()` method to `DynamicWorkflow` in `src/nexus/workflows/workflow_engine/dynamic_workflow.py`:
  - Recursively scan all activities (task, parallel, sequence, condition, loop, converge)
  - For task activities: extract `credential_id` from `activity.task.config` if present
  - Handle nested structures: parallel branches, condition then/else, loop bodies, sequence steps
  - Return `dict[str, str]` mapping `{activity_id: credential_id}` for all activities with credentials
- [X] T061 Add `credentialId` to the exclude set in `_resolve_config_templates()` (line ~868):
  ```python
  if isinstance(config, APIExecutorConfig):
      exclude_fields.add("authentication")
      exclude_fields.add("credentialId")  # Don't resolve as template
  ```
  Also exclude for AgenticExecutorConfig and AAPJobTemplateExecutorConfig
- [X] T062 Modify `_execute_task_activity()` (line ~882) to resolve credentials before activity execution:
  - After `_resolve_config_templates()` (line ~921) and before routing to executor
  - Check if `activity.task.config` has `credential_id` (not None)
  - Call `resolve_workflow_credentials` Temporal activity with `{activity.id: credential_id}`
  - Store resolved credentials in `workflow_state["activity_credentials"][activity.id]`
  - Pass resolved credentials to executor functions via `workflow_state`
  - Per-activity resolution: only resolve for the activity about to execute
- [X] T063 [P] Create `tests/unit/workflows/test_collect_credential_ids.py`:
  - Test flat task activities with credentialId
  - Test nested: parallel with credentialId on one branch
  - Test nested: condition with credentialId in then-branch only
  - Test nested: loop body with credentialId
  - Test activities without credentialId are excluded
  - Test empty workflow definition returns empty dict

**Notes**:
- Per-activity resolution (not batch at workflow start) ensures unexecuted branches never decrypt credentials
- `workflow_state["activity_credentials"]` is the handoff point between resolution and executor injection
- The Temporal activity call uses 30-second `start_to_close_timeout`
- `_collect_activity_credential_ids()` is called once at workflow start for planning/logging, but actual resolution happens per-activity

**Checkpoint**: Workflow engine collects credential IDs from definition and resolves them just before each activity executes

---

## Phase 15: Activity Executor Credential Injection [AAP-68637]

**Purpose**: Activity executors consume resolved credentials for authentication

- [X] T064 Modify `execute_api_request()` in `src/nexus/workflows/workflow_engine/activities/api_activity.py`:
  - Check if `workflow_state["activity_credentials"]` has resolved credentials for this activity
  - If present: use resolved `extra_vars` for auth headers (bearer_token, basic_username/basic_password, api_key)
  - Map auth_type from extra_vars: `bearer` → `Authorization: Bearer {bearer_token}`, `basic` → `Authorization: Basic {base64(basic_username:basic_password)}`, `api_key` → `X-API-Key: {api_key}`
  - If NOT present: fall back to existing `${secrets.XXX}` pattern via Authentication model
  - `credential_id` takes priority over `authentication` if both are set
  - Scrub resolved credentials from `workflow_state` after consumption
- [X] T065 Modify `execute_aap_job_template_activity()` in `src/nexus/workflows/workflow_engine/activities/aap_job_template_activity.py`:
  - Check if resolved credentials include AAP auth info (aap_host, aap_username, aap_password, aap_oauth_token)
  - If present: override `_get_aap_auth_headers(settings)` with resolved extra_vars for AAP API auth
  - Override `aap_host` from resolved credentials (enables per-credential AAP endpoints)
  - If NOT present: fall back to existing settings-based auth (`settings.aap_token`)
  - Per UX mockup: "Authentication credential" dropdown is SEPARATE from "Additional credentials (legacy)" (`credentials: list[int]`). Both coexist — Nexus credential provides AAP API auth, legacy IDs are passed to the job template
- [X] T066 Modify `execute_agentic_activity()` in `src/nexus/workflows/workflow_engine/activities/agentic_activity.py`:
  - Check if resolved credentials include LLM provider info (llm_api_key, llm_provider, llm_base_url)
  - If present: pass LLM credentials to Agent Orchestrator client as extra metadata fields in `invoke_agent_async()` call — `llm_api_key`, `llm_provider`, `llm_base_url`
  - Agent Orchestrator must accept these per-request overrides (coordinate with AO team)
  - If NOT present: Agent Orchestrator uses its own default LLM config
  - Per UX mockup: "LLM provider credential" dropdown filters to LLM Provider type only, shows credential name + description
- [X] T067 [P] Create `tests/unit/workflows/test_api_activity_credential_injection.py`:
  - Test bearer token injection from resolved extra_vars
  - Test basic auth injection (base64 encoding)
  - Test api_key injection
  - Test fallback to ${secrets.XXX} when no credential resolved
  - Test credential_id priority over authentication field
- [X] T068 [P] Create `tests/unit/workflows/test_aap_activity_credential_injection.py`:
  - Test AAP auth override from resolved credentials
  - Test fallback to settings-based auth
  - Test aap_host override from resolved credentials
- [X] T069 [P] Create `tests/unit/workflows/test_agentic_activity_credential_injection.py`:
  - Test LLM credential passing to Agent Orchestrator
  - Test fallback to default LLM config

**Notes**:
- After consuming resolved credentials, SCRUB them from workflow_state to prevent leakage to execution records (part of 7-layer scrubbing from proposal #1255)
- `credential_id` on the executor config takes priority over `authentication` field — if both are set, credential_id wins
- AAP executor has TWO credential concepts (confirmed by UX mockup):
  - `credential_id` → "Authentication credential" dropdown → Nexus credential for AAP API auth (host, username, password, oauth_token)
  - `credentials: list[int]` → "Additional credentials (legacy)" text field → AAP-native credential IDs passed to the job template
- Agentic executor: Agent Orchestrator MUST accept per-request LLM credentials (confirmed by UX mockup showing "LLM provider credential" selector per AI Agent node). Coordinate with AO team.
- Credential selector label varies by node type per UX mockups:
  - AI Agent → "LLM provider credential" (filters to LLM Provider type)
  - AAP Job Execution → "Authentication credential" (filters to AAP API Credentials type)
  - REST API → "Authentication credential" (filters to HTTP Bearer / HTTP Basic types)

**Checkpoint**: Activities consume resolved credentials for auth. Fallback to existing patterns when no credential_id.

---

## Phase 16: Secret Scrubbing (Partial — AAP-68635)

**Purpose**: Ensure resolved credentials never persist in execution records or streams

- [X] T070 Create `src/nexus/workflows/workflow_engine/utils/credential_scrubber.py`:
  - `scrub_credentials(data: dict) -> dict` — strip credential-related keys from dicts
  - Keys to scrub: `activity_credentials`, `bearer_token`, `basic_username`, `basic_password`, `api_key`, `llm_api_key`, `aap_password`, `aap_oauth_token`, `ssh_private_key`
  - Deep copy input, walk nested dicts/lists, replace values with `"[REDACTED]"`
- [X] T071 Apply scrubbing in `dynamic_workflow.py` before storing activity results:
  - After each activity execution, before `workflow_state["activity_outputs"][activity_id] = result`
  - Scrub `workflow_state["activity_credentials"]` after activity consumes it
- [X] T072 Apply scrubbing in `ActivityUpdatePublisher` (`activity_update_publisher.py`):
  - Before publishing `initial_snapshot` and `activity_patch` messages to Redis stream
  - Prevent credentials from appearing in real-time execution feeds
- [X] T073 [P] Create `tests/unit/workflows/test_credential_scrubber.py`:
  - Test all credential keys are scrubbed
  - Test nested dict scrubbing
  - Test non-credential data is preserved
  - Test empty/None input handling

**Notes**:
- This is partial scrubbing — full 7-layer scrubbing (AAP-68635) is in Epic 4
- Covers layers: execution records (PostgreSQL), Redis streams, workflow state
- Does NOT cover: Temporal event history (needs DataConverter — Epic 4), invocation metadata, application logs
- Structured logs already follow the rule "only log credential IDs, never values"

**Checkpoint**: Resolved credentials scrubbed from workflow state, execution records, and Redis streams

---

## Phase 17: Polish & Verification

- [X] T074 [P] Run `make lint && make typecheck` — fix any ruff or mypy issues
- [X] T075 Verify 90%+ test coverage on all new code — `pytest --cov`

**Checkpoint**: All tests green, lint clean, 90%+ coverage

---

## Epic 3 Dependencies & Execution Order

```
Phase 12 (T052-T055) — executor configs (credential_id field)
    │
    ├──→ Phase 13 (T056-T059) — resolution activity + CredentialDisabledError
    │        │
    │        └──→ Phase 14 (T060-T063) — dynamic workflow integration
    │                 │
    │                 └──→ Phase 15 (T064-T069) — executor injection
    │                          │
    │                          └──→ Phase 16 (T070-T073) — secret scrubbing
    │
    └──→ Phase 17 (T074-T075) — polish (after all phases)
```

Strictly sequential — each phase depends on the previous.

## Epic 3 Jira Mapping

| Tasks | Jira Ticket | Notes |
|-------|-------------|-------|
| T052-T055 | AAP-68638 | Executor Config Models |
| T056-T059 | AAP-68636 (Part 1) | Resolution Activity + CredentialDisabledError |
| T060-T063 | AAP-68636 (Part 2) | Dynamic Workflow Integration |
| T064-T069 | AAP-68637 | Activity Executor Credential Injection |
| T070-T073 | AAP-68635 (partial) | Secret Scrubbing (partial, full is Epic 4) |
| T074-T075 | Cross-cutting | Polish |

## Resolved Questions (from UX mockups 2026-04-01)

1. **Agentic executor**: ✅ RESOLVED — Agent Orchestrator MUST accept per-request LLM credentials. UX mockup shows "LLM provider credential" dropdown on AI Agent nodes with per-credential selection (OpenAI API, Anthropic Claude, Azure OpenAI). Credentials passed as metadata in `invoke_agent_async()`.
2. **AAP executor**: ✅ RESOLVED — `credential_id` supplements (overrides when present), does NOT replace settings-based auth. UX mockup shows "Authentication credential" dropdown separate from "Additional credentials (legacy)" text field. Both coexist on the same node.
3. **Script executor**: ✅ RESOLVED — No credential selector on script nodes in UX mockups. Scripts use `environment` field for env vars. No `credentialId` on `ScriptExecutorConfig`.

Total: 24 tasks (4 executor config, 4 resolution activity, 4 dynamic workflow, 6 executor injection, 4 scrubbing, 2 polish). Estimated effort: ~3-4 days.
- Updated 2026-04-02: Added Epic 4 backend tasks (T076-T096) for Security Hardening (AAP-69554)

---

# Epic 4: Security Hardening and Operations — Backend (AAP-69554)

**Prerequisites**: Epic 1 (PR #520), Epic 2 (PR #528), Epic 3 (PR #560) — all merged
**Branch**: from `feature/ANSTRAT-1901-credential-secret`
**Already done (close)**: AAP-68630 (AAD Binding), AAP-68631 (Split Key), AAP-68658 (SSH Key type) — all in PR #520
**Descope**: AAP-68633 (Per-Credential Backend Routing) — post-GA per Robin's YAGNI

Delivers production-ready security posture and operator tooling for the credential system:
key rotation, backend error handling, full 7-layer secret scrubbing, and smoke tests.

---

## Phase 18: Key Rotation CLI [AAP-68632]

**Purpose**: Operator tool to re-encrypt all credentials with a new key after key compromise

- [ ] T076 Create `src/nexus/credentials/cli/rotate_keys.py`:
  - Entry point: `uv run python -m nexus.credentials.cli.rotate_keys --old-key <hex> --new-key <hex>`
  - Argparse with `--old-key`, `--new-key` (64-char hex strings), `--batch-size` (default 50), `--dry-run`
  - Create old and new `CredentialEncryptor` instances via `key_from_string()` from `src/nexus/credentials/lib/encryption.py`
  - Use `AsyncSessionLocal` from `src/nexus/core/database/session.py` (runs outside FastAPI, same as Temporal activities)
  - Iterate all `EncryptedSecret` rows from `src/nexus/core/models/secret.py` in batches
  - For each row: decrypt `encrypted_data` fields with old encryptor → re-encrypt with new encryptor (AAD stays same: `secret_id:field_name`)
  - Update row's `encrypted_data` JSONB in place
  - Commit per batch (not per row, not all at once)
  - Track progress: `{processed}/{total}` with structlog
  - Dry-run mode: decrypt + re-encrypt in memory, verify round-trip, don't write to DB
  - Resume capability: on failure, log last processed `secret_id` — operator can filter from there on retry
  - Exit codes: 0 success, 1 partial failure (some rows failed), 2 fatal error
- [ ] T077 Create `src/nexus/credentials/cli/__init__.py` (empty)
- [ ] T078 Create `src/nexus/credentials/cli/__main__.py` — dispatch to rotate_keys
- [ ] T079 [P] Create `tests/unit/credentials/test_rotate_keys.py`:
  - Test happy path: decrypt with old key, re-encrypt with new key, verify round-trip
  - Test batch processing: 3 batches of 2 rows each
  - Test dry-run: no DB writes, exit 0
  - Test invalid old key: decrypt fails, exit 1
  - Test invalid new key format: rejected before processing
  - Test empty DB: no rows to process, exit 0
  - Test partial failure: some rows fail, continue to next, exit 1
  - Mock `AsyncSessionLocal` and `EncryptedSecret` query

**Notes**:
- CLI runs offline — API server should NOT be running (key mismatch during rotation would corrupt reads)
- After rotation, operator updates `NEXUS_SECRET_ENCRYPTION_KEY` env var and restarts API server
- No key versioning in schema for GA — single key assumed
- AAD binding (`secret_id:field_name`) does NOT change during rotation — only the encryption key changes
- Follow `tools/workflow_cli.py` pattern: argparse, async, structlog

**Checkpoint**: `uv run python -m nexus.credentials.cli.rotate_keys --old-key <old> --new-key <new> --dry-run` succeeds

---

## Phase 19: Graceful Backend Error Handling [AAP-68634]

**Purpose**: Structured error responses when database/backend is unreachable during credential operations

- [ ] T080 Create storage backend exceptions in `src/nexus/core/exceptions.py` (or add to existing):
  - `StorageBackendError(NexusError)` — base for backend failures
  - `StorageBackendUnavailableError(StorageBackendError)` — DB connection failure (maps to 503)
  - `StorageBackendNotFoundError(StorageBackendError)` — secret not found (replaces raw `KeyError`, maps to 404)
  - Add `@fastapi_exception` handlers: 503 for unavailable (`retryable=True`), 404 for not found
  - Import module in `src/nexus/api/main.py` before `register_exceptions(app)`
- [ ] T081 Update `src/nexus/core/services/storage_backend.py`:
  - Wrap `KeyError` in `_get_or_raise()` → `StorageBackendNotFoundError`
  - Wrap SQLAlchemy `OperationalError`, `DatabaseError` in store/retrieve/update/delete → `StorageBackendUnavailableError`
  - Update `health_check()` to actually test DB connection: `SELECT 1` query, return False on failure
- [ ] T082 Update `src/nexus/core/services/secret_service.py`:
  - Let `StorageBackendError` propagate (don't catch) — handlers registered via `@fastapi_exception`
  - Remove raw `KeyError` propagation paths
- [ ] T083 [P] Create `tests/unit/core/test_storage_backend_errors.py`:
  - Test `_get_or_raise` missing key → `StorageBackendNotFoundError`
  - Test store with DB down → `StorageBackendUnavailableError`
  - Test retrieve with DB down → `StorageBackendUnavailableError`
  - Test health_check with DB up → True
  - Test health_check with DB down → False
- [ ] T084 [P] Create `tests/unit/core/test_secret_service_error_propagation.py`:
  - Test `StorageBackendNotFoundError` propagates from retrieve
  - Test `StorageBackendUnavailableError` propagates from store
  - Test error handler returns 503 with `retryable=True` for unavailable
  - Test error handler returns 404 for not found

**Notes**:
- For GA, only DatabaseBackend exists. VaultBackend (post-GA) would raise the same exception types
- `StorageBackendUnavailableError` is retryable (503) — DB might recover
- `StorageBackendNotFoundError` is not retryable (404) — data doesn't exist
- `src/nexus/core/error_handlers.py` already has 503 `service_unavailable` problem type (currently unused)

**Checkpoint**: Simulated DB connection failure returns RFC 9457 503 with `retryable: true`

---

## Phase 20: Full Secret Scrubbing [AAP-68635]

**Purpose**: Ensure credentials never persist in any layer after use

**Current state** (from PR #560, 4 of 7 layers done):
- ✅ Layer 1: `workflow_state` — scrubbed in `_scrub_activity_credentials`
- ✅ Layer 2: `task_inputs` — `_resolved_credentials` popped after consumption
- ✅ Layer 3: Execution records (PostgreSQL) — `activity_inputs` scrubbed before storage
- ✅ Layer 4: Redis streams — `ActivityUpdatePublisher` scrubs snapshots + patches

**Remaining 3 layers**:

- [ ] T085 **Layer 5: Temporal event history** — Create `src/nexus/workflows/workflow_engine/codecs/credential_codec.py`:
  - Implement `temporalio.converter.PayloadCodec` subclass (`CredentialPayloadCodec`)
  - `encode()`: serialize payload to bytes, scan for credential keys from `CREDENTIAL_KEYS` in `src/nexus/workflows/workflow_engine/utils/credential_scrubber.py`, replace values with `[REDACTED]`
  - `decode()`: pass through unchanged (redaction is one-way — Temporal history is write-once)
  - Only scrub payloads for `resolve_workflow_credentials` activity (identify by activity name in metadata)
- [ ] T086 Wire codec into `src/nexus/workflows/workflow_engine/services/temporal_worker.py`:
  - Import `CredentialPayloadCodec`
  - Create `DataConverter` with `payload_codec=CredentialPayloadCodec()`
  - Pass to `Worker(data_converter=...)` and `Client.connect(data_converter=...)`
- [ ] T087 **Layer 6: Invocation metadata** — Verify Agent Orchestrator clears LLM credentials after use:
  - Read `src/nexus/agent_orchestrator/` to confirm metadata is in-memory only (not persisted to DB)
  - Add structlog warning if `llm_api_key` appears in invocation metadata after agent completes
  - If AO persists metadata to DB, add scrubbing before persistence
- [ ] T088 **Layer 7: Application logs** — Create `tests/unit/workflows/test_credential_log_safety.py`:
  - Scan all structlog calls in credential-related files
  - Verify no credential values are logged (only IDs, type names, field names)
  - Test: capture structlog output during credential resolution, assert no values from `CREDENTIAL_KEYS` appear in log lines
- [ ] T089 [P] Create `tests/unit/workflows/test_credential_codec.py`:
  - Test encode scrubs credential keys from payload
  - Test encode passes non-credential payloads unchanged
  - Test decode is identity (passthrough)
  - Test only `resolve_workflow_credentials` activity payloads are scrubbed

**Notes**:
- `PayloadCodec` operates on serialized bytes — need to deserialize to JSON, scrub, re-serialize
- The codec applies to ALL activity payloads on the worker. Use activity name filtering to only scrub credential-related activities (avoid unnecessary overhead)
- Temporal UI will show `[REDACTED]` for credential values — intended UX for operators
- Layer 6 (invocation metadata) is likely a no-op — AO metadata is in-memory. Verification task.
- Layer 7 (logs) is a verification test, not code change
- `temporalio >= 1.5.0` in pyproject.toml supports PayloadCodec API
- Existing interceptor pattern: `src/nexus/workflows/workflow_engine/interceptors/monitoring_interceptor.py`

**Checkpoint**: Temporal UI shows `[REDACTED]` for credential fields in workflow execution history

---

## Phase 21: CLI Smoke Tests [AAP-68647]

**Purpose**: End-to-end script exercising all credential scenarios

- [ ] T090 Create `tools/credential_smoke_test.py`:
  - Requires running DB + API server (`make dev`)
  - Uses `httpx` to call credential API endpoints
  - Test sequence:
    1. List credential types → verify 5 preseeded types
    2. Create credential (HTTP Bearer Token type) → verify 201 + masked response
    3. Get credential → verify masked inputs
    4. List credentials → verify credential appears with `workflow_count`
    5. Update credential (change name + preserve `$encrypted$` inputs) → verify 200
    6. Disable credential → verify `enabled=false`
    7. Re-enable credential → verify `enabled=true`
    8. Get credential workflows → verify empty list
    9. Delete credential → verify 204
    10. Get deleted credential → verify 404
  - Color-coded output: green pass, red fail
  - Exit 0 if all pass, exit 1 if any fail
  - `--base-url` flag (default `http://localhost:8000`)
  - `--token` flag for JWT auth token
  - Follow `tools/workflow_cli.py` pattern: argparse, async httpx, structlog
- [ ] T091 [P] Test the smoke test script manually against running dev server
- [ ] T092 Add Makefile target: `make smoke-credentials`

**Notes**:
- This is NOT a pytest test — standalone script for operator verification
- Does NOT test key rotation (separate CLI, needs offline DB access)
- Does NOT test workflow credential resolution (needs Temporal + workflow setup)

**Checkpoint**: `make smoke-credentials` runs against dev server and passes all 10 checks

---

## Phase 22: Polish & Verification

- [ ] T093 Run `make lint && make typecheck` — fix any ruff or mypy issues
- [ ] T094 Verify 90%+ test coverage on all new Epic 4 code — `pytest --cov`
- [ ] T095 Close Jira tickets: AAP-68630, AAP-68631, AAP-68658 with comment "Delivered in PR #520"
- [ ] T096 Descope AAP-68633 — move to post-GA backlog with comment "Post-GA per Robin's YAGNI feedback"

**Checkpoint**: All tests green, lint clean, 90%+ coverage, Jira updated

---

## Epic 4 Dependencies & Execution Order

```
Phase 18 (T076-T079) — Key Rotation CLI ──────────────┐
Phase 19 (T080-T084) — Graceful Backend Error Handling ├──→ Phase 21 (T090-T092) — Smoke Tests
Phase 20 (T085-T089) — Full Secret Scrubbing ──────────┘         │
                                                                  ↓
                                                      Phase 22 (T093-T096) — Polish
```

Phases 18, 19, and 20 can run in **parallel** — they touch different files.
Phase 21 (smoke tests) runs **after** all others (tests the integrated system).

## Epic 4 Jira Mapping

| Tasks | Jira Ticket | Notes |
|-------|-------------|-------|
| T076-T079 | AAP-68632 | Key Rotation CLI |
| T080-T084 | AAP-68634 | Graceful Backend Error Handling |
| T085-T089 | AAP-68635 | Full Secret Scrubbing (remaining 3 layers) |
| T090-T092 | AAP-68647 | CLI Smoke Tests |
| T093-T096 | Cross-cutting | Polish + Jira housekeeping |

Total: 21 tasks. Estimated effort: ~3 days.
