# Service Accounts

This document describes the OAuth 2.0 service accounts feature for machine-to-machine authentication in Nexus. It is intended for developers working on the project and is updated as each piece of the feature lands.

For human-user authentication (login, OIDC, sessions, CSRF), see [authentication.md](authentication.md).

## Overview

Service accounts enable programmatic API access without interactive user login. They use the OAuth 2.0 **client credentials grant** (RFC 6749 §4.4) — a client authenticates with a `client_id` and `client_secret`, and receives a short-lived JWT access token.

Use cases include CI/CD pipelines triggering workflows, ITSM platforms initiating remediation, partner systems exchanging data, and monitoring tools invoking automated responses.

### How it differs from human authentication

| Concern | Human auth | Service accounts |
|---------|-----------|-----------------|
| Flow | Browser redirect, cookies, PKCE | `POST /api/v1/auth/token` with client credentials |
| Session storage | PostgreSQL `refresh_sessions` | None — stateless JWT only |
| Token refresh | `POST /auth/refresh` with cookie | Not supported — request a new token |
| CSRF protection | Required (cookie-based auth) | N/A (bearer token only) |
| Identity providers | OIDC federation, claim mapping | N/A |
| Secret storage | Argon2id password hash on `users` | Argon2id secret hash on `service_account_credentials` |
| Rate limiting | Per-user global (in progress) | Per-`client_id` sliding window |

### Shared infrastructure

Service accounts reuse the same JWT signing infrastructure as human authentication:

- **ES256 key pair** — same `TokenService` and `KeyManager` (see [Key Management](authentication.md#key-management))
- **Token validation** — same middleware validates signatures and checks `exp`
- **Global revocation** — the global revocation timestamp applies to service account tokens (see [Global Token Revocation](authentication.md#global-token-revocation))

## Data Model

### `service_accounts` table

The `ServiceAccount` model (`src/nexus/service_accounts/models/service_account.py`) inherits from `NamedResource`, `SoftDeletableResource`, and `UserOwnedResource`.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK, FK → `principals`) | Auto-generated primary key |
| `name` | VARCHAR(255) | Human-readable name |
| `description` | VARCHAR(2000) | Optional description |
| `status` | ENUM (`active`, `disabled`) | Operational status |
| `project_id` | UUID (FK → `projects`) | Project namespace for resource isolation |
| `last_authenticated_at` | TIMESTAMPTZ, nullable | Timestamp of the most recent successful authentication |
| `created_by` | UUID (FK → `principals`) | User who created the service account |
| `updated_by` | UUID (FK → `principals`, nullable) | User who last modified the service account |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last modification timestamp |
| `deleted_at` | TIMESTAMPTZ, nullable | Soft-delete timestamp |
| `deleted_by` | UUID (FK → `users`, nullable) | User who performed the soft delete |
| `labels` | JSONB | Key-value metadata (standard across all resources) |

**Indexes:**

- `ix_service_accounts_created_at_id` — composite index for cursor-based pagination
- Individual indexes on `status`, `project_id`, `name`, `created_by`, `updated_by`, `deleted_at`, `deleted_by`

**Audit level:** `META` — audit events capture metadata fields only.

### `service_account_credentials` table

The `ServiceAccountCredential` model (`src/nexus/service_accounts/models/service_account_credential.py`) extends `UserOwnedResource`. Credentials are a sub-resource of service accounts, supporting multiple credentials per account.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID (PK) | Auto-generated primary key |
| `service_account_id` | UUID (FK → `service_accounts`) | Parent service account |
| `credential_type` | ENUM (`client_credentials`) | Type of credential |
| `identifier` | VARCHAR(64), UNIQUE | Public identifier (e.g., `client_id`) |
| `hashed_secret` | TEXT | Argon2id hash of the secret |
| `old_hashed_secret` | TEXT, nullable | Previous secret hash during rotation grace period |
| `old_secret_valid_until` | TIMESTAMPTZ, nullable | When the old secret stops being accepted |
| `grace_period_seconds` | INT, default 3600 (0–86400) | How long the old secret remains valid after rotation |
| `status` | ENUM (`active`, `disabled`) | Operational status |
| `expires_at` | TIMESTAMPTZ, nullable | Optional expiry timestamp |
| `last_used_at` | TIMESTAMPTZ, nullable | Timestamp of last use |
| `created_by` | UUID (FK → `principals`) | User who created the credential |
| `updated_by` | UUID (FK → `principals`, nullable) | User who last modified the credential |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last modification timestamp |
| `labels` | JSONB | Key-value metadata |

**Indexes:**

- `ix_sa_credentials_identifier_unique` — unique index on `identifier`
- `ix_sa_credentials_sa_id_type` — composite index on `(service_account_id, credential_type)`
- `ix_sa_credentials_created_at_id` — composite index for cursor-based pagination

**Audit level:** `META` — `hashed_secret` and `old_hashed_secret` are excluded from audit logs.

**Limit:** Maximum 10 credentials per service account.

### Credential types

| Type | Identifier format | Secret format | Use case |
|------|------------------|---------------|----------|
| `client_credentials` | `nx_sa_{hex16}` | `token_urlsafe(48)` (64 chars) | OAuth 2.0 client credentials grant |

### Secret hashing

Secrets are hashed with **Argon2id** using the same `hash_password` / `verify_password` utilities as user passwords (`src/nexus/auth/passwords.py`). The plaintext secret is displayed exactly once at creation time and cannot be retrieved afterward.

## CRUD API

### Service account endpoints

All endpoints live under `/api/v1/service_accounts`. Project scoping is enforced via `project_id` in the request body (create) and `VisibilityFilter` (list).

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/service_accounts` | Create a service account |
| `GET` | `/service_accounts` | List service accounts (paginated, filterable, project-scoped) |
| `GET` | `/service_accounts/{service_account_id}` | Get service account details |
| `PATCH` | `/service_accounts/{service_account_id}` | Update name and/or description |
| `DELETE` | `/service_accounts/{service_account_id}` | Soft-delete a service account |
| `POST` | `/service_accounts/{service_account_id}/enable` | Set status to `active` |
| `POST` | `/service_accounts/{service_account_id}/disable` | Set status to `disabled` |

### Credential endpoints

Credentials are nested sub-resources of service accounts. Permissions inherit from the parent service account.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/service_accounts/{sa_id}/credentials` | Create a credential (201, returns one-time secret) |
| `GET` | `/service_accounts/{sa_id}/credentials` | List credentials (paginated) |
| `GET` | `/service_accounts/{sa_id}/credentials/{cred_id}` | Get credential details |
| `DELETE` | `/service_accounts/{sa_id}/credentials/{cred_id}` | Hard-delete a credential (204) |
| `POST` | `/service_accounts/{sa_id}/credentials/{cred_id}/rotate` | Rotate secret |
| `POST` | `/service_accounts/{sa_id}/credentials/{cred_id}/disable` | Disable credential |
| `POST` | `/service_accounts/{sa_id}/credentials/{cred_id}/enable` | Enable credential |

### Create flow

```
1. Admin creates a service account:
   POST /api/v1/service_accounts
   { "name": "CI Pipeline", "description": "...", "project_id": "..." }
   -> 201 with service account details (no credentials yet)

2. Admin creates a credential for the service account:
   POST /api/v1/service_accounts/{sa_id}/credentials
   { "credential_type": "client_credentials" }
   -> 201 with credential details + plaintext client_secret
   -> ⚠️ Secret is shown ONCE — it cannot be retrieved again
```

### One-time secret display

On creation and rotation, the plaintext secret is returned in the response body exactly once. The backend stores only the Argon2id hash. If the secret is lost, the only option is to rotate to a new one.

## Secret Rotation

### Grace period

When a credential's secret is rotated, both the old and new secrets are accepted for a configurable grace period. This prevents downtime when multiple consumers of the secret need time to update.

```
POST /api/v1/service_accounts/{sa_id}/credentials/{cred_id}/rotate
  { "grace_period_seconds": 7200 }   (optional override)

Rotation:
  -> Backend generates new secret, hashes it
  -> Backend moves current hashed_secret → old_hashed_secret
  -> Backend sets old_secret_valid_until = now() + grace_period_seconds
  -> Backend stores new hash in hashed_secret
  -> Backend returns new plaintext secret (one-time display)

Authentication during grace period (client submits a secret without indicating which one):
  1. Verify against hashed_secret (current) → if match, accept
  2. If no match, check old_hashed_secret is non-null and old_secret_valid_until > now()
  3. If yes, verify against old_hashed_secret → if match, accept
  4. Otherwise reject

After grace period expires:
  -> Step 2 fails the time check, so only the current secret is accepted
  -> Backend clears old_hashed_secret and old_secret_valid_until on next auth attempt
```

The default grace period is 3600 seconds (1 hour), configurable per credential via the `grace_period_seconds` field.

## Client Credentials Grant

> **Status:** Not yet implemented

### Token endpoint

```
POST /api/v1/auth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=nx_sa_...&client_secret=...
```

Alternatively, credentials can be provided via HTTP Basic authentication (RFC 6749 §2.3.1):

```
POST /api/v1/auth/token
Authorization: Basic base64(client_id:client_secret)
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
```

### Response

```json
{
  "access_token": "eyJ...",
  "token_type": "bearer",
  "expires_in": 900
}
```

No refresh token is issued. When the access token expires, the client requests a new one.

### Token claims

Service account access tokens include:

| Claim | Description |
|-------|-------------|
| `sub` | Service account UUID |
| `iss` | Nexus server URL (same issuer as human tokens) |
| `iat` | Issued-at timestamp |
| `exp` | Expiration timestamp |
| `token_type` | `"service_account"` (distinguishes from human tokens) |
| `client_id` | The service account's `client_id` |
| `project_id` | The service account's home project |
| `name` | Service account name |

### Rejection rules

The token endpoint rejects authentication in the following cases:

| Condition | Response |
|-----------|----------|
| Unknown `client_id` | 401 `invalid_client` |
| Secret does not match current or previous (non-expired) hash | 401 `invalid_client` |
| Service account status is `disabled` | 401 `invalid_client` |
| Service account is soft-deleted | 401 `invalid_client` |

All rejection responses use the same generic error to avoid leaking whether a `client_id` exists (enumeration protection).

## Auth Middleware Integration

> **Status:** Not yet implemented

When the auth middleware encounters a JWT with `token_type: "service_account"`, it builds a **virtual principal** for the Rego policy evaluator rather than loading a user from the database.

```
Incoming request with Bearer token
  -> Middleware decodes JWT
  -> token_type == "service_account"?
     Yes -> Build virtual principal:
            { type: "service_account", id: sub, client_id, project_id, roles: [...] }
     No  -> Normal user auth flow (existing behavior)
  -> Rego evaluator checks policies against the principal
  -> Request proceeds or is denied
```

### Disable / delete invalidation

When a service account is disabled or deleted, all tokens issued for it must be immediately rejected:

- **Disable** — subsequent requests with that service account's token are rejected by the middleware (the middleware checks the service account's status)
- **Delete** — same behavior; soft-deleted accounts are treated as disabled

This mirrors the `StaleTokenMiddleware` behavior for disabled human users (see [Disabled User Enforcement](authentication.md#disabled-user-enforcement)).

## Authorization (RBAC)

> **Status:** Not yet implemented

### PrincipalType extension

The `PrincipalType` enum (`src/nexus/authz/models/assignments.py`) will be extended with a `SERVICE_ACCOUNT` value, allowing service accounts to receive role assignments.

### Resource type registration

Service accounts will be registered as an authz resource type with the following permissions:

| Permission | Description |
|------------|-------------|
| `service_account:create` | Create a service account in a project |
| `service_account:read` | View service account details |
| `service_account:update` | Modify name, description, labels, enable/disable |
| `service_account:delete` | Soft-delete a service account |
| `service_account:rotate_secret` | Rotate the client secret |

### Project admin implicit management

Project administrators have implicit management rights over service accounts in their project — no explicit role assignment is required.

### Cross-project role delegation

A service account can receive role assignments in projects other than its owning project. The mechanism requires explicit opt-in:

1. The admin of Project A (where the service account lives) grants `service_account:read` on the service account to the admin of Project B
2. Project B's admin can now see the service account in principal selection UI
3. Project B's admin assigns project-scoped roles to the service account within Project B

Without the explicit read grant in step 1, the service account is invisible to other projects. This prevents accidental cross-project exposure while still enabling intentional delegation.

## Rate Limiting

> **Status:** Not yet implemented

The token endpoint (`POST /api/v1/auth/token`) is rate-limited per `client_id` using a sliding window counter backed by Redis.

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max requests | TBD | Maximum token requests per window |
| Window size | TBD | Sliding window duration |

Rate limits are admin-configurable via runtime settings. When the limit is exceeded, the endpoint returns `429 Too Many Requests` with a `Retry-After` header.

## Audit Events

> **Status:** Not yet implemented

All service account lifecycle and authentication events are captured in the immutable audit log, following the patterns established in [audit.md](audit.md).

| Event | Category | Severity | When |
|-------|----------|----------|------|
| `service_account.created` | RESOURCE | INFO | Service account created |
| `service_account.updated` | RESOURCE | INFO | Name, description, or labels changed |
| `service_account.enabled` | RESOURCE | WARNING | Status changed to `active` |
| `service_account.disabled` | RESOURCE | WARNING | Status changed to `disabled` |
| `service_account.deleted` | RESOURCE | WARNING | Service account soft-deleted |
| `service_account.secret_rotated` | RESOURCE | WARNING | Client secret rotated |
| `service_account.auth_success` | AUTH | INFO | Successful token issuance |
| `service_account.auth_failed` | AUTH | WARNING | Failed authentication attempt |

Auth events include `client_id` and IP address. Secret rotation events do not include any secret material.

## Implementation Status

| Component | Status |
|-----------|--------|
| ServiceAccount model + migration | Done |
| CRUD API + credential sub-resource | Done |
| Client credentials grant + token endpoint | Not started |
| PrincipalType extension + RBAC | Not started |
| Auth middleware integration | Not started |
| Secret rotation endpoint | Not started |
| Audit events | Not started |
| Rate limiting | Not started |
| Frontend UI | Not started |

## Key Files

| Path | Description |
|------|-------------|
| `src/nexus/service_accounts/models/service_account.py` | ServiceAccount SQLModel + ServiceAccountStatus enum |
| `src/nexus/service_accounts/models/service_account_credential.py` | ServiceAccountCredential SQLModel + enums |
| `src/nexus/service_accounts/schemas.py` | Service account API request/response schemas |
| `src/nexus/service_accounts/credential_schemas.py` | Credential API request/response schemas |
| `src/nexus/service_accounts/router.py` | Service account CRUD endpoints |
| `src/nexus/service_accounts/credential_router.py` | Credential CRUD endpoints (nested under service accounts) |
| `src/nexus/service_accounts/services/service_account_service.py` | Service account service layer |
| `src/nexus/service_accounts/services/credential_service.py` | Credential service layer |
| `src/nexus/service_accounts/exceptions.py` | Domain exceptions |
| `src/nexus/service_accounts/error_handlers.py` | RFC 9457 error handlers |
| `src/nexus/auth/passwords.py` | Argon2id `hash_password` / `verify_password` (shared with user passwords) |
| `src/nexus/core/database/migrations/versions/a0f042999fd8_add_service_accounts_table.py` | Initial SA migration |
| `src/nexus/core/database/migrations/versions/c7d8e9f01234_add_service_account_credentials.py` | Credential table migration + SA column removal |
