# Research: Authentication and Authorization

- **Feature**: 028-authentication-and-authorization
- **Date**: 2026-02-06

## Research Topics

### 1. OAuth2 with authlib + FastAPI

**Decision**: Use `authlib` for OAuth2 client implementation with FastAPI/Starlette integration.

**Rationale**:
- authlib provides first-class Starlette/FastAPI integration via `authlib.integrations.starlette_client`
- Supports OAuth2 authorization code flow required for AAP Gateway
- Handles state parameter, token exchange, and token refresh automatically
- Well-maintained with active development

**Alternatives Considered**:
- `python-social-auth`: Too heavy, designed for multi-provider scenarios
- `fastapi-sso`: Focused on social login providers, not custom OAuth2
- Manual httpx implementation: Would require reimplementing OAuth2 spec

**Key Implementation Notes**:
- Use `OAuth` class from `authlib.integrations.starlette_client`
- Configure client_id, client_secret, authorize_url, access_token_url from settings
- Handle `approval_prompt=auto` for seamless re-authentication

### 2. JWT with PyJWT ES256

**Decision**: Use `PyJWT[crypto]` with ES256 (ECDSA P-256) for JWT signing.

**Rationale**:
- ES256 provides strong security with smaller keys/signatures than RSA
- PyJWT with cryptography backend supports ECDSA natively
- Aligns with proposal's security requirements
- Broad ecosystem compatibility

**Alternatives Considered**:
- RS256 (RSA): Larger keys, slower signing, but wider legacy support
- HS256 (HMAC): Symmetric key, simpler but requires shared secret
- EdDSA (Ed25519): Better performance but less ecosystem compatibility

**Key Implementation Notes**:
- Load keys from mounted secrets (`/run/secrets/jwt-private-key`)
- Explicitly specify `algorithms=["ES256"]` to prevent algorithm confusion attacks
- Include `kid` header for key rotation support
- Validate `iss`, `exp`, `iat`, `type` claims

### 3. Redis Session Storage

**Decision**: Store refresh token metadata in Redis using JSON-serialized hashes with TTL.

**Rationale**:
- Redis already used in Nexus (decision-records.md confirms Redis choice)
- TTL-based automatic expiration matches refresh token lifecycle
- Supports atomic operations for token rotation

**Alternatives Considered**:
- PostgreSQL: Would require cleanup jobs for expired tokens
- In-memory: No persistence, doesn't survive restarts
- Dedicated session store (like Redis Cluster): Overkill for initial implementation
- Reuse `StreamClient`: **Not viable** - StreamClient only exposes Redis Streams operations (`XADD`, `XREAD`, `XREVRANGE`), not key-value operations (`SET`, `GET`, `SETEX`, `SCAN`) needed for session storage

**Key Implementation Notes**:
- Key pattern: `refresh_token:{jti}` with JSON metadata
- TTL: 8 hours (refresh token lifetime)
- Grace period: 30 seconds (implemented by setting TTL to 30s on rotation)
- Create a new `SessionStore` class using `redis.asyncio.Redis` directly, reusing the same `CacheSettings` configuration that `StreamClient` uses (same host, port, password, connection pool settings)

### 4. Existing Codebase Integration

**Decision**: Extend existing patterns; minimize new abstractions.

**Findings**:

| Component | Current State | Required Change |
|-----------|---------------|-----------------|
| User model | Exists with roles CREATOR/APPROVER/ADMINISTRATOR/VIEWER | Add `aap_user_id`, migrate roles to ADMIN/AUDITOR/USER |
| Auth dependencies | Stub returning hardcoded dev-user | Replace with JWT validation |
| Redis client | StreamClient exists for streams only (XADD/XREAD/XREVRANGE) | Create new `SessionStore` class for key-value operations (SET/GET/SETEX/SCAN) |
| Service pattern | Established (session + user injection) | AuthService follows same pattern |
| Router pattern | APIRouter with Depends() | Auth router follows same pattern |

**Migration Strategy**:
1. Add `aap_user_id` field to User model (nullable initially)
2. Create database migration with Alembic autogenerate
3. Create separate role migration script (one-time data migration)
4. Update UserRole enum values
5. Replace `get_current_user` stub with JWT validation

## Dependencies to Add

```toml
# pyproject.toml additions
dependencies = [
    # ... existing deps
    "authlib>=1.3.0",        # OAuth2 client
    "PyJWT[crypto]>=2.8.0",  # JWT with ECDSA support
]
```

**Note**: `redis`, `httpx`, and `cryptography` are already available (redis via existing cache, httpx for async HTTP, cryptography as transitive from authlib/PyJWT).

## Security Considerations

### Token Security Checklist
- [x] HTTPS only (enforced at infrastructure level)
- [x] HTTP-only cookies for refresh tokens
- [x] Secure + SameSite=Strict cookie flags
- [x] Short access token lifetime (15 min)
- [x] Token rotation on refresh
- [x] Reuse detection with session revocation
- [x] State parameter for CSRF protection in OAuth2 flow

### Key Management
- Keys stored as mounted secrets (Podman/OpenShift Secrets)
- Quarterly rotation recommended (90 days)
- JWKS endpoint for public key distribution
- 30-day grace period during rotation (both public keys valid, `kid`-based lookup)
- Only NEW private key mounted during rotation (old private key never needed)

## Open Technical Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Which OAuth2 library? | authlib (Starlette integration) |
| Which JWT library? | PyJWT with cryptography |
| Where to store refresh tokens? | Redis with TTL |
| How to handle key rotation? | JWKS endpoint with `kid` headers |
| How to migrate existing users? | Add `aap_user_id` field, sync on first AAP login |

## AAP Gateway OAuth2 Configuration

### Endpoint Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Authorization URL | `/o/authorize/` | OAuth2 authorization endpoint |
| Token URL | `/o/token/` | Token exchange endpoint |
| OAuth2 Scopes | `read` | Sufficient for reading user data |
| User Profile Endpoint | `/api/gateway/v1/me/` | Returns user data including `is_superuser` and `is_auditor` flags |
| Logout URL | `/logout/` | Front-channel logout endpoint |

### AAP OAuth2 Application Setup

The OAuth2 application in AAP Gateway must be configured correctly for seamless user experience.

| Field | Value | Purpose |
|-------|-------|---------|
| `name` | `Nexus` | Display name shown to users |
| `client_type` | `confidential` | Server-side app with secure secret storage |
| `authorization_grant_type` | `authorization-code` | Standard OAuth2 web application flow |
| `skip_authorization` | `true` | **Critical**: Skip approval for trusted apps |
| `redirect_uris` | Nexus callback URL | Must match exactly |
| `post_logout_redirect_uris` | Nexus login URL | Redirect after AAP logout |
| `organization` | Organization ID | AAP organization that owns this application |

**Why `skip_authorization` Matters**:
- `false` (default): User sees "Authorize this application?" screen on every login
- `true`: Authorization step skipped; user only enters AAP credentials once

### Expected User Experience by Scenario

| Scenario | AAP Session | User Experience |
|----------|-------------|-----------------|
| First login (`skip_authorization: true`) | N/A | AAP credentials only, no approval |
| First login (`skip_authorization: false`) | N/A | AAP credentials + approval screen |
| Re-login (Nexus session expired) | Active | **Silent redirect** (no prompts) |
| Re-login (Nexus session expired) | Expired | AAP credentials only, no approval |

## Logout Flow

**Decision**: Nexus performs **front-channel logout** to terminate both Nexus and AAP sessions.

### Logout Sequence

1. Nexus clears all local tokens (refresh token from Redis, HTTP-only cookie)
2. Nexus redirects user to AAP Gateway's logout endpoint (`/logout/`)
3. AAP terminates the AAP session
4. AAP redirects user back to Nexus login page (via `post_logout_redirect_uris`)

### Logout Redirect URL Format

```
https://aap-gateway.example.com/logout/?redirect_uri=https://nexus.example.com/auth/login
```

**Note**: The `redirect_uri` parameter must match a URI in the OAuth2 application's `post_logout_redirect_uris` field.

### Graceful Degradation

| Scenario | Nexus Behavior |
|----------|----------------|
| AAP Gateway available | Redirect to AAP logout → AAP redirects back to Nexus login |
| AAP Gateway unavailable | Clear local tokens, redirect to Nexus login page directly |

## Session and Token Edge Cases

**Principle**: Changes made in AAP Gateway do not immediately affect active Nexus sessions. Sessions remain valid until the refresh token expires (8 hours maximum).

| Scenario | Behavior | Rationale |
|----------|----------|-----------|
| User deleted in AAP | Access continues until refresh token expires (up to 8 hrs) | Stateless access tokens cannot be invalidated |
| User type changed in AAP | Change takes effect on user's next login | User type stored in access token claims |
| Password changed in AAP | Nexus session continues until refresh token expires | Nexus doesn't store passwords |
| User permissions in AAP | Not applicable | Nexus uses own RBAC (USER/AUDITOR/ADMIN) |
| Emergency revocation | Use "panic button" to revoke all sessions immediately | Manual intervention for security incidents |
| Per-user revocation needed | Admin can revoke specific user's sessions via Nexus API | Immediate revocation when required |

**Maximum Delay for AAP Changes**: 8 hours (refresh token lifetime) + 15 minutes (access token lifetime) = **8 hours 15 minutes worst case**.

## HTTPS and Origin Verification

### CORS Configuration

| Environment | Configuration | Rationale |
|-------------|---------------|-----------|
| Production | Same-origin only (SPA served from same domain as API) | Most secure |
| Development | Allowlist from `.env` file with prefix matching | Flexibility for local development |

### TLS Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Minimum version | **TLS 1.2** | Broad compatibility; prevents weak TLS |
| Default version | **TLS 1.3** | Preferred for new connections |
| Enforcement | Reject connections < 1.2 | Protect against downgrade attacks |

### Certificate Validation

- **Standard CA validation** (no certificate pinning)
- Trust system CA bundle
- Certificate pinning adds operational complexity without significant security benefit in this context

## Threat Mitigation Matrix

| Attack | Covered | Mitigation | Status |
|--------|:-------:|------------|--------|
| **Session Hijacking** | Yes | Short-lived access tokens (15 min); HTTPS only; secure cookie flags | Defined |
| **XSS Token Theft** | Yes | Refresh tokens in HTTP-only cookies; access tokens in memory only | Defined |
| **CSRF** | Yes | State parameter validation; SameSite=Strict cookies | Defined |
| **Token Replay** | Yes | Access token expiration (15 min); refresh token rotation with `jti` tracking | Defined |
| **Refresh Token Theft** | Yes | Token rotation; reuse detection (revoke all on reuse); HTTP-only cookies | Defined |
| **Man-in-the-Middle** | Yes | HTTPS/TLS enforced for all endpoints | Defined |
| **Privilege Escalation** | Yes | RBAC enforcement; role synced from AAP during login | Defined |
| **Token Forgery** | Yes | Cryptographic signature validation (ES256); explicit algorithm specification | Defined |
| **Stale Permissions** | Yes | Role synced on next login; 8h 15m max delay; manual revocation available | Defined |
| **CORS Misconfiguration** | Yes | Same-origin only (production); allowlist (development) | Defined |
| **Open Redirect** | Yes | Prefix matching validation against registered URIs | Defined |
| **TLS Downgrade** | Yes | TLS 1.2 minimum enforced; TLS 1.3 default | Defined |
| **Brute Force** | No | Rate limiting configured by Installer team at Ingress layer | Installer team |
| **Credential Stuffing** | No | AAP Gateway responsibility | AAP responsibility |

## Authorization Layer Architecture

### Deny-by-Default Pattern

**Security Principle**: Deny by default, allow explicitly. New routes are automatically protected unless explicitly marked as public.

### AllowList (Public Endpoints)

```python
PUBLIC_ENDPOINTS: list[str] = [
    "/health",                     # Health check for load balancers
    "/ready",                      # Readiness probe for Kubernetes
    "/auth/login",                 # Initiate OAuth2 flow
    "/auth/callback",              # OAuth2 callback (before user is authenticated)
    "/auth/.well-known/jwks.json", # Public keys for JWT verification
    "/openapi.json",               # OpenAPI schema (optional)
    "/docs",                       # Swagger UI (development only)
]
```

### Dependency Injection Levels

| Level | Use Case | How |
|-------|----------|-----|
| **Route** | Specific permission for one endpoint | `dependencies=[Depends(PermissionChecker(...))]` on route decorator |
| **Router** | Shared auth for all routes in a router | `APIRouter(dependencies=[Depends(get_current_user)])` |
| **Application** | Global authentication for all routes | `FastAPI(dependencies=[Depends(get_current_user)])` |

## Token Transport Security

Refresh tokens are transported via **HTTP-only cookies** (not request/response body) to prevent XSS token theft.

| Endpoint | Refresh Token Handling | Access Token Handling |
|----------|------------------------|----------------------|
| `GET /auth/callback` | **Response**: `Set-Cookie` with `HttpOnly; Secure; SameSite=Strict` | **Response**: JSON body |
| `POST /auth/refresh` | **Request**: Automatically sent via cookie | **Response**: JSON body |
| `POST /auth/logout` | **Response**: Clear cookie via expired `Set-Cookie` | N/A (client discards) |
| `GET /auth/me` | **Request**: Automatically sent via cookie | **Request**: `Authorization: Bearer` header |

## JWT Signing Key Management

### Key Requirements

- **Key Type**: ECDSA P-256 (secp256r1, prime256v1) key pair
- **Security Strength**: 256-bit ECDSA provides approximately 128-bit equivalent security
- **Storage**: Files mounted from Podman Secrets or OpenShift Secrets at `/run/secrets/`

### Key Rotation Strategy

| Aspect | Specification |
|--------|---------------|
| **Rotation Frequency** | Quarterly (90 days) recommended, minimum annually |
| **Grace Period** | 30 days where both old and new keys are valid |
| **Process** | 1. Generate new key pair → 2. Mount new private key + both public keys → 3. Add new public key to JWKS → 4. Sign new tokens with new key → 5. Wait grace period → 6. Remove old public key |

### Key Rotation: `kid`-Based Validation

Token validation uses the `kid` (Key ID) header from the JWT to look up the correct public key — no trial-and-error. During rotation, both the old and new public keys are available in an in-memory key registry.

**What to mount during rotation:**

| Secret | Purpose | When to remove |
|--------|---------|----------------|
| New private key | Sign all new tokens | Next rotation |
| New public key | Validate new tokens | Next rotation |
| Old public key | Validate old tokens during grace | After 30 days |

**What NOT to mount:** The old private key. It is never needed — Nexus only signs with the new key. Keeping it out of the container reduces attack surface.

**Validation flow:**

```
1. Read `kid` from JWT header
2. Look up public key by `kid` from in-memory key registry
3. If `kid` not found → reject (unknown signing key)
4. Validate signature with matched public key
```

**Container secret layout during rotation:**

```
/run/secrets/jwt-signing-private-key    # NEW private key (signing only)
/run/secrets/jwt-signing-key-id         # NEW kid (e.g., "2026-Q2-nexus")
/run/secrets/jwt-signing-public-key     # NEW public key (validation)
/run/secrets/jwt-previous-public-key    # OLD public key (validation only)
/run/secrets/jwt-previous-key-id        # OLD kid (e.g., "2026-Q1-nexus")
```

After the 30-day grace period, remove `jwt-previous-public-key` and `jwt-previous-key-id`.

**Note on grace period relevance:** With the current 8-hour refresh token lifetime, all tokens signed with the old key expire naturally within the first 8 hours of rotation. The 30-day grace period is primarily relevant when the refresh token lifetime is configured to a longer period (e.g., 5-30 days), and also provides safety margin for multi-instance rollouts and external JWKS consumers.

### JWKS Endpoint Format

**Endpoint**: `GET /auth/.well-known/jwks.json`

During rotation, the JWKS endpoint serves both the new and old public keys:

```json
{
  "keys": [
    {
      "kid": "2026-Q2-nexus",
      "kty": "EC",
      "use": "sig",
      "alg": "ES256",
      "crv": "P-256",
      "x": "WKn-ZIGevcwGIyyrzFoZNBdaq9_TsqzGl96oc0CWuis",
      "y": "y77t-RvAHRKTsSGdIYUfweuOvwrvDD-Q3Hv5J0fSKbE"
    },
    {
      "kid": "2026-Q1-nexus",
      "kty": "EC",
      "use": "sig",
      "alg": "ES256",
      "crv": "P-256",
      "x": "SVqB4JcUD6lsfvqMr-OKUNUphdNn64Eay60978ZlL74",
      "y": "lf0u0pMj4lGAzZix5u4Cm5CMQIgMNpkwy163wtKYVKI"
    }
  ]
}
```

Outside of rotation (steady state), only the active key is present.

### Key Generation

```bash
# Generate P-256 (secp256r1) private key
openssl ecparam -name prime256v1 -genkey -noout -out private.pem

# Extract public key
openssl ec -in private.pem -pubout -out public.pem
```

## HTTP Security Headers

All Nexus API responses must include these headers per OWASP Secure Headers Project:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` | Enforce HTTPS for 1 year |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME-type sniffing |
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none'` | Restrict resource loading |
| `X-Permitted-Cross-Domain-Policies` | `none` | Disable cross-domain policy files |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Control referrer leakage |

### CORS Headers

| Header | Value | Purpose |
|--------|-------|---------|
| `Access-Control-Allow-Origin` | Explicit allowlist | Restrict which origins can access API |
| `Access-Control-Allow-Credentials` | `true` | Required for cookie-based auth |
| `Access-Control-Allow-Methods` | `GET, POST, PUT, DELETE, OPTIONS` | Permitted HTTP methods |
| `Access-Control-Max-Age` | `86400` | Cache preflight for 24 hours |

## Future: OIDC Support (AAP 2.7)

AAP 2.7 will provide full OIDC support, reducing API calls per login from 3+ to 1:

| Aspect | OAuth2 (AAP 2.6) | OIDC (AAP 2.7) |
|--------|------------------|----------------|
| API calls per login | 3+ (OAuth2 + Gateway API) | 1 (OIDC flow only) |
| User data source | Gateway REST API | ID Token claims |
| Login latency | Higher | Lower |
| Standardization | Custom integration | Industry standard |

### PKCE (Required for OIDC)

PKCE protects public clients (SPAs) from authorization code interception by binding the authorization request to the token exchange via a cryptographic code verifier

## RFC 9457 and Auth Error Handling

### RFC 9457 Overview

[RFC 9457](https://datatracker.ietf.org/doc/rfc9457/) (Problem Details for HTTP APIs) defines a standard JSON format for error responses. It obsoletes RFC 7807. The format provides machine-readable error context beyond what HTTP status codes convey:

```json
{
  "type": "https://example.com/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "Permission denied: admin role required",
  "instance": "/api/v1/admin/sessions"
}
```

The RFC itself uses a **403 Forbidden** as its primary example, demonstrating that auth errors are a first-class use case for Problem Details.

Key principle: APIs should define **custom problem type URIs** for domain-specific errors rather than relying on generic status codes alone. Generic problems (applicable to any resource) may use `about:blank` as the type, but auth errors benefit from specific types to help clients distinguish between "no credentials provided", "token expired", "wrong role", and "not the resource owner".

### Current Nexus Implementation

The codebase already has RFC 9457 error handling (commit `38f40ab7`, PR #333). Key components:

| Component | Location | Purpose |
|-----------|----------|---------|
| `ErrorData` model | `src/nexus/core/models/base/error.py` | RFC 9457 response schema |
| `http_exception_handler` | `src/nexus/core/error_handlers.py` | Global RFC 9457 handler |
| `create_problem_details_response` | `src/nexus/core/error_handlers.py` | Helper for domain handlers |
| `@fastapi_exception` decorator | `src/nexus/core/exception_registry.py` | Auto-registration for domain exceptions |
| Domain handlers | `src/nexus/{domain}/error_handlers.py` | Per-domain exception handling |

### Known Issue: HTTPException Handler Override (PRE-001)

A decorator-based HTTPException handler in `src/nexus/api/main.py` (lines 204-222) **overrides** the RFC 9457 handler registered at line 139. In FastAPI, `@app.exception_handler()` decorators take precedence over `app.add_exception_handler()` calls.

**Impact**: All `HTTPException` responses (including 401/403 from security dependencies) bypass RFC 9457 and return plain JSON:

```json
// Current (broken)
{"detail": "Not authenticated"}

// Expected (RFC 9457)
{
  "type": "https://api.nexus.com/errors/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Authentication required",
  "code": "HTTP_401",
  "retryable": false
}
```

This must be fixed before the auth implementation (see PRE-001 in spec.md).

### Current 401/403 Mapping Problem

The RFC 9457 handler maps both 401 and 403 to the generic `validation_error` problem type:

```python
status_mapping = {
    401: ("validation_error", "Unauthorized"),
    403: ("validation_error", "Forbidden"),
}
```

Auth errors are not validation errors. The auth implementation must register auth-specific problem types (`unauthorized`, `forbidden`, `token-expired`, `resource-ownership`) following the existing domain exception pattern.

### FastAPI Security and Exception Handling

FastAPI's built-in security utilities (`HTTPBearer`, `OAuth2PasswordBearer`) raise `HTTPException(status_code=401)` directly. These exceptions go through the global exception handler registry, so a correctly registered RFC 9457 handler **will** intercept them.

The auth implementation should raise **custom domain exceptions** (e.g., `AuthenticationRequiredError`, `InsufficientRoleError`) instead of raw `HTTPException` to ensure they go through the auth-specific error handler and produce proper problem type URIs.

### References

- [RFC 9457 - Problem Details for HTTP APIs](https://datatracker.ietf.org/doc/rfc9457/)
- [RFC 9457: Better information for bad situations (Redocly)](https://redocly.com/blog/problem-details-9457)
- [Understanding RFC 9457 (Medium)](https://medium.com/@mhd.umair/understanding-rfc-9457-problem-details-for-http-apis-6bdb675e685f)
