# Data Model: Credential Storage Foundation

**Feature**: 039-credential-storage
**Date**: 2026-03-23
**Spec**: [spec.md](spec.md)

## Entity Relationship

```
+----------------------+      +----------------------+      +----------------------+
| credential_types     |      | credentials          |      | secrets              |
|----------------------|      |----------------------|      |----------------------|
| id (PK, UUID)        |<-FK--| credential_type_id   |      | id (PK, UUID)        |
| name (VARCHAR 255)   |      | id (PK, UUID)        |  FK  | storage_backend      |
| description (TEXT)   |      | name (VARCHAR 255)   |      | created_at (TIMESTZ) |
| inputs (JSONB)       |      | description (TEXT)   |      | updated_at (TIMESTZ) |
| injectors (JSONB)    |      | secret_id (UUID) ----+----->| id (PK, UUID)        |
| managed (BOOLEAN)    |      | enabled (BOOLEAN)    |      +----------+-----------+
| labels (JSONB)       |      | labels (JSONB)       |                 |
| created_at (TIMESTZ) |      | created_at (TIMESTZ) |            1:1 (FK)
| updated_at (TIMESTZ) |      | updated_at (TIMESTZ) |                 |
| deleted_at (TIMESTZ) |      | deleted_at (TIMESTZ) |      +----------+-----------+
|                      |      | deleted_by (UUID)    |      | encrypted_secrets    |
|                      |      | created_by (UUID)    |      |----------------------|
|                      |      | updated_by (UUID)    |      | id (PK, UUID)        |
+----------------------+      +----------------------+      | secret_id (FK, UNQ)  |
                                                            | encrypted_data (JSONB)|
                                                            | created_at (TIMESTZ) |
                                                            | updated_at (TIMESTZ) |
                                                            +----------------------+
```

**Data flow**: `credentials.secret_id` references `secrets.id` (PK). Encrypted field values live in `encrypted_secrets` (1:1 with `secrets` via `encrypted_secrets.secret_id` FK). The `secrets` table contains zero secret values — only routing metadata for the `StorageBackend` Protocol.

## Table: credential_types

Extends `BaseResource` (id, created_at, updated_at, labels). `deleted_at` is from `SoftDeletableResource` mixin — CredentialType does not currently use soft-delete but inherits the field via BaseResource.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default uuid4 | Auto-generated |
| name | VARCHAR(255) | NOT NULL | Human-readable name |
| description | TEXT | nullable | Optional description |
| inputs | JSONB | NOT NULL, default {} | Field schema (see [inputs JSONB Structure](#inputs-jsonb-structure) below). Max 64KB serialized |
| injectors | JSONB | NOT NULL, default {} | Injection templates (see [injectors JSONB Structure](#injectors-jsonb-structure) below) |
| managed | BOOLEAN | NOT NULL, default false | true = preseeded system type |
| labels | JSONB | NOT NULL, default {} | Key-value labels |
| created_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-set |
| updated_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-updated |
| deleted_at | TIMESTAMPTZ | nullable | Soft-delete marker |

### inputs JSONB Structure

```json
{
  "fields": [
    {
      "id": "token",
      "label": "Token",
      "type": "string",
      "secret": true,
      "help_text": "The bearer token value",
      "multiline": false,
      "choices": null,
      "default": null
    }
  ],
  "required": ["token"]
}
```

**Field properties**:

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| id | string | yes | Unique field identifier, used as storage key |
| label | string | yes | Human-readable label for UI rendering |
| type | string | yes | `"string"` or `"boolean"` |
| secret | boolean | yes | If true, masked as `$encrypted$` in API responses |
| help_text | string | no | Tooltip text for UI forms |
| multiline | boolean | no | If true, render as TextArea (e.g., SSH keys) |
| choices | string[] | no | Dropdown options for select fields |
| default | any | no | Default value for the field |

### injectors JSONB Structure

```json
{
  "extra_vars": {
    "auth_type": "bearer",
    "bearer_token": "{{token}}"
  },
  "env": {},
  "file": {}
}
```

Template syntax: `{{field_id}}` is replaced with decrypted field values at runtime by the InjectorResolver.

## Table: credentials

Extends `Resource` which composes `NamedResource` (name, description) + `SoftDeletableResource` (deleted_at, deleted_by) + `UserOwnedResource` (created_by, updated_by). See `src/nexus/core/models/base/` for the inheritance chain.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default uuid4 | Auto-generated |
| name | VARCHAR(255) | NOT NULL | Human-readable name |
| description | TEXT | nullable | Optional description |
| credential_type_id | UUID | FK → credential_types.id, NOT NULL | Which type schema applies |
| secret_id | UUID | FK → secrets.id, NOT NULL | Reference to secret routing record |
| enabled | BOOLEAN | NOT NULL, default true | false = disabled (422 on resolve) |
| labels | JSONB | NOT NULL, default {} | Key-value labels |
| created_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-set |
| updated_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-updated |
| deleted_at | TIMESTAMPTZ | nullable | Soft-delete marker |
| deleted_by | UUID | nullable | Who deleted |
| created_by | UUID | NOT NULL | Who created |
| updated_by | UUID | nullable | Who last updated |

### Indexes

| Index | Columns | Type | Condition |
|-------|---------|------|-----------|
| ix_credentials_name_unique | name | UNIQUE | WHERE deleted_at IS NULL |
| ix_credentials_created_at_id | created_at, id | B-TREE | Pagination cursor |
| ix_credentials_credential_type_id | credential_type_id | B-TREE | FK lookup |

## Table: secrets

Routing table for the `StorageBackend` Protocol. Contains zero secret values — only metadata about which backend stores the data. Shared infrastructure used by credentials (GA), application settings, and OIDC configs (post-GA).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default uuid4 | Auto-generated |
| storage_backend | VARCHAR(50) | NOT NULL, default 'database' | Which backend stores the data |
| created_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-set |
| updated_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-updated |

### Indexes

| Index | Columns | Type |
|-------|---------|------|
| ix_secrets_storage_backend | storage_backend | B-TREE |

## Table: encrypted_secrets

Backend storage for `DatabaseBackend`. Stores AES-256-GCM encrypted field data as JSONB. 1:1 relationship with `secrets` for GA (one encrypted payload per secret).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, default uuid4 | Auto-generated |
| secret_id | UUID | FK → secrets.id, NOT NULL, UNIQUE | Which secret this data belongs to |
| encrypted_data | JSONB | NOT NULL | Encrypted field values `{field_name: base64_ciphertext}` |
| created_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-set |
| updated_at | TIMESTAMPTZ | NOT NULL, server default now() | Auto-updated |

### encrypted_data JSONB — Encrypted Format

ALL field values are encrypted individually using AES-256-GCM. Each value stored as:

```
base64( nonce_12_bytes + ciphertext + tag_16_bytes )
```

- **Nonce**: 96-bit random via `os.urandom(12)`, fresh per encrypt operation
- **Key**: The 256-bit AES key loaded from `NEXUS_SECRET_ENCRYPTION_KEY` environment variable (64-character hex string decoded to 32 bytes). This is the same key used for all encrypt/decrypt operations across all secrets
- **AAD** (Associated Authenticated Data): The string `secret_id:field_name` is passed alongside the key during encryption. AES-256-GCM binds the ciphertext to this context — decryption fails if a different secret_id or field_name is used, preventing ciphertext substitution attacks (e.g., swapping an encrypted token between two different credentials)
- Both secret and non-secret fields are encrypted (defense in depth)

Example stored value in `encrypted_secrets.encrypted_data`:
```json
{
  "token": "v97FchV3EjEjiiX9iK9AyQR5I9eBF+Ix/8eZSdXQa2Ce...",
  "host": "mN3bQxK7pLm2...",
  "verify_ssl": "aB4cDeFgHiJk..."
}
```

## GA Managed Credential Types (Preseeded)

### HTTP Bearer Token
```json
{
  "inputs": {
    "fields": [
      {"id": "token", "label": "Token", "type": "string", "secret": true, "help_text": "Bearer token value"}
    ],
    "required": ["token"]
  },
  "injectors": {
    "extra_vars": {"auth_type": "bearer", "bearer_token": "{{token}}"}
  }
}
```

### HTTP Basic Auth
```json
{
  "inputs": {
    "fields": [
      {"id": "username", "label": "Username", "type": "string", "secret": false, "help_text": "Username for authentication"},
      {"id": "password", "label": "Password", "type": "string", "secret": true, "help_text": "Password for authentication"}
    ],
    "required": ["username", "password"]
  },
  "injectors": {
    "extra_vars": {"auth_type": "basic", "basic_username": "{{username}}", "basic_password": "{{password}}"}
  }
}
```

### AAP API Credentials
```json
{
  "inputs": {
    "fields": [
      {"id": "host", "label": "AAP Host", "type": "string", "secret": false, "help_text": "AAP Controller hostname or URL"},
      {"id": "username", "label": "Username", "type": "string", "secret": false, "help_text": "AAP username (optional if using token)"},
      {"id": "password", "label": "Password", "type": "string", "secret": true, "help_text": "AAP password (optional if using token)"},
      {"id": "oauth_token", "label": "OAuth Token", "type": "string", "secret": true, "help_text": "AAP OAuth2 token (preferred over username/password)"},
      {"id": "verify_ssl", "label": "Verify SSL", "type": "boolean", "secret": false, "default": true, "help_text": "Verify SSL certificates"}
    ],
    "required": ["host"]
  },
  "injectors": {
    "extra_vars": {
      "auth_type": "aap",
      "aap_host": "{{host}}", "aap_username": "{{username}}", "aap_password": "{{password}}",
      "aap_oauth_token": "{{oauth_token}}", "aap_verify_ssl": "{{verify_ssl}}"
    }
  }
}
```

### LLM Provider

Only `api_key` is required. `provider` and `base_url` are optional because some setups use environment-based defaults (e.g., OpenRouter sets base_url globally). The injector templates handle missing values gracefully — `{{field_id}}` resolves to empty string if the field is not set. Model name is not included here — model selection happens at the workflow/agent level, not in the credential.

```json
{
  "inputs": {
    "fields": [
      {"id": "provider", "label": "Provider", "type": "string", "secret": false, "choices": ["openai", "anthropic", "openrouter", "azure_openai", "other"], "help_text": "LLM provider (optional — used for routing)"},
      {"id": "api_key", "label": "API Key", "type": "string", "secret": true, "help_text": "API key for the LLM provider"},
      {"id": "base_url", "label": "Base URL", "type": "string", "secret": false, "help_text": "Optional custom base URL (overrides provider default)"}
    ],
    "required": ["api_key"]
  },
  "injectors": {
    "extra_vars": {"auth_type": "api_key", "llm_provider": "{{provider}}", "llm_api_key": "{{api_key}}", "llm_base_url": "{{base_url}}"}
  }
}
```

### SSH Key (Non-Protected)
```json
{
  "inputs": {
    "fields": [
      {"id": "username", "label": "Username", "type": "string", "secret": false, "help_text": "SSH username"},
      {"id": "ssh_private_key", "label": "SSH Private Key", "type": "string", "secret": true, "multiline": true, "help_text": "Paste private key contents (OpenSSH format, no passphrase)"}
    ],
    "required": ["username", "ssh_private_key"]
  },
  "injectors": {
    "extra_vars": {"auth_type": "ssh", "ssh_username": "{{username}}", "ssh_private_key": "{{ssh_private_key}}"}
  }
}
```

## API Request/Response Schemas

### CredentialCreate (POST body)

```json
{
  "name": "My API Token",
  "description": "Production API token",
  "credential_type_id": "uuid",
  "inputs": {"token": "actual-secret-value"},
  "labels": {"env": "production"}
}
```

### CredentialRead (GET response)

Secret fields masked, non-secret fields in plaintext:

```json
{
  "id": "uuid",
  "name": "My API Token",
  "description": "Production API token",
  "credential_type_id": "uuid",
  "inputs": {"token": "$encrypted$"},
  "enabled": true,
  "labels": {"env": "production"},
  "created_at": "2026-03-23T00:00:00Z",
  "updated_at": "2026-03-23T00:00:00Z",
  "created_by": "uuid"
}
```

### CredentialPatch (PATCH body)

Partial update — only included fields are changed. Omitted fields are preserved. For `inputs`, the patch is also partial: omitted input fields keep their existing values.

**Example 1**: Update name only (inputs unchanged):
```json
{
  "name": "Updated Name"
}
```

**Example 2**: Update LLM Provider base_url, preserve api_key (using `$encrypted$` sentinel):
```json
{
  "inputs": {"api_key": "$encrypted$", "base_url": "https://new-endpoint.example.com"}
}
```

**Example 3**: Same result — omitting api_key also preserves it:
```json
{
  "inputs": {"base_url": "https://new-endpoint.example.com"}
}
```

`$encrypted$` = explicitly keep existing encrypted value (no re-encryption). Omitting a field from `inputs` has the same effect.

### CredentialTypeRead (GET response)

```json
{
  "id": "uuid",
  "name": "HTTP Bearer Token",
  "description": "Bearer token authentication for HTTP APIs",
  "inputs": {"fields": [...], "required": [...]},
  "injectors": {"extra_vars": {...}},
  "managed": true,
  "created_at": "2026-03-23T00:00:00Z",
  "updated_at": "2026-03-23T00:00:00Z"
}
```

## Internal Service Layer — Credential Resolution

Secret values are never exposed through the REST API. Resolution happens internally:

```
CredentialService.resolve_credential(credential_id)
  → fetch Credential from DB (includes secret_id FK)
  → SecretService.retrieve_secret(credential.secret_id)
    → DatabaseBackend.retrieve(secret_id) from encrypted_secrets table
    → CredentialEncryptor.decrypt_fields(encrypted_data, secret_id)
  → load CredentialType for injector templates
  → InjectorResolver.resolve(type.injectors, decrypted_inputs)
  → return ResolvedInjectors(extra_vars={...}, env={...}, file={...})
```

**CRUD flow through SecretService**:

- **Create**: `SecretService.create_secret(plaintext_inputs)` → creates `secrets` row + encrypts and stores in `encrypted_secrets` → returns `secret_id` → `Credential.secret_id = secret_id`
- **Read**: `SecretService.retrieve_secret(secret_id)` → fetches from `encrypted_secrets` → decrypts → returns plaintext
- **Update**: `SecretService.update_secret(secret_id, plaintext_inputs)` → re-encrypts → updates `encrypted_secrets`
- **Delete**: `SecretService.delete_secret(secret_id)` → deletes from `encrypted_secrets` + `secrets`
- **List**: No backend contact — all fields masked as `$encrypted$` without decryption

This service method is called by the workflow engine (Epic 3: AAP-69553) during activity execution — not by the REST API.
