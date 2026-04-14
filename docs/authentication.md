# Authentication

This document describes how authentication works in Nexus. It is intended for developers working on the project and will be updated as the auth system evolves.

## Overview

Nexus supports two authentication methods:

- **Local authentication** — username/password with JWT tokens
- **Federated authentication** — OIDC (OpenID Connect) via external identity providers (Azure AD, Google, Okta, AAP, etc.)

Both methods produce the same JWT access/refresh token pair. Passwords are hashed with Argon2id.

## Token Lifecycle

### Login (`POST /api/v1/auth/login`)

1. Client sends `{ "username": "...", "password": "..." }`.
2. The username is normalized to lowercase before lookup.
3. Server verifies credentials against the `users` table (`password_hash` column, Argon2id).
4. On success the server returns an access token in the response body and sets the `ao_refresh_token` HttpOnly cookie.

### Refresh (`POST /api/v1/auth/refresh`)

1. The refresh token is read automatically from the `ao_refresh_token` cookie.
2. The server validates the token signature and checks that the session exists in Redis.
3. A new access token is issued with fresh claims from the database — including current group memberships and the latest `token_ver` from Redis. The `amr` and `idp` values are preserved from the session metadata (set during login).
4. The refresh token itself is **not rotated** — this is intentional. The fixed expiration acts as a hard session boundary, forcing re-authentication with the identity provider so that group memberships are refreshed on a predictable cadence.

### Logout (`POST /api/v1/auth/logout`)

1. The refresh token session is revoked in Redis.
2. The `ao_refresh_token` cookie is cleared.
3. The access token remains valid until it naturally expires (stateless JWT — no server-side revocation).

### Current User (`GET /api/v1/auth/me`)

Returns the authenticated user's information from the access token claims (no database round-trip). Includes `id`, `username`, `email`, `role`, and `groups`.

## Token Details

| Property | Access Token | Refresh Token |
|---|---|---|
| Algorithm | ES256 | ES256 |
| Default lifetime | 15 minutes | 8 hours |
| Transport | `Authorization: Bearer <token>` | `ao_refresh_token` HttpOnly cookie |
| Contains | `sub`, `iss`, `iat`, `exp`, `name`, `preferred_username`, `email`, `role`, `groups`, `token_ver`, `amr`, `idp` | `sub`, `iss`, `iat`, `exp`, `jti` |
| Server-side state | None (stateless) | Session stored in Redis (keyed by `jti`) |

## Session Storage

Refresh token sessions are stored in Redis with the key pattern `refresh_token:<jti>`. Each session records:

- `user_id` — UUID of the authenticated user
- `issued_at` — when the session was created
- `device` — User-Agent string
- `ip_address` — client IP
- `amr` — authentication method references (e.g., `["pwd"]` for local, `["fed"]` for OIDC)
- `idp` — identity provider name (e.g., `"local"`, `"Azure"`)

Sessions are automatically expired by Redis TTL matching the refresh token lifetime.

### Redis Availability

Redis is a **hard dependency** for the session layer, not an optional cache. If Redis is unavailable:

| Flow | Impact |
|------|--------|
| **Login** | Fails — session cannot be created (database changes are rolled back) |
| **Token refresh** | Fails — session cannot be validated → 401 |
| **Logout** | Fails — session cannot be revoked (cookie is still cleared) |
| **OIDC authorize** | Fails — state/nonce/PKCE cannot be stored |
| **OIDC callback** | Fails — state cannot be retrieved |
| **Access token validation** | **Unaffected** — stateless JWT verified locally |

Existing access tokens continue to work until they expire (default 15 minutes), but no new sessions can be created, refreshed, or revoked. This is by design — sessions should fail explicitly rather than silently degrade.

### Token Version (Stale Token Detection)

When an admin changes a user's account (group memberships, profile, role, etc.), the user's access token becomes stale — its claims no longer reflect reality. Rather than forcing a logout, Nexus uses a lightweight version counter to trigger a seamless background token refresh.

#### Mechanism

Each user has a `token_version` counter in Redis (key: `user_token_version:<user_id>`). The counter is included in the access token as the `token_ver` claim.

```
Admin changes user's account (groups, profile, etc.)
  -> Redis: INCR user_token_version:<user_id>
  -> User's next API request:
       StaleTokenMiddleware compares token's token_ver vs Redis version
       Token is stale → response includes X-Token-Stale: true header
  -> Frontend detects header → triggers background POST /auth/refresh
  -> New access token has updated claims + current token_ver
  -> UI reflects correct state without logout
```

#### What triggers a version bump

| Endpoint | Action |
|----------|--------|
| `POST /groups/{id}/members` | User added to group |
| `DELETE /groups/{id}/members/{user_id}` | User removed from group |
| `PUT /users/{id}/groups` | User's group memberships replaced |
| `PATCH /users/{id}` | User profile updated (name, email, active status, password) |
| `DELETE /users/{id}` | User soft-deleted (next refresh fails → auto-logout) |

#### Backend components

- **`SessionStore.increment_token_version(user_id)`** — called after any admin action that changes a user's account. Uses Redis `INCR` with TTL matching the refresh token lifetime.
- **`SessionStore.get_token_version(user_id)`** — called during login and refresh to embed the current version in the new access token's `token_ver` claim. Returns `0` if no key exists (no changes have occurred).
- **`StaleTokenMiddleware`** — Starlette middleware registered in `main.py`. On every authenticated request, it decodes `sub` and `token_ver` from the token (lightweight, no signature verification — the auth dependency already validated it), fetches the Redis version, and sets `X-Token-Stale: true` if the token is outdated. Errors are swallowed to avoid blocking requests.
- **CORS `expose_headers`** — `X-Token-Stale` is added to the CORS `expose_headers` list so the browser allows the frontend to read it.

#### Frontend handling

The `authMiddleware` in `client.tsx` checks every response for the `X-Token-Stale: true` header. When detected, it fires a background `store.refresh()` call (fire-and-forget). The current response is returned normally — the user is never blocked. After the refresh completes, subsequent requests use the new token with updated claims.

## Key Management

JWT signing uses ES256 with keys provided via:

1. **File path** — `APP_JWT_PRIVATE_KEY_PATH` (e.g., `/run/secrets/jwt-primary.pem`)
2. **Base64 env var** — `APP_JWT_PRIVATE_KEY_BASE64` (alternative for environments without file mounts)

For local development, `make secrets-generate` creates both key pairs, an admin password file, and a database encryption key in `.secrets/`.

### Key Rotation

The `KeyManager` and `TokenService` are cached as singletons per process for performance. Rotating a signing key requires two steps:

1. **Deploy the new key alongside the old one** — set `APP_JWT_PRIVATE_KEY_PATH` to the new key and add the old key to `APP_JWT_BACKUP_KEYS`. Backup keys are used for **verification only** (they never sign new tokens), so existing tokens remain valid during the transition.

    ```
    APP_JWT_BACKUP_KEYS='[{"key_id":"nexus-old-key","key_path":"/run/secrets/jwt-old.pem"}]'
    ```

2. **Restart all app processes** — the singleton caches are cleared on restart, causing the new key to be loaded. In Kubernetes this is a rolling restart (`kubectl rollout restart`); with systemd it's a service restart.

Both caches expose `clear_*` functions for programmatic invalidation without a full restart:

```python
from nexus.auth.services.token_service import clear_key_manager_cache
from nexus.auth.dependencies import clear_token_service_cache

# Clear both caches — new keys will be loaded on the next request
clear_key_manager_cache()
clear_token_service_cache()
```

These can be wired to a signal handler, an admin endpoint, or a Redis pub/sub listener depending on operational requirements. The simplest production approach is a rolling restart.

### Emergency Key Compromise

Choose a response based on the severity of the compromise:

#### Option A: Immediate revocation (active exploitation suspected)

If the key is being actively exploited, revoke it immediately to stop the attacker from minting new tokens. In-flight tokens signed with the compromised key will fail and users will need to re-authenticate.

1. Generate a new key pair
2. Set `APP_JWT_PRIVATE_KEY_PATH` to the new key — do **not** add the compromised key to `APP_JWT_BACKUP_KEYS`
3. Perform a rolling restart of all app processes
4. All tokens signed with the old key are immediately rejected

#### Option B: Graceful rotation (compromise detected, not actively exploited)

If the compromise is detected but not actively exploited (e.g., a key was accidentally committed to a repo), a graceful rotation avoids disrupting active user sessions.

1. Generate a new key pair
2. Move the compromised key to `APP_JWT_BACKUP_KEYS` (so in-flight tokens can still be verified during the transition)
3. Set `APP_JWT_PRIVATE_KEY_PATH` to the new key
4. Perform a rolling restart of all app processes
5. Once all processes are restarted, remove the compromised key from `APP_JWT_BACKUP_KEYS` and restart again — tokens signed with the old key will be rejected

> **Trade-off**: Option B keeps the compromised key valid for verification during step 4–5. An attacker who exfiltrated the key could mint JWTs during this window. Use Option A if there is any doubt about active exploitation.

## Bootstrap Admin User

On first application startup, an `admin` user is seeded with the password from `APP_ADMIN_PASSWORD_PATH`. This happens in the application lifespan handler via `authz/seed.py`, which reads the password file, hashes it with Argon2id, and creates the user if it doesn't already exist.

If the password file is not configured or missing, the application still starts but logs a warning — the admin user will be created without a password (unable to log in locally).

> **Recommended**: Run `make secrets-generate` before first startup to create the password file.

### Providing a custom admin password

If the `APP_ADMIN_PASSWORD` environment variable is set when `make secrets-generate` (or `make secrets-generate-force`) runs, the script will write that value into `.secrets/admin-password` instead of generating a random one. This lets you control the admin password at deploy time without editing any files.

Set the variable **before** secrets are generated:

```bash
export APP_ADMIN_PASSWORD="my-secure-password"
make secrets-generate-force   # writes the value to .secrets/admin-password
make run-all                  # app startup seeds the admin user with this password
```

If `APP_ADMIN_PASSWORD` is not set, `generate_secrets.sh` creates a random 24-byte base64 password saved to `.secrets/admin-password`:

```bash
cat .secrets/admin-password
```

> **Important**: The admin password is hashed on first creation. If the database already has an `admin` user with a password set, the seed will not overwrite it. To change the password, use the `PATCH /users/{id}` endpoint or reset the database.

## Identity Providers (OIDC)

Nexus supports external identity providers for federated authentication via OpenID Connect.

### OIDC Login Flow

```
User clicks "Log in with Azure"
  -> Frontend redirects to: GET /api/v1/auth/oidc/authorize?provider_id=X
  -> Backend generates auth URL with state/nonce/PKCE, stores in Redis
  -> Backend 302 redirects to provider's authorization endpoint
  -> User authenticates at the provider
  -> Provider redirects to: GET /api/v1/auth/oidc/callback?code=X&state=Y
  -> Backend exchanges code for tokens, validates ID token
  -> Backend creates/maps local user by email, creates JWT + refresh token
  -> Backend sets refresh cookie, redirects to frontend
  -> Frontend's bootstrap refresh succeeds -> user is logged in
```

### Public Endpoints

| Method | Path | Description |
|---|---|---|
| `GET /api/v1/auth/providers` | List enabled identity providers for the login page (no auth required) |
| `GET /api/v1/auth/oidc/authorize` | Initiate OIDC login (redirects to provider) |
| `GET /api/v1/auth/oidc/callback` | Handle OIDC callback (exchanges code, creates session) |

### Identity Provider Management

All management endpoints require authentication and are under `/api/v1/identity_providers`:

| Method | Path | Description |
|---|---|---|
| `GET /` | List providers | Paginated list with filtering by name and status |
| `POST /` | Create provider | Register a new identity provider (201) |
| `GET /{provider_id}` | Get provider | Retrieve provider details (secrets excluded) |
| `PATCH /{provider_id}` | Update provider | Partially update (client_secret optional — preserves existing) |
| `DELETE /{provider_id}` | Delete provider | Soft delete a provider (204) |
| `POST /test` | Test connection | Test OIDC discovery without saving |

### OIDC Configuration

When creating an OIDC identity provider, the configuration object includes:

| Field | Required | Description |
|---|---|---|
| `provider_type` | Yes | Must be `"oidc"` |
| `issuer_url` | Yes | OIDC issuer URL (e.g., `https://accounts.google.com`) |
| `client_id` | Yes | OAuth 2.0 client ID |
| `client_secret` | Yes (create) | OAuth 2.0 client secret (excluded from responses, optional on patch) |
| `redirect_uri` | Yes | OAuth 2.0 redirect URI (must match provider registration) |
| `auto_discovery` | No | Use `.well-known` auto-discovery (default: `true`) |
| `scopes` | No | Space-separated scopes (default: `"openid profile email"`) |

#### Manual Endpoints (when auto_discovery is disabled)

| Field | Required | Description |
|---|---|---|
| `authorization_endpoint` | Yes | URL where users are redirected to authenticate |
| `token_endpoint` | Yes | URL where authorization codes are exchanged for tokens |
| `jwks_uri` | Yes | URL to fetch public keys for token signature verification |
| `userinfo_endpoint` | No | URL to fetch additional user claims |

### PKCE

PKCE (Proof Key for Code Exchange) is always used for all OIDC flows, following OAuth 2.1 best practices. The backend generates a `code_verifier` and `code_challenge` (S256) for each login attempt. No provider-side configuration is needed — all major OIDC providers support PKCE.

### User Auto-Provisioning

When a user authenticates via OIDC for the first time:

1. The backend looks up the identity by `(issuer, sub)` — if found, the linked user is logged in
2. If no identity exists, a new user is auto-created with:
   - `username` from `preferred_username` claim (or email prefix, with hash suffix on collision), normalized to lowercase
   - `email` from the `email` claim (must contain `@`; duplicate emails are allowed), normalized to lowercase
   - `full_name` from the `name` claim
   - `role` = `VIEWER` (default for auto-provisioned users)
   - `password_hash` = `null` (federated-only user, cannot use local login)
3. A `UserIdentity` record is created linking the `(issuer, sub)` to the new user
4. Inactive users (`is_active = false`) are rejected

### Self-Service Identity Linking

Authenticated users can link additional OIDC identities to their account from the **User Detail > Identities** tab:

```
User clicks "Connect" on an unlinked provider
  -> Browser navigates to: GET /api/v1/auth/oidc/authorize?provider_id=X&flow=link&redirect_to=...
  -> Backend verifies the user's session via ao_refresh_token cookie
  -> Backend stores flow_type="link" and user_id in Redis state
  -> OIDC flow proceeds normally (redirect to provider, callback)
  -> On callback, backend creates a UserIdentity for the authenticated user
  -> No new session is created (user is already logged in)
  -> Backend redirects back to the identities page
```

If the identity `(issuer, sub)` is already linked to another account, the flow returns a `link_error` and the UI displays a notification.

### Identity Lifecycle

- **last_used_at** — updated on each OIDC login and on initial link, tracked per identity
- **Disconnect** — users can disconnect their own identities (unless it's their only sign-in method and they have no password)
- **Attach/Detach** — admins can manually move identities between users via the Attach Identity modal
- **Provider deletion** — deleting an identity provider removes all linked user identities and revokes active sessions authenticated via that provider

### Token Claims for Federated Users

Access tokens for OIDC-authenticated users include:

- `amr` = `["fed"]` — authentication method reference (federated)
- `idp` = provider name (e.g., `"Azure"`, `"Okta"`)
- `role` = user's role from the database

These values are preserved across token refreshes via session metadata stored in Redis.

### Test Connection

The `POST /test` endpoint accepts a full provider creation payload and fetches `{issuer_url}/.well-known/openid-configuration` to verify the OIDC provider is reachable and returns the required fields (`authorization_endpoint`, `token_endpoint`, `issuer`, `jwks_uri`). No data is persisted.

## Configuration Reference

| Environment Variable | Default | Description |
|---|---|---|
| `APP_JWT_PRIVATE_KEY_PATH` | — | Path to ES256 private key PEM file |
| `APP_JWT_PRIVATE_KEY_BASE64` | — | Base64-encoded ES256 private key PEM |
| `APP_JWT_KEY_ID` | `nexus-primary` | Key ID (`kid`) in JWT header |
| `APP_JWT_ACCESS_TOKEN_LIFETIME_MINUTES` | `15` | Access token lifetime |
| `APP_JWT_REFRESH_TOKEN_LIFETIME_HOURS` | `8` | Refresh token lifetime |
| `APP_JWT_BACKUP_KEYS` | — | JSON list of backup keys for rotation |
| `APP_ADMIN_PASSWORD_PATH` | — | Path to file containing bootstrap admin password (migration skips seeding if unset; can also use `uv run python tools/set_admin_password.py`) |
| `APP_ADMIN_PASSWORD` | — | Admin password value (used by `generate_secrets.sh` only) |
| `APP_SERVER_SCHEME` | `https` | URL scheme used in JWT issuer claim (`https` for production, `http` for local dev). Also controls the `Secure` flag on the refresh cookie (HTTPS → `Secure=true`, HTTP → `Secure=false`) |
| `APP_COOKIE_DOMAIN` | — | `Domain` attribute for refresh cookie |
| `APP_CORS_ALLOW_ORIGINS` | `[]` | Allowed origins for CORS and OIDC redirect validation. Wildcard `*` is rejected when credentials are enabled |
| `APP_CORS_ALLOW_CREDENTIALS` | `true` | Allow credentials (cookies) in CORS requests |
| `APP_CORS_ALLOW_METHODS` | `["GET","POST","PUT","PATCH","DELETE","OPTIONS"]` | Allowed HTTP methods for CORS |
| `APP_CORS_ALLOW_HEADERS` | `["Authorization","Content-Type","Accept"]` | Allowed headers for CORS |
| `APP_OIDC_ALLOW_PRIVATE_NETWORKS` | `false` | Allow OIDC providers on private/internal networks. Enable for environments with internal IdPs (e.g., corporate Keycloak). When disabled, issuer URLs resolving to private/loopback IPs are rejected |
| `APP_DB_ENCRYPTION_KEY_PATH` | — | Path to file containing Fernet encryption key (preferred; auto-loads into `db_encryption_key`) |
| `APP_DB_ENCRYPTION_KEY` | — | Fernet key value directly (use `_PATH` variant to avoid process-list exposure). Encrypt/decrypt operations fail without a key configured |

> **Tip**: Copy `.env.example` to `.env` for local development — it includes all auth-related settings pre-configured with paths to the generated secrets (e.g., `APP_JWT_PRIVATE_KEY_PATH=.secrets/jwt-primary.pem`) and `APP_SERVER_SCHEME=http` (which also disables the `Secure` cookie flag for local HTTP).
