# Quickstart: Authentication and Authorization

- **Feature**: 028-authentication-and-authorization
- **Date**: 2026-02-06

This document provides validation scenarios to verify the authentication and authorization implementation is working correctly.

## Prerequisites

- Nexus running locally (`make serve` or `uvx podman-compose up`)
- AAP Gateway accessible at configured URL
- OAuth2 application registered in AAP Gateway with:
  - `client_type`: confidential
  - `authorization_grant_type`: authorization-code
  - `skip_authorization`: true
  - `redirect_uris`: `http://localhost:8000/auth/callback`

## Scenario 1: OAuth2 Login Flow

### Steps
1. Open browser to `http://localhost:8000/auth/login`
2. Browser should redirect to AAP Gateway login page
3. Enter valid AAP credentials
4. Browser should redirect back to Nexus with session established

### Expected Outcome
- User is authenticated
- Access token returned (15-minute expiry)
- Refresh token set as HTTP-only cookie
- User record created/updated in Nexus database

### Verification
```bash
# After login, call /auth/me endpoint
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:8000/auth/me

# Expected response
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "aap-prod/john.doe",
  "email": "john.doe@example.com",
  "user_type": "USER"
}
```

## Scenario 2: Token Refresh

### Steps
1. Wait for access token to expire (or use a token near expiry)
2. Call refresh endpoint with refresh token cookie

### Expected Outcome
- New access token issued
- Refresh token rotated (new cookie set)
- Old refresh token invalid after grace period

### Verification
```bash
# Refresh endpoint (cookie sent automatically by browser)
curl -X POST -c cookies.txt -b cookies.txt \
  http://localhost:8000/auth/refresh

# Expected response
{
  "access_token": "<new_jwt>",
  "token_type": "Bearer",
  "expires_in": 900
}
```

## Scenario 3: Role-Based Authorization

### Steps
1. Login as USER role
2. Attempt to access admin-only endpoint
3. Verify 403 Forbidden response

### Expected Outcome
- USER cannot access admin endpoints
- AUDITOR cannot modify resources
- ADMIN has full access

### Verification
```bash
# As USER, try to access admin endpoint
curl -H "Authorization: Bearer <user_token>" \
  http://localhost:8000/api/v1/admin/sessions

# Expected: 403 Forbidden
{
  "type": "https://nexus.example.com/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "Permission denied: admin role required"
}
```

## Scenario 4: Resource Ownership

### Steps
1. Login as USER A, create a workflow
2. Login as USER B, attempt to modify USER A's workflow
3. Verify 403 Forbidden response

### Expected Outcome
- USER can create resources
- USER can modify own resources
- USER cannot modify others' resources
- ADMIN can modify any resource

### Verification
```bash
# As USER B, try to update USER A's workflow
curl -X PATCH -H "Authorization: Bearer <user_b_token>" \
  -H "Content-Type: application/json" \
  -d '{"description": "Updated by B"}' \
  http://localhost:8000/api/v1/workflows/<user_a_workflow_id>

# Expected: 403 Forbidden
{
  "type": "https://nexus.example.com/errors/forbidden",
  "title": "Forbidden",
  "status": 403,
  "detail": "Permission denied: you do not own this resource"
}
```

## Scenario 5: Logout

### Steps
1. Login and obtain valid session
2. Call logout endpoint
3. Verify session is terminated

### Expected Outcome
- Refresh token deleted from Redis
- HTTP-only cookie cleared
- Redirect to AAP logout (then back to Nexus login)

### Verification
```bash
# Logout
curl -X POST -c cookies.txt -b cookies.txt \
  http://localhost:8000/auth/logout

# Expected: 302 redirect to AAP logout URL

# After logout, try to use old refresh token
curl -X POST -c cookies.txt -b cookies.txt \
  http://localhost:8000/auth/refresh

# Expected: 401 Unauthorized
{
  "type": "https://nexus.example.com/errors/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Invalid or expired token"
}
```

## Scenario 6: Session Management

### Steps
1. Login from multiple devices/browsers
2. View active sessions
3. Revoke a specific session

### Expected Outcome
- User can see all their active sessions
- User can revoke individual sessions
- Revoked session cannot be used for refresh

### Verification
```bash
# List sessions
curl -H "Authorization: Bearer <access_token>" \
  http://localhost:8000/api/v1/sessions

# Expected response
{
  "resources": [
    {
      "jti": "a1b2c3d4-5678-90ab-cdef-1234567890ab",
      "issued_at": "2026-02-06T10:30:00Z",
      "device": "Mozilla/5.0...",
      "ip": "192.168.1.100",
      "expires_in": 28542
    }
  ]
}

# Revoke specific session
curl -X DELETE -H "Authorization: Bearer <access_token>" \
  http://localhost:8000/api/v1/sessions/a1b2c3d4-5678-90ab-cdef-1234567890ab

# Expected: 204 No Content
```

## Scenario 7: Admin Session Revocation

### Steps
1. As ADMIN, revoke all sessions for a specific user
2. Verify that user's sessions are invalidated

### Expected Outcome
- All user's refresh tokens deleted from Redis
- User must re-authenticate on next request

### Verification
```bash
# As ADMIN, revoke user's sessions
curl -X POST -H "Authorization: Bearer <admin_token>" \
  http://localhost:8000/api/v1/admin/users/<user_id>/revoke-tokens

# Expected response
{
  "revoked_sessions": 3,
  "user_id": "<user_id>"
}
```

## Scenario 8: Token Reuse Detection

### Steps
1. Login and obtain refresh token
2. Use refresh token to get new tokens
3. Attempt to use the OLD refresh token again

### Expected Outcome
- Within 30s grace period: Old token still works
- After 30s: Old token rejected
- Reuse outside grace period: ALL user sessions revoked

### Verification
```bash
# Use refresh token
curl -X POST -c cookies.txt -b cookies.txt \
  http://localhost:8000/auth/refresh

# Wait > 30 seconds, then try OLD refresh token
curl -X POST --cookie "refresh_token=<old_token>" \
  http://localhost:8000/auth/refresh

# Expected: 401 Unauthorized + all sessions revoked
```

## Scenario 9: Deny-by-Default Authorization

### Steps
1. Call any API endpoint without Authorization header
2. Verify 401 Unauthorized response

### Expected Outcome
- All endpoints require authentication except allowlist
- Public endpoints: `/health`, `/ready`, `/auth/login`, `/auth/callback`, `/auth/.well-known/jwks.json`

### Verification
```bash
# No auth header
curl http://localhost:8000/api/v1/workflows

# Expected: 401 Unauthorized
{
  "type": "https://nexus.example.com/errors/unauthorized",
  "title": "Unauthorized",
  "status": 401,
  "detail": "Authentication required"
}

# Public endpoints work without auth
curl http://localhost:8000/health

# Expected: 200 OK
{"status": "ok"}
```

## Scenario 10: Role Sync on Login

### Steps
1. Login as regular user (USER role)
2. In AAP, set `is_superuser=true` for user
3. Logout and login again
4. Verify role is now ADMIN

### Expected Outcome
- Role changes in AAP take effect on next login
- User's role in Nexus database is updated
- AuthEvent logged with `role_change` type

### Verification
```bash
# Check role before AAP change
curl -H "Authorization: Bearer <token>" http://localhost:8000/auth/me
# Response: "user_type": "USER"

# After re-login (AAP changed)
curl -H "Authorization: Bearer <new_token>" http://localhost:8000/auth/me
# Response: "user_type": "ADMIN"
```

## Test Matrix

| Scenario | USER | AUDITOR | ADMIN | Unauthenticated |
|----------|------|---------|-------|-----------------|
| Login | Pass | Pass | Pass | Pass (starts flow) |
| View workflows | Pass | Pass | Pass | 401 |
| Create workflow | Pass | 403 | Pass | 401 |
| Edit own workflow | Pass | 403 | Pass | 401 |
| Edit others' workflow | 403 | 403 | Pass | 401 |
| View audit logs | 403 | Pass | Pass | 401 |
| Manage sessions | Own only | 403 | All | 401 |
| Panic button | 403 | 403 | Pass | 401 |
