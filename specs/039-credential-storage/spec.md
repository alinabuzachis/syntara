# Feature Specification: Credential Storage Foundation

**Feature Branch**: `039-credential-storage`
**Created**: 2026-03-23
**Status**: Draft
**Input**: Epic AAP-69551 — Credential Storage Foundation (Enabler) for ANSTRAT-1901

## Terminology

Per the 2026-03-20 Nexus Configuration/Secrets design meeting:

- **Credential** (capital C): A first-class resource in Nexus, created by users with sufficient permission, for authenticating with something. Used for tasks in Nexus (workflows, chat, agentic orchestration). Not scoped to "workflows" — usable across all contexts.
- **secret** (lowercase): Broader sensitive application data that needs to be stored. All Credentials contain secrets, but not all secrets are Credentials (e.g., sensitive application settings, OIDC client secrets).
- **StorageBackend**: A generic protocol for storing ALL sensitive data — not just Credentials. Credentials, application settings, and other consumers all store their sensitive values through this protocol. This specification implements the protocol; other specifications extend its use beyond Credentials.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Encrypted Credential Storage (Priority: P1)

As an automation architect, I want to create Credentials with authentication information so that they are securely encrypted at rest and available for use in workflows and integrations.

**Why this priority**: Without encrypted storage, no Credential data can be persisted. This is the foundation that all other credential specifications depend on.

**Independent Test**: Can create a credential via `POST /credentials` and retrieve it via `GET /credentials/{id}` with secret fields masked as `$encrypted$`. Direct database inspection confirms all values are encrypted.

**Acceptance Scenarios**:

1. **Given** I call `POST /credentials` with a valid credential type and inputs, **When** the credential is created, **Then** all field values are encrypted in the database and the response masks secrets as `$encrypted$`.
2. **Given** I have created a credential, **When** I call `GET /credentials`, **Then** only metadata is returned (no decryption, no backend contact).
3. **Given** I have a credential, **When** I call `GET /credentials/{id}`, **Then** secret fields show `$encrypted$` and non-secret fields show actual values.
4. **Given** I call `PATCH /credentials/{id}` with a secret field set to `$encrypted$`, **When** the update is processed, **Then** the existing encrypted value is preserved without re-encryption.
5. **Given** I call `DELETE /credentials/{id}`, **When** the credential is deleted, **Then** it is soft-deleted and no longer appears in listings.

---

### User Story 2 - Credential Type System (Priority: P1)

As a platform developer, I want Credential types with defined field schemas and injection patterns so that the system validates inputs and knows how to transform stored values into configuration for activities.

**Why this priority**: The type system drives input validation. Without it, Credentials cannot be created with consistent schemas.

**Independent Test**: After application startup, `GET /credential-types` returns the preseeded managed types with valid schemas containing field definitions and injector templates. The data model is extensible — custom types can be added post-GA without migration. GA exposes read-only API (`GET` only); full CRUD for custom types is deferred to post-GA.

**Acceptance Scenarios**:

1. **Given** the application has started, **When** I call `GET /credential-types`, **Then** I receive 5 managed types (HTTP Bearer Token, HTTP Basic Auth, AAP API Credentials, LLM Provider, SSH Key Non-Protected) with `inputs` and `injectors` schemas.
2. **Given** a credential type with a `multiline: true` field (SSH private key), **When** the schema is read, **Then** the `multiline` property is included.
3. **Given** a credential type, **When** I pass its injectors and decrypted inputs to the InjectorResolver, **Then** `{{field_id}}` templates are resolved to actual values.
4. **Given** the application restarts, **When** preseed runs again, **Then** managed types are updated idempotently (no duplicates created).

---

### User Story 3 - Credential CRUD API (Priority: P1)

As an automation architect, I want a complete REST API for managing Credentials so that I can create, list, view, update, and delete Credentials programmatically.

**Why this priority**: The API is the primary deliverable and exit criterion of this specification.

**Independent Test**: Full CRUD lifecycle via curl — create with valid inputs, list, get (masked), update with `$encrypted$` preservation, delete (soft).

**Acceptance Scenarios**:

1. **Given** I submit inputs with an unknown field ID, **When** validation runs, **Then** it returns `422` listing the unknown fields.
2. **Given** I submit inputs missing a required field, **When** validation runs, **Then** it returns `422` naming the missing field.
3. **Given** a credential name that already exists (non-deleted), **When** I create a credential with that name, **Then** it returns `409` name conflict.
4. **Given** a valid Credential creation request, **When** I inspect the database directly, **Then** every field value in the `inputs` column is encrypted (not readable as plaintext).

---

### User Story 4 - Encrypt All Field Values (Priority: P1)

As a security engineer, I want all Credential field values encrypted at rest — not just the fields marked as secret — so that non-secret values are also protected in the database.

**Why this priority**: Defense in depth. Each Credential type's schema marks fields as secret or non-secret. Secret fields (passwords, tokens, keys) are masked as `$encrypted$` in API responses. Non-secret fields (hostnames, usernames) are returned in plaintext. But in the database, ALL fields are encrypted regardless.

**Independent Test**: Create a credential with boolean and string fields, then inspect the database to confirm no plaintext values exist.

**Acceptance Scenarios**:

1. **Given** a credential with a boolean field (`verify_ssl: true`), **When** stored, **Then** the value is serialized to string and encrypted.
2. **Given** an encrypted boolean field, **When** retrieved via API, **Then** it is decrypted and returned as the original boolean type.
3. **Given** the credentials table, **When** inspecting the raw stored data, **Then** every value is encrypted — no plaintext of any type.

---

### Edge Cases

- What happens when the encryption key is missing at startup? → Application starts with a default insecure key (`"0" * 64`) and logs a WARNING. This allows dev/test environments to run without configuration. Production deployments MUST set `NEXUS_SECRET_ENCRYPTION_KEY` to a secure random value.
- What happens when the same Credential name is used? → Names are unique per non-deleted. Returns `409`.
- What happens when Credential secret fields are updated? → Only changed fields are re-encrypted. `$encrypted$` retains existing value.
- What happens when a referenced Credential type doesn't exist? → Returns `404` with clear error.
- What happens when the StorageBackend is unreachable? → Returns `503` with retryable indicator.
- What happens when a user submits `$encrypted$` as an input value? → Returns `422`. The sentinel value is reserved for masking and cannot be used as actual input.
## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST encrypt ALL Credential field values at rest (both secret and non-secret, including booleans and integers serialized to strings).
- **FR-002**: System MUST never expose decrypted secret values in API responses, error messages, or logs. Secret fields MUST be masked as `$encrypted$`.
- **FR-003**: System MUST preseed 5 managed Credential types at GA: HTTP Bearer Token, HTTP Basic Auth, AAP API Credentials, LLM Provider, SSH Key (Non-Protected). The data model MUST be extensible to support custom types without migration. GA exposes read-only API (`GET /credential-types`); full CRUD for custom types is deferred to post-GA.
- **FR-004**: System MUST store Credential types with `inputs` (field schemas) and `injectors` (consumption mapping). Field schema MUST support `multiline: boolean` for multi-line text rendering.
- **FR-005**: System MUST preseed managed Credential types on application startup. Preseeded types are built-in type definitions that ship with the application so common authentication patterns work out of the box. Running preseed multiple times MUST produce the same result (idempotent — created on first run, updated in place on subsequent runs, never duplicated).
- **FR-006**: System MUST validate Credential inputs against the type's schema (required fields, unknown fields, choices).
- **FR-007**: System MUST abstract Credential storage behind a pluggable protocol to enable future backends (Vault, AWS SM). This protocol is generic — designed to serve all sensitive data (Credentials, application settings, OIDC configs), not just Credentials.
- **FR-008**: System MUST generate a unique random nonce per encryption operation for each field.
- **FR-009**: System MUST resolve injector templates at runtime, transforming stored values into structured configuration for downstream consumers such as workflow activities.

### Key Entities *(include if feature involves data)*

- **CredentialType**: Defines the schema (what fields a Credential has) and consumption model (how values are transformed into configuration for downstream consumers such as workflow activities). Managed types are preseeded and cannot be deleted by users.
- **Credential**: A named instance of a Credential type. Contains metadata (name, description, labels) and a `secret_id` FK pointing to the `secrets` routing table. Encrypted field values are stored separately in `encrypted_secrets`. Supports soft-delete for audit trail.
- **Secret**: Generic routing record that maps any consumer (Credential, ApplicationSetting, OIDC config) to a storage backend. Contains zero secret values — only `storage_backend` metadata. Shared infrastructure in `src/nexus/core/`.
- **SecretService**: Shared service that manages `Secret` lifecycle and delegates encryption/storage to the `StorageBackend` Protocol. Consumers (CredentialService, `GlobalSettingsService` per [PR #1332](pull/1332)) pass plaintext and receive plaintext — encryption is an implementation detail.
- **CredentialEncryptor**: Handles encryption and decryption of field values using AES-256-GCM with per-field nonce and AAD binding (`secret_id:field_name`).
- **StorageBackend**: Pluggable protocol for storing and retrieving encrypted data. GA implementation (`DatabaseBackend`) stores encrypted data in the `encrypted_secrets` PostgreSQL table. Designed to serve all sensitive application data — not just Credentials.
- **InjectorResolver**: Resolves template placeholders in injectors using decrypted field values, producing structured configuration for downstream consumers.

### Consumer Integration

This specification delivers the `Secret` + `SecretService` infrastructure that multiple GA features depend on:

| Consumer | How it uses SecretService | Delivered by |
|----------|--------------------------|--------------|
| **Credential** (this spec) | `secret_id` FK, multi-field encrypted inputs via `store`/`retrieve`/`update`/`delete` | ANSTRAT-1901 (this spec) |
| **RuntimeSetting** | `secret_id` FK (nullable, when `is_sensitive=true`), single-value encrypted storage | ANSTRAT-1790 ([PR #1332](pull/1332)) |
| **OIDC Config** (post-GA) | `secret_id` FK for client secrets | ANSTRAT-1844 |

The `SecretService` and `Secret` model live in `src/nexus/core/` (not in `src/nexus/credentials/`) because they serve all consumers. See the [pluggable secret storage proposal](pull/1327) for the full architecture.

### Cache Coordination

When a consumer updates a sensitive value via `SecretService.update()`, the `encrypted_secrets` table changes but the consumer's own row (e.g., `runtime_settings`) is untouched. Consumers that cache setting values MUST either bump their own `version`/`updated_at` after calling `SecretService.update()`, or use a cache invalidation signal from `SecretService`. This is not a concern for GA if caching is not implemented, but must be addressed before any caching layer is introduced.

### Deferred to Post-GA (Constitution Exceptions)

- **Structured audit logging** for credential CRUD operations — deferred to Epic 2 (AAP-69552). This is a documented exception to Constitution Principle IV (Observability First). GA ships with basic `structlog` info/warning messages for create/update/delete events but NOT the full audit trail (who, what, when, from where). Audit logging MUST be added in Epic 2 before the feature reaches production maturity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An automation architect can create a Credential via the API and retrieve it with secrets masked — verified by a curl-based acceptance test completing successfully.
- **SC-002**: No plaintext Credential values exist in the database — verified by direct inspection of the stored data showing only encrypted values.
- **SC-003**: Managed Credential types are available after startup — verified by API call returning all types with valid schemas.
- **SC-004**: Invalid Credential inputs are rejected with clear error messages — verified by submitting unknown fields and missing required fields.
- **SC-005**: The data model supports adding new Credential types without migration — verified by confirming the extensible schema design. Full CRUD API for custom types is deferred to post-GA.
- **SC-006**: 90%+ test coverage on all foundation code — verified by coverage report.
