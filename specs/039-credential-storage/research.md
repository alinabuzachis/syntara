# Research: Credential Storage Foundation

**Feature**: 039-credential-storage
**Date**: 2026-03-23
**Spec**: [spec.md](spec.md)

## R1: Domain Structure — Follow Existing Pattern

**Decision**: Follow the established `src/nexus/{domain}/` structure with `models/`, `services/`, `lib/`, `router.py`, `exceptions.py`, `error_handlers.py`.

**Rationale**: Consistent with `tool_manager/`, `approvals/`, `workflows/`, and all other Nexus domains. Router auto-discovery requires a `router.py` exporting a `router` variable.

**Source**: `src/nexus/tool_manager/` as reference implementation.

## R2: Model Inheritance — Resource, Not BaseResource

**Decision**: `Credential` extends `Resource` (full audit trail: name, description, labels, soft-delete, user ownership). `CredentialType` extends `BaseResource` (no name uniqueness constraints from Resource, manages its own name field).

**Rationale**: `Resource` provides `name`, `description`, `deleted_at`, `deleted_by`, `created_by`, `updated_by`, `labels` — all needed for Credentials. Existing patterns (`Tool`, `ToolProvider`, `Workflow`) all extend `Resource`.

**Alternatives**: `BaseResource` lacks soft-delete and user ownership — insufficient for audit requirements.

## R3: Encryption Library — Add cryptography Dependency

**Decision**: Add `cryptography>=42.0.0` to `pyproject.toml` dependencies.

**Rationale**: Not currently in the dependency list. Required for AES-256-GCM authenticated encryption. The `cryptography` library is the Python standard for this — maintained by PyCA, FIPS-validated, widely audited.

**Alternatives**: `PyCryptodome` (less maintained), `nacl` (different API), manual OpenSSL bindings (too low-level).

## R4: Encryption Algorithm — AES-256-GCM with Per-Field Nonce

**Decision**: Use AES-256-GCM with:
- 256-bit key (32 bytes)
- 96-bit random nonce per field per operation via `os.urandom(12)`
- Associated Authenticated Data (AAD) = `secret_id:field_name`
- Output format: `base64(nonce_12_bytes + ciphertext + tag_16_bytes)`

**Rationale**: AES-256-GCM provides both confidentiality and integrity. Per-field nonce ensures identical plaintext produces different ciphertext. AAD prevents ciphertext substitution attacks (swapping encrypted values between credentials).

**Key configuration**:
- `NEXUS_SECRET_ENCRYPTION_KEY`: 64-character hex string (32 bytes decoded)
- Application MUST fail at startup if key is missing

## R5: Encryption Key Configuration

**Decision**: Support `NEXUS_SECRET_ENCRYPTION_KEY` as a 64-character hex string environment variable.

**Rationale**: Follows the Nexus `NEXUS_` prefix convention for all settings. Hex encoding is unambiguous — no character encoding issues. The key is loaded via the Settings mixin pattern (`CredentialEncryptionSettings`).

**Implementation**: Add a `CredentialEncryptionSettings` mixin to `src/nexus/core/config/base.py` following the established mixin composition pattern (like `DatabaseSettings`, `OpenRouterSettings`).

## R6: Settings Mixin Pattern

**Decision**: Create `CredentialEncryptionSettings(BaseSettings)` mixin, add to `Settings` class.

**Rationale**: All Nexus settings use mixin composition in `src/nexus/core/config/base.py`. Each domain adds a `*Settings(BaseSettings)` class with `NEXUS_`-prefixed env vars. The `Settings` class inherits from all mixins.

**Source**: Lines 1255-1303 of `src/nexus/core/config/base.py` — `OpenRouterSettings`, `DatabaseSettings`, etc.

## R7: Service Layer — BaseService with Custom Mixins

**Decision**: `CredentialService(BaseService)` with custom `EnrichQueryMixin` and `ConvertResourceMixin`.

**Rationale**: `BaseService` provides `list_resources()`, `get_resource()`, `create_resource()`, `update_resource()`, `delete_resource()` with standard pagination, filtering, sorting. Custom mixins handle credential-specific logic (eager-loading type relationships, masking secrets in responses).

**Source**: `ToolService` in `src/nexus/tool_manager/services/tool_service.py` as reference.

## R8: Error Handling — @fastapi_exception Decorator

**Decision**: Use `@fastapi_exception(handler=...)` decorator on exception classes. Handlers use `create_problem_details_response()`.

**Rationale**: Automatic registration via `register_exceptions(app)` in main.py. RFC 9457 response format with `type`, `title`, `status`, `detail`, `code`, `retryable`, `instance`.

**Error types needed**:
- `CredentialNotFoundError` → 404, `CREDENTIAL_NOT_FOUND`
- `CredentialNameConflictError` → 409, `CREDENTIAL_NAME_CONFLICT`
- `CredentialValidationError` → 422, `CREDENTIAL_VALIDATION_ERROR`
- `CredentialDecryptionError` → 500, `CREDENTIAL_DECRYPTION_ERROR`

**Source**: `src/nexus/tool_manager/error_handlers.py`, `src/nexus/core/error_handlers.py`.

## R9: Router Auto-Discovery

**Decision**: Create `src/nexus/credentials/router.py` with `router = APIRouter(prefix="/credentials", tags=["credentials"])`. Auto-discovered by `discover_and_register_routers()`.

**Rationale**: All Nexus routers are auto-discovered from `src/nexus/{domain}/router.py`. No manual registration in `main.py` needed.

**Convention**: Router prefix = `/credentials`. Full path = `/api/v1/credentials`. Credential types at `/api/v1/credential-types` (separate prefix or sub-path).

## R10: Preseed Location — Lifespan Function

**Decision**: Add preseed call in `lifespan()` function in `src/nexus/api/main.py`, after router discovery, before `yield`.

**Rationale**: Preseed needs a database session. The lifespan function is the standard location for startup initialization. Preseed is idempotent so safe to run on every startup.

**Implementation**: `await preseed_credential_types(session)` using `AsyncSessionLocal()`.

## R11: StorageBackend Protocol — Generic Design

**Decision**: `StorageBackend` is a `typing.Protocol` with 5 async methods: `store`, `retrieve`, `update`, `delete`, `health_check`. GA implementation: `DatabaseBackend` stores encrypted field data in the `encrypted_secrets` PostgreSQL table. Consumers reference secrets via `secret_id` FK → `secrets` routing table → `encrypted_secrets`.

**Rationale**: Per March 20 design meeting, the protocol serves ALL sensitive data (not just Credentials). The interface is generic — consumers (Credentials, application settings, OIDC) store/retrieve through `SecretService` which delegates to the configured backend. The `secrets` table contains zero secret values — only routing metadata. The `encrypted_secrets` table holds AES-256-GCM encrypted field data as JSONB.

**Future**: `VaultBackend` stores in HashiCorp Vault KV v2. Other backends (AWS SM, Azure KV) add new classes implementing the same protocol.

## R12: Secret vs Non-Secret Masking

**Decision**: Each Credential type's `inputs.fields` schema includes a `secret: boolean` property per field. In API responses, fields with `secret: true` are masked as `$encrypted$`. Fields with `secret: false` are returned in plaintext. In the database, ALL fields are encrypted regardless of the `secret` flag.

**Rationale**: The `secret` flag drives API response masking, not storage encryption. This provides defense in depth — even non-secret fields like hostnames are encrypted at rest.

**Impact**: The `CredentialService` must decrypt all fields on read, then apply masking based on the type schema before returning the API response.

## R13: Preseed Mechanics — Idempotent Upsert

**Decision**: On startup, query `CredentialType` by name for each managed type. If exists, update `inputs`/`injectors`/`description`. If not, create. Set `managed=True` on all preseeded types.

**Rationale**: Allows managed type schemas to evolve across releases (e.g., adding a new field to AAP API Credentials) without breaking existing credentials. The `managed` flag prevents users from deleting system types.

**Pattern**: Similar to EDA's `create_initial_data` pattern.
