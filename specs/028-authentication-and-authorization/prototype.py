#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = [
#     "fastapi",
#     "uvicorn",
#     "httpx",
#     "python-multipart",
#     "PyJWT[crypto]",
#     "cryptography",
# ]
# ///
"""
OAuth2 Prototype - Single file to test AAP Gateway OAuth2 integration.

This prototype validates the OAuth2 flow with AAP before full implementation.

Usage:
    ./prototype.py

    Or with uv explicitly:
    uv run prototype.py

Then open http://localhost:9050 and click "Login with AAP"
"""

import json
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from urllib.parse import urlencode

import base64
import os

import httpx
import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# =============================================================================
# CONFIGURATION - Update these after creating OAuth2 app in AAP
# =============================================================================

AAP_BASE_URL = os.environ.get("AAP_BASE_URL", "https://localhost:8000")
AAP_INSTANCE_ID = os.environ.get("AAP_INSTANCE_ID", "aap-dev")
CLIENT_ID = os.environ.get("AAP_CLIENT_ID", "REPLACE_WITH_CLIENT_ID")
CLIENT_SECRET = os.environ.get("AAP_CLIENT_SECRET", "REPLACE_WITH_CLIENT_SECRET")
REDIRECT_URI = os.environ.get("AAP_REDIRECT_URI", "http://localhost:9050/auth/callback")
SCOPES = "read"

# JWT Custom Claims Namespace (per spec - avoids collision with OIDC reserved claims)
JWT_CLAIM_PREFIX = "nexus/"

# AAP OAuth2 Endpoints
AUTHORIZATION_URL = f"{AAP_BASE_URL}/o/authorize/"
TOKEN_URL = f"{AAP_BASE_URL}/o/token/"
# AAP 2.6 uses /api/o/revoke-token/ (with hyphen, not underscore)
REVOKE_URL = f"{AAP_BASE_URL}/api/o/revoke-token/"
USER_INFO_URL = f"{AAP_BASE_URL}/api/gateway/v1/me/"

# Token cache file (simulates Redis in production)
TOKEN_CACHE_FILE = "/tmp/nexus-tokens-cache.json"

# =============================================================================
# JWT CONFIGURATION (Nexus-issued tokens)
# =============================================================================

# Token lifetimes (per spec)
ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
REFRESH_TOKEN_LIFETIME = timedelta(hours=8)

# JWT key file (in production, use secure key management)
JWT_KEY_FILE = "/tmp/nexus-jwt-key.pem"

# JWT issuer
JWT_ISSUER = "nexus"
JWT_ALGORITHM = "ES256"  # ECDSA P-256

# =============================================================================
# STATE STORAGE (in-memory for prototype)
# =============================================================================

# Store CSRF state tokens (use Redis in production)
_pending_states: dict[str, bool] = {}

# Store authenticated sessions (use JWT in production)
_sessions: dict[str, dict] = {}

# =============================================================================
# JWT KEY MANAGEMENT
# =============================================================================


def _load_or_generate_key() -> tuple[ec.EllipticCurvePrivateKey, bytes]:
    """
    Load existing ES256 private key from file, or generate a new one.

    In production, keys should be:
    - Stored securely (vault, secrets manager)
    - Rotated periodically
    - Never logged or exposed

    Returns:
        Tuple of (private_key, public_key_pem)
    """
    key_path = Path(JWT_KEY_FILE)

    if key_path.exists():
        # Load existing key
        pem_data = key_path.read_bytes()
        private_key = serialization.load_pem_private_key(pem_data, password=None)
        print(f"  🔑 Loaded existing JWT signing key from {JWT_KEY_FILE}")
    else:
        # Generate new ECDSA P-256 key
        private_key = ec.generate_private_key(ec.SECP256R1())
        pem_data = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        key_path.touch(mode=0o600)
        key_path.write_bytes(pem_data)
        print(f"  🔑 Generated new JWT signing key: {JWT_KEY_FILE}")

    # Extract public key
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )

    return private_key, public_pem


# Initialize JWT keys at module load
_jwt_private_key, _jwt_public_key_pem = _load_or_generate_key()


# =============================================================================
# JWT TOKEN FUNCTIONS
# =============================================================================


@dataclass
class NexusTokens:
    """Container for Nexus-issued JWT tokens."""

    access_token: str
    refresh_token: str
    access_token_expires_at: datetime
    refresh_token_expires_at: datetime
    token_type: str = "Bearer"


def create_access_token(user: "AuthenticatedUser") -> tuple[str, datetime]:
    """
    Create a Nexus JWT access token.

    Claims (per spec - using nexus/ namespace for custom claims):
    - sub: user UUID (using AAP ID for prototype)
    - email: email (standard OIDC claim, no namespace)
    - nexus/username: <aap-instance-id>/<username> format
    - nexus/user_type: Nexus role (ADMIN/AUDITOR/USER)
    - nexus/token_type: "access"
    - exp: expiration time
    - iss: issuer (nexus)

    Args:
        user: The authenticated user

    Returns:
        Tuple of (token_string, expiration_datetime)
    """
    now = datetime.now(timezone.utc)
    exp = now + ACCESS_TOKEN_LIFETIME

    # Username format: <aap-instance-id>/<username> (per spec - avoids identity collisions)
    prefixed_username = f"{AAP_INSTANCE_ID}/{user.username}"

    payload = {
        "sub": str(user.id),  # In production, use user UUID
        "email": user.email,  # Standard OIDC claim (no namespace)
        f"{JWT_CLAIM_PREFIX}username": prefixed_username,
        f"{JWT_CLAIM_PREFIX}user_type": user.nexus_role,
        f"{JWT_CLAIM_PREFIX}token_type": "access",
        "exp": exp,
        "iat": now,
        "iss": JWT_ISSUER,
    }

    token = jwt.encode(payload, _jwt_private_key, algorithm=JWT_ALGORITHM)
    return token, exp


def create_refresh_token(user: "AuthenticatedUser") -> tuple[str, datetime]:
    """
    Create a Nexus refresh token.

    Minimal claims (stored in Redis with metadata):
    - sub: user ID
    - jti: unique token ID for revocation tracking
    - exp: expiration time
    - iss: issuer
    - nexus/token_type: "refresh"

    Args:
        user: The authenticated user

    Returns:
        Tuple of (token_string, expiration_datetime)
    """
    now = datetime.now(timezone.utc)
    exp = now + REFRESH_TOKEN_LIFETIME

    payload = {
        "sub": str(user.id),
        "jti": secrets.token_urlsafe(16),  # Unique token ID
        "exp": exp,
        "iat": now,
        "iss": JWT_ISSUER,
        f"{JWT_CLAIM_PREFIX}token_type": "refresh",
    }

    token = jwt.encode(payload, _jwt_private_key, algorithm=JWT_ALGORITHM)
    return token, exp


def decode_token(token: str, token_type: str = "access") -> dict | None:
    """
    Decode and validate a Nexus JWT token.

    Args:
        token: The JWT token string
        token_type: Expected token type ("access" or "refresh")

    Returns:
        Decoded payload dict, or None if invalid
    """
    try:
        payload = jwt.decode(
            token,
            _jwt_public_key_pem,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
        )

        # Validate token type (using namespaced claim)
        token_type_claim = f"{JWT_CLAIM_PREFIX}token_type"
        if payload.get(token_type_claim) != token_type:
            print(f"  ⚠️ Token type mismatch: expected {token_type}, got {payload.get(token_type_claim)}")
            return None

        return payload
    except jwt.ExpiredSignatureError:
        print("  ⚠️ Token expired")
        return None
    except jwt.InvalidTokenError as e:
        print(f"  ⚠️ Invalid token: {e}")
        return None


def issue_nexus_tokens(user: "AuthenticatedUser") -> NexusTokens:
    """
    Issue Nexus JWT tokens for an authenticated user.

    This is called after successful OAuth2 authentication with AAP.

    Args:
        user: The authenticated user

    Returns:
        NexusTokens containing access and refresh tokens
    """
    access_token, access_exp = create_access_token(user)
    refresh_token, refresh_exp = create_refresh_token(user)

    return NexusTokens(
        access_token=access_token,
        refresh_token=refresh_token,
        access_token_expires_at=access_exp,
        refresh_token_expires_at=refresh_exp,
    )


# =============================================================================
# DATA MODELS
# =============================================================================


@dataclass
class AuthenticatedUser:
    """User data from AAP Gateway."""

    id: int
    username: str
    email: str
    first_name: str
    last_name: str
    is_superuser: bool
    is_platform_auditor: bool
    authenticated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    aap_url: str = ""  # Track which AAP instance was used

    @property
    def nexus_role(self) -> str:
        """Map AAP flags to Nexus role."""
        if self.is_superuser:
            return "ADMIN"
        if self.is_platform_auditor:
            return "AUDITOR"
        return "USER"


# =============================================================================
# TOKEN CACHE (simulates Redis)
# =============================================================================


class TokenCache:
    """
    File-based token cache simulating Redis behavior.

    In production, this would be replaced with Redis operations:
    - SET refresh_token:{user_id} {token_data} EX {ttl}
    - GET refresh_token:{user_id}
    - DEL refresh_token:{user_id}
    """

    def __init__(self, cache_file: str = TOKEN_CACHE_FILE):
        self.cache_file = Path(cache_file)
        self._ensure_file()

    def _ensure_file(self) -> None:
        """Create cache file if it doesn't exist."""
        if not self.cache_file.exists():
            self.cache_file.touch(mode=0o600)
            self.cache_file.write_text("{}")
            print(f"  📁 Created token cache: {self.cache_file}")

    def _read(self) -> dict:
        """Read cache from file."""
        try:
            return json.loads(self.cache_file.read_text())
        except (json.JSONDecodeError, FileNotFoundError):
            return {}

    def _write(self, data: dict) -> None:
        """Write cache to file."""
        self.cache_file.write_text(json.dumps(data, indent=2))

    def get(self, user_id: str) -> dict | None:
        """Get token data for a user (simulates Redis GET)."""
        cache = self._read()
        return cache.get(str(user_id))

    def set(
        self,
        user_id: str,
        access_token: str,
        refresh_token: str,
        username: str,
        email: str,
    ) -> None:
        """Store token data for a user (simulates Redis SET)."""
        cache = self._read()
        cache[str(user_id)] = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "username": username,
            "email": email,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self._write(cache)
        print(f"  💾 Cached token for user {username} (id={user_id})")

    def delete(self, user_id: str) -> bool:
        """Delete token data for a user (simulates Redis DEL)."""
        cache = self._read()
        if str(user_id) in cache:
            username = cache[str(user_id)].get("username", "unknown")
            del cache[str(user_id)]
            self._write(cache)
            print(f"  🗑️  Removed cached token for user {username} (id={user_id})")
            return True
        return False

    def get_all(self) -> dict:
        """Get all cached tokens (for debugging)."""
        return self._read()


# Global token cache instance
token_cache = TokenCache()


async def revoke_token_at_aap(access_token: str) -> bool:
    """
    Revoke a token at AAP using the OAuth2 revocation endpoint.

    Tries /o/revoke_token/ (standard Django OAuth Toolkit endpoint).

    Args:
        access_token: The access token to revoke

    Returns:
        True if revocation succeeded, False otherwise
    """
    try:
        async with httpx.AsyncClient(verify=False) as client:
            print(f"  🔒 Revoking token at AAP: {access_token[:20]}...")
            print(f"    → POST {REVOKE_URL}")

            response = await client.post(
                REVOKE_URL,
                data={
                    "token": access_token,
                    "token_type_hint": "access_token",
                },
                auth=(CLIENT_ID, CLIENT_SECRET),
                timeout=30.0,
            )

            print(f"    Response: HTTP {response.status_code}")
            if response.text:
                print(f"    Body: {response.text[:200]}")

            # OAuth2 spec: 200 OK means success
            if response.status_code == 200:
                print(f"  ✓ Token revoked successfully")
                return True
            else:
                print(f"  ⚠️ Revocation failed: HTTP {response.status_code}")
                return False

    except httpx.RequestError as e:
        print(f"  ⚠️ Revocation failed: {e}")
        return False


# =============================================================================
# FASTAPI APP
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup/shutdown."""
    # Clear any stale sessions on startup
    _sessions.clear()
    _pending_states.clear()

    print("\n" + "=" * 60)
    print("OAuth2 Prototype Server")
    print("=" * 60)
    print(f"\nAAP Gateway URL:  {AAP_BASE_URL}")
    print(f"AAP Instance ID:  {AAP_INSTANCE_ID}")
    print(f"Redirect URI:     {REDIRECT_URI}")
    print(f"Client ID:        {CLIENT_ID[:20]}..." if len(CLIENT_ID) > 20 else f"Client ID:        {CLIENT_ID}")
    print(f"Token Cache:      {TOKEN_CACHE_FILE}")
    print(f"JWT Claim Prefix: {JWT_CLAIM_PREFIX}")
    print(f"Started at:       {datetime.now().isoformat()}")

    if CLIENT_ID == "REPLACE_WITH_CLIENT_ID":
        print("\n⚠️  WARNING: Update CLIENT_ID and CLIENT_SECRET in this file!")
        print("   See usage instructions at the top of the file.\n")

    print("\n📍 Open http://localhost:9050 to start")
    print("   (Sessions cleared - you must login again)\n")
    yield
    print("\nShutting down...")


app = FastAPI(
    title="Nexus OAuth2 Prototype",
    description="Test OAuth2 flow with AAP Gateway",
    lifespan=lifespan,
)


# =============================================================================
# HTML TEMPLATES
# =============================================================================

HOME_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>Nexus OAuth2 Prototype</title>
    <style>
        body {{ font-family: system-ui, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }}
        .btn {{ background: #0066cc; color: white; padding: 12px 24px; border: none; border-radius: 4px;
                font-size: 16px; cursor: pointer; text-decoration: none; display: inline-block; }}
        .btn:hover {{ background: #0052a3; }}
        .btn-logout {{ background: #dc3545; }}
        .btn-logout:hover {{ background: #c82333; }}
        .card {{ background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; }}
        .success {{ background: #d4edda; border: 1px solid #c3e6cb; }}
        .warning {{ background: #fff3cd; border: 1px solid #ffc107; }}
        .error {{ background: #f8d7da; border: 1px solid #f5c6cb; }}
        pre {{ background: #1e1e1e; color: #d4d4d4; padding: 15px; border-radius: 4px; overflow-x: auto; }}
        .role {{ display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }}
        .role-admin {{ background: #dc3545; color: white; }}
        .role-auditor {{ background: #ffc107; color: black; }}
        .role-user {{ background: #28a745; color: white; }}
        table {{ width: 100%; border-collapse: collapse; }}
        td, th {{ padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }}
    </style>
</head>
<body>
    <h1>🔐 Nexus OAuth2 Prototype</h1>
    {content}
</body>
</html>
"""

LOGIN_CONTENT = """
    <div class="card warning">
        <p><strong>Configuration:</strong></p>
        <ul>
            <li>AAP Gateway: <code>{aap_url}</code></li>
            <li>AAP Instance ID: <code>{aap_instance_id}</code></li>
            <li>Client ID: <code>{client_id_display}</code></li>
            <li>Redirect URI: <code>{redirect_uri}</code></li>
        </ul>
    </div>

    <p>Click below to authenticate via AAP Gateway OAuth2:</p>
    <a href="/auth/login" class="btn">Login with AAP Gateway</a>

    <h3>How it works:</h3>
    <ol>
        <li>Click "Login with AAP Gateway"</li>
        <li>You'll be redirected to AAP login page</li>
        <li>After login, AAP redirects back with an authorization code</li>
        <li>This server exchanges the code for tokens</li>
        <li>User info is fetched from AAP Gateway API</li>
    </ol>
"""

AUTHENTICATED_CONTENT = """
    <div class="card success">
        <h2>✅ Authentication Successful!</h2>
        <p>Welcome, <strong>{username}</strong>!</p>
        <p><small>Authenticated via <code>{aap_url}</code> at {authenticated_at}</small></p>
    </div>
    {auto_refresh_notice}
    <h3>User Information</h3>
    <table>
        <tr><td><strong>Username (raw)</strong></td><td>{username}</td></tr>
        <tr><td><strong>Username (prefixed)</strong></td><td><code>{prefixed_username}</code></td></tr>
        <tr><td><strong>Email</strong></td><td>{email}</td></tr>
        <tr><td><strong>Full Name</strong></td><td>{full_name}</td></tr>
        <tr><td><strong>AAP ID</strong></td><td>{user_id}</td></tr>
        <tr><td><strong>AAP Instance ID</strong></td><td><code>{aap_instance_id}</code></td></tr>
        <tr><td><strong>AAP URL</strong></td><td><code>{aap_url}</code></td></tr>
        <tr><td><strong>Is Superuser</strong></td><td>{is_superuser}</td></tr>
        <tr><td><strong>Is Platform Auditor</strong></td><td>{is_auditor}</td></tr>
        <tr><td><strong>Nexus Role</strong></td><td><span class="role role-{role_class}">{nexus_role}</span></td></tr>
    </table>

    <h3>🔐 Nexus JWT Tokens</h3>
    <p><em>These are the tokens issued by Nexus after OAuth2 authentication. In production, these would be sent to the SPA client.</em></p>

    <h4>Access Token (ES256, {access_token_lifetime})</h4>
    <p><strong>Expires:</strong> {access_token_exp}</p>
    <details>
        <summary>Encoded Token (click to expand)</summary>
        <pre style="word-break: break-all; white-space: pre-wrap;">{access_token}</pre>
    </details>
    <p><strong>Decoded Payload:</strong></p>
    <pre>{access_token_decoded}</pre>

    <h4>Refresh Token (ES256, {refresh_token_lifetime})</h4>
    <p><strong>Expires:</strong> {refresh_token_exp}</p>
    <details>
        <summary>Encoded Token (click to expand)</summary>
        <pre style="word-break: break-all; white-space: pre-wrap;">{refresh_token}</pre>
    </details>
    <p><strong>Decoded Payload:</strong></p>
    <pre>{refresh_token_decoded}</pre>

    <h3>🔗 AAP OAuth2 Tokens (Ephemeral)</h3>
    <p><em>These tokens from AAP were used once to fetch user info, then discarded. Shown here for debugging only.</em></p>
    <pre>{tokens_json}</pre>

    <h3>📋 Raw User Response from AAP</h3>
    <pre>{user_json}</pre>

    <p style="margin-top: 30px;">
        <a href="/auth/logout" class="btn btn-logout">Logout (Nexus only)</a>
        <a href="/auth/logout-full" class="btn btn-logout" style="margin-left: 10px;">Logout (Nexus + AAP)</a>
        <a href="/auth/refresh" class="btn" style="margin-left: 10px;">Refresh Access Token</a>
    </p>
    <p style="margin-top: 10px;">
        <strong>Debug:</strong>
        <a href="/debug/clear-cookie" class="btn" style="margin-left: 10px; background: #6c757d;">Clear Cookie Only</a>
        <a href="/debug/clear-access-token" class="btn" style="margin-left: 10px; background: #6c757d;">Clear Access Token</a>
    </p>
"""

ERROR_CONTENT = """
    <div class="card error">
        <h2>❌ Error</h2>
        <p>{error_message}</p>
    </div>
    <pre>{error_details}</pre>
    <p><a href="/" class="btn">Try Again</a></p>
"""


# =============================================================================
# ROUTES
# =============================================================================


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    """Home page - show login or authenticated state."""
    session_id = request.cookies.get("session_id")
    auto_refreshed = False

    if session_id and session_id in _sessions:
        session = _sessions[session_id]
        user = session["user"]
        aap_tokens = session.get("aap_tokens", {})
        nexus_tokens: NexusTokens = session.get("nexus_tokens")

        # Check if access token is missing or invalid, and auto-refresh if possible
        access_decoded = decode_token(nexus_tokens.access_token, "access") if nexus_tokens and nexus_tokens.access_token else None
        if not access_decoded and nexus_tokens and nexus_tokens.refresh_token:
            # Access token invalid/missing - try to refresh using refresh token
            refresh_payload = decode_token(nexus_tokens.refresh_token, "refresh")
            if refresh_payload:
                print(f"\n🔄 Auto-refreshing access token for user {user.username}...")
                new_access_token, new_access_exp = create_access_token(user)
                session["nexus_tokens"] = NexusTokens(
                    access_token=new_access_token,
                    refresh_token=nexus_tokens.refresh_token,
                    access_token_expires_at=new_access_exp,
                    refresh_token_expires_at=nexus_tokens.refresh_token_expires_at,
                )
                nexus_tokens = session["nexus_tokens"]
                auto_refreshed = True
                print(f"  ✓ New access token issued (expires: {new_access_exp})")

        # Decode JWT tokens for display
        access_decoded = decode_token(nexus_tokens.access_token, "access") if nexus_tokens and nexus_tokens.access_token else {}
        refresh_decoded = decode_token(nexus_tokens.refresh_token, "refresh") if nexus_tokens else {}

        # Format timestamps for display
        def format_exp(payload: dict) -> str:
            if not payload or "exp" not in payload:
                return "N/A"
            exp_ts = payload["exp"]
            exp_dt = datetime.fromtimestamp(exp_ts, tz=timezone.utc)
            now = datetime.now(timezone.utc)
            remaining = exp_dt - now
            if remaining.total_seconds() < 0:
                return f"{exp_dt.isoformat()} (EXPIRED)"
            mins, secs = divmod(int(remaining.total_seconds()), 60)
            hours, mins = divmod(mins, 60)
            if hours > 0:
                return f"{exp_dt.isoformat()} ({hours}h {mins}m remaining)"
            return f"{exp_dt.isoformat()} ({mins}m {secs}s remaining)"

        auto_refresh_notice = ""
        if auto_refreshed:
            auto_refresh_notice = """
    <div class="card warning">
        <p>🔄 <strong>Access token was auto-refreshed</strong> using the refresh token.</p>
    </div>"""

        prefixed_username = f"{AAP_INSTANCE_ID}/{user.username}"
        content = AUTHENTICATED_CONTENT.format(
            username=user.username,
            prefixed_username=prefixed_username,
            email=user.email,
            full_name=f"{user.first_name} {user.last_name}".strip() or "N/A",
            user_id=user.id,
            aap_instance_id=AAP_INSTANCE_ID,
            aap_url=user.aap_url,
            authenticated_at=user.authenticated_at,
            is_superuser="✅ Yes" if user.is_superuser else "❌ No",
            is_auditor="✅ Yes" if user.is_platform_auditor else "❌ No",
            nexus_role=user.nexus_role,
            role_class=user.nexus_role.lower(),
            auto_refresh_notice=auto_refresh_notice,
            # JWT token details
            access_token_lifetime="15 minutes",
            access_token_exp=format_exp(access_decoded),
            access_token=nexus_tokens.access_token if nexus_tokens else "N/A",
            access_token_decoded=json.dumps(access_decoded, indent=2, default=str),
            refresh_token_lifetime="8 hours",
            refresh_token_exp=format_exp(refresh_decoded),
            refresh_token=nexus_tokens.refresh_token if nexus_tokens else "N/A",
            refresh_token_decoded=json.dumps(refresh_decoded, indent=2, default=str),
            # AAP OAuth2 tokens (ephemeral)
            tokens_json=json.dumps(aap_tokens, indent=2),
            user_json=json.dumps(session.get("raw_user", {}), indent=2),
        )
    else:
        client_id_display = CLIENT_ID[:20] + "..." if len(CLIENT_ID) > 20 else CLIENT_ID
        content = LOGIN_CONTENT.format(
            aap_url=AAP_BASE_URL,
            aap_instance_id=AAP_INSTANCE_ID,
            client_id_display=client_id_display,
            redirect_uri=REDIRECT_URI,
        )

    return HTMLResponse(HOME_PAGE.format(content=content))


@app.get("/auth/login")
async def login():
    """Initiate OAuth2 authorization code flow."""
    if CLIENT_ID == "REPLACE_WITH_CLIENT_ID":
        raise HTTPException(
            status_code=500,
            detail="CLIENT_ID not configured. Update the configuration in prototype.py",
        )

    # Generate CSRF state token
    state = secrets.token_urlsafe(32)
    _pending_states[state] = True

    # Build authorization URL
    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "state": state,
        "scope": SCOPES,
    }
    auth_url = f"{AUTHORIZATION_URL}?{urlencode(params)}"

    print(f"\n→ Redirecting to AAP: {auth_url[:80]}...")
    return RedirectResponse(url=auth_url)


@app.get("/auth/callback", response_class=HTMLResponse)
async def callback(
    code: Annotated[str | None, Query()] = None,
    state: Annotated[str | None, Query()] = None,
    error: Annotated[str | None, Query()] = None,
    error_description: Annotated[str | None, Query()] = None,
):
    """Handle OAuth2 callback from AAP."""
    # Handle OAuth2 errors
    if error:
        content = ERROR_CONTENT.format(
            error_message=f"OAuth2 Error: {error}",
            error_details=error_description or "No details provided",
        )
        return HTMLResponse(HOME_PAGE.format(content=content))

    # Validate required parameters
    if not code or not state:
        content = ERROR_CONTENT.format(
            error_message="Missing required parameters",
            error_details="Both 'code' and 'state' are required",
        )
        return HTMLResponse(HOME_PAGE.format(content=content))

    # Validate state (CSRF protection)
    if state not in _pending_states:
        content = ERROR_CONTENT.format(
            error_message="Invalid state parameter",
            error_details="State token not found. Possible CSRF attack or expired session.",
        )
        return HTMLResponse(HOME_PAGE.format(content=content))

    del _pending_states[state]
    print(f"\n← Received callback with code: {code[:20]}...")

    try:
        async with httpx.AsyncClient(verify=False) as client:  # verify=False for self-signed certs
            # Step 1: Exchange authorization code for tokens
            print(f"  → Exchanging code for tokens at {TOKEN_URL}")
            token_response = await client.post(
                TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": REDIRECT_URI,
                },
                auth=(CLIENT_ID, CLIENT_SECRET),
                timeout=30.0,
            )

            # AAP returns 201 Created for new tokens, 200 OK for refreshed tokens
            if token_response.status_code not in (200, 201):
                content = ERROR_CONTENT.format(
                    error_message=f"Token exchange failed (HTTP {token_response.status_code})",
                    error_details=token_response.text,
                )
                return HTMLResponse(HOME_PAGE.format(content=content))

            tokens = token_response.json()
            print(f"  ✓ Got access token: {tokens.get('access_token', '')[:20]}...")

            # Step 2: Fetch user info from AAP Gateway API
            # Try multiple endpoints - AAP versions vary
            user_info_endpoints = [
                f"{AAP_BASE_URL}/api/gateway/v1/me/",
                f"{AAP_BASE_URL}/api/v2/me/",
            ]

            raw_user = {}
            for endpoint in user_info_endpoints:
                print(f"  → Trying user info from {endpoint}")
                user_response = await client.get(
                    endpoint,
                    headers={"Authorization": f"Bearer {tokens['access_token']}"},
                    timeout=30.0,
                )
                print(f"    Response: HTTP {user_response.status_code}")

                if user_response.status_code == 200:
                    raw_user = user_response.json()
                    print(f"    Raw response: {raw_user}")
                    if raw_user.get("username") or raw_user.get("results"):
                        # If results array, it's a list endpoint
                        if "results" in raw_user and raw_user["results"]:
                            raw_user = raw_user["results"][0]
                        print(f"  ✓ Got user: {raw_user.get('username', 'unknown')}")
                        break
                else:
                    print(f"    Failed: {user_response.text[:200]}")

            if not raw_user.get("username"):
                # Log full response for debugging
                print(f"  ⚠️ No username found in response: {raw_user}")
                content = ERROR_CONTENT.format(
                    error_message="User info fetch returned empty data",
                    error_details=f"Raw response: {raw_user}\n\nTried endpoints: {user_info_endpoints}",
                )
                return HTMLResponse(HOME_PAGE.format(content=content))

            # Step 3: Map to AuthenticatedUser
            user = AuthenticatedUser(
                id=raw_user.get("id", 0),
                username=raw_user.get("username", ""),
                email=raw_user.get("email", ""),
                first_name=raw_user.get("first_name", ""),
                last_name=raw_user.get("last_name", ""),
                is_superuser=raw_user.get("is_superuser", False),
                is_platform_auditor=raw_user.get("is_platform_auditor", False),
                aap_url=AAP_BASE_URL,
            )

            # Step 4: Check for existing token and revoke if exists (single session per user)
            existing_token = token_cache.get(user.id)
            if existing_token:
                print(f"  ⚠️ User {user.username} already has an active session, revoking old tokens...")
                # Revoke all tokens for this user at AAP (uses Gateway API)
                await revoke_token_at_aap(existing_token["access_token"])
                # Remove from cache
                token_cache.delete(user.id)

            # Step 5: Store new tokens in cache
            token_cache.set(
                user_id=user.id,
                access_token=tokens["access_token"],
                refresh_token=tokens.get("refresh_token", ""),
                username=user.username,
                email=user.email,
            )

            # Step 6: Issue Nexus JWT tokens
            nexus_tokens = issue_nexus_tokens(user)
            print(f"  🔐 Issued Nexus JWT access token (expires: {nexus_tokens.access_token_expires_at})")
            print(f"  🔐 Issued Nexus JWT refresh token (expires: {nexus_tokens.refresh_token_expires_at})")

            # Step 7: Create session (in production, only refresh token would be stored server-side)
            session_id = secrets.token_urlsafe(32)
            _sessions[session_id] = {
                "user": user,
                "aap_tokens": tokens,  # Kept for debugging only (ephemeral in production)
                "nexus_tokens": nexus_tokens,  # Nexus-issued JWT tokens
                "raw_user": raw_user,
            }

            print(f"  ✓ Created session, redirecting to home...")
            print(f"  ✓ User role mapped: {user.nexus_role}")

            # Redirect to home with session cookie
            response = RedirectResponse(url="/", status_code=303)
            response.set_cookie(
                key="session_id",
                value=session_id,
                httponly=True,
                samesite="lax",
                max_age=int(REFRESH_TOKEN_LIFETIME.total_seconds()),  # 8 hours (matches FR-004)
            )
            return response

    except httpx.RequestError as e:
        content = ERROR_CONTENT.format(
            error_message="Network error connecting to AAP",
            error_details=str(e),
        )
        return HTMLResponse(HOME_PAGE.format(content=content))


@app.get("/auth/logout")
async def logout(request: Request):
    """Clear Nexus session only (keeps AAP session active)."""
    session_id = request.cookies.get("session_id")
    if session_id and session_id in _sessions:
        session = _sessions[session_id]
        user = session["user"]

        print(f"\n🚪 Logging out user {user.username} (Nexus only)...")

        # Remove from token cache
        token_cache.delete(user.id)

        # Clear in-memory session
        del _sessions[session_id]
        print(f"  ✓ Nexus session cleared: {session_id[:20]}...")
        print(f"  ✓ Nexus JWT tokens invalidated (client must discard)")

    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie("session_id")
    return response


@app.get("/auth/logout-full")
async def logout_full(request: Request):
    """Full logout: Clear Nexus session, revoke AAP token, and end AAP session."""
    session_id = request.cookies.get("session_id")
    if session_id and session_id in _sessions:
        session = _sessions[session_id]
        user = session["user"]

        print(f"\n🚪 Full logout for user {user.username}...")

        # Step 1: Revoke AAP token if cached
        cached_token = token_cache.get(user.id)
        if cached_token and cached_token.get("access_token"):
            print(f"  → Revoking AAP token...")
            revoked = await revoke_token_at_aap(cached_token["access_token"])
            if revoked:
                print(f"  ✓ AAP token revoked")
            else:
                print(f"  ⚠️ AAP token revocation failed (token may already be expired)")

        # Step 2: Remove from token cache
        token_cache.delete(user.id)

        # Step 3: Clear in-memory session
        del _sessions[session_id]
        print(f"  ✓ Nexus session cleared")

    # Step 4: Delete Nexus cookie and redirect to AAP logout
    # AAP logout will end the AAP session, then redirect back to Nexus
    aap_logout_url = f"{AAP_BASE_URL}/api/gateway/v1/logout/"
    nexus_home = "http://localhost:9050/"

    # Some AAP versions support ?next= for redirect after logout
    full_logout_url = f"{aap_logout_url}?next={nexus_home}"

    print(f"  → Redirecting to AAP logout: {aap_logout_url}")

    response = RedirectResponse(url=full_logout_url, status_code=303)
    response.delete_cookie("session_id")
    return response


@app.get("/auth/refresh", response_class=HTMLResponse)
async def refresh_access_token(request: Request):
    """
    Refresh the Nexus access token using the Nexus refresh token.

    This is the Nexus-internal token refresh - it does NOT call AAP.
    The refresh token is validated locally using JWT signature verification.
    """
    session_id = request.cookies.get("session_id")
    if not session_id or session_id not in _sessions:
        return RedirectResponse(url="/", status_code=303)

    session = _sessions[session_id]
    nexus_tokens: NexusTokens = session.get("nexus_tokens")
    user = session["user"]

    if not nexus_tokens or not nexus_tokens.refresh_token:
        content = ERROR_CONTENT.format(
            error_message="No Nexus refresh token available",
            error_details="Session does not have a valid refresh token.",
        )
        return HTMLResponse(HOME_PAGE.format(content=content))

    print(f"\n🔄 Refreshing access token for user {user.username}...")

    # Validate the refresh token (stateless validation)
    refresh_payload = decode_token(nexus_tokens.refresh_token, "refresh")
    if not refresh_payload:
        content = ERROR_CONTENT.format(
            error_message="Refresh token is invalid or expired",
            error_details="Please log in again to get new tokens.",
        )
        return HTMLResponse(HOME_PAGE.format(content=content))

    # In production, we would also:
    # 1. Check if refresh token JTI is in revocation list (Redis)
    # 2. Implement token rotation: issue new refresh token, invalidate old one
    # 3. Detect reuse: if old refresh token is used, revoke all tokens for user

    # Issue new access token
    new_access_token, new_access_exp = create_access_token(user)

    # Update session with new access token (keep same refresh token for prototype)
    # In production with rotation: issue new refresh token too
    session["nexus_tokens"] = NexusTokens(
        access_token=new_access_token,
        refresh_token=nexus_tokens.refresh_token,  # Keep same for prototype
        access_token_expires_at=new_access_exp,
        refresh_token_expires_at=nexus_tokens.refresh_token_expires_at,
    )

    print(f"  ✓ New access token issued (expires: {new_access_exp})")
    print(f"  ℹ️  Refresh token unchanged (expires: {nexus_tokens.refresh_token_expires_at})")

    return RedirectResponse(url="/", status_code=303)


# =============================================================================
# SECURITY SCHEME
# =============================================================================

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user_from_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict | None:
    """
    Extract and validate user from Bearer token.

    Returns decoded token payload or None if invalid/missing.
    """
    if not credentials:
        return None

    payload = decode_token(credentials.credentials, "access")
    return payload


# =============================================================================
# AUTH ENDPOINTS (per spec)
# =============================================================================


@app.get("/auth/me")
async def get_current_user(
    request: Request,
    token_payload: dict | None = Depends(get_current_user_from_token),
):
    """
    Get current user information (FR-021).

    Returns user info from JWT claims or session.
    """
    # Try Bearer token first
    if token_payload:
        username_claim = f"{JWT_CLAIM_PREFIX}username"
        user_type_claim = f"{JWT_CLAIM_PREFIX}user_type"
        return {
            "id": token_payload.get("sub"),
            "username": token_payload.get(username_claim),
            "email": token_payload.get("email"),
            "user_type": token_payload.get(user_type_claim),
        }

    # Fall back to session cookie
    session_id = request.cookies.get("session_id")
    if session_id and session_id in _sessions:
        session = _sessions[session_id]
        user = session["user"]
        prefixed_username = f"{AAP_INSTANCE_ID}/{user.username}"
        return {
            "id": str(user.id),
            "username": prefixed_username,
            "email": user.email,
            "user_type": user.nexus_role,
        }

    raise HTTPException(status_code=401, detail="Authentication required")


@app.get("/auth/.well-known/jwks.json")
async def get_jwks():
    """
    JWKS endpoint for public key distribution.

    Returns the public key in JWKS format for JWT verification.
    """
    # Get the public key numbers
    public_key = _jwt_private_key.public_key()
    public_numbers = public_key.public_numbers()

    # Convert to base64url-encoded strings (no padding)
    def to_base64url(num: int, length: int) -> str:
        """Convert integer to base64url without padding."""
        num_bytes = num.to_bytes(length, byteorder="big")
        return base64.urlsafe_b64encode(num_bytes).rstrip(b"=").decode("ascii")

    # P-256 curve uses 32-byte coordinates
    x = to_base64url(public_numbers.x, 32)
    y = to_base64url(public_numbers.y, 32)

    jwks = {
        "keys": [
            {
                "kid": "nexus-prototype-key",
                "kty": "EC",
                "use": "sig",
                "alg": "ES256",
                "crv": "P-256",
                "x": x,
                "y": y,
            }
        ]
    }

    return JSONResponse(content=jwks)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok", "aap_url": AAP_BASE_URL, "aap_instance_id": AAP_INSTANCE_ID}


@app.get("/debug/clear-cookie")
async def debug_clear_cookie():
    """Clear the session cookie without revoking tokens or clearing server state."""
    print("\n🧹 Clearing session cookie only (server state preserved)...")
    response = RedirectResponse(url="/", status_code=303)
    response.delete_cookie("session_id")
    return response


@app.get("/debug/clear-access-token")
async def debug_clear_access_token(request: Request):
    """Clear only the Nexus access token, keeping refresh token intact."""
    session_id = request.cookies.get("session_id")
    if session_id and session_id in _sessions:
        session = _sessions[session_id]
        nexus_tokens: NexusTokens = session.get("nexus_tokens")
        if nexus_tokens:
            # Create new tokens object with empty access token
            session["nexus_tokens"] = NexusTokens(
                access_token="",
                refresh_token=nexus_tokens.refresh_token,
                access_token_expires_at=datetime.now(timezone.utc),
                refresh_token_expires_at=nexus_tokens.refresh_token_expires_at,
            )
            print("\n🧹 Cleared Nexus access token (refresh token preserved)")
    return RedirectResponse(url="/", status_code=303)


@app.get("/debug/cache")
async def debug_cache():
    """Debug endpoint to view the token cache (simulates Redis inspection)."""
    cache = token_cache.get_all()
    # Mask tokens for security
    masked_cache = {}
    for user_id, data in cache.items():
        masked_cache[user_id] = {
            **data,
            "access_token": data["access_token"][:20] + "..." if data.get("access_token") else None,
            "refresh_token": data["refresh_token"][:20] + "..." if data.get("refresh_token") else None,
        }
    return {
        "cache_file": str(TOKEN_CACHE_FILE),
        "total_sessions": len(cache),
        "sessions": masked_cache,
    }


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("prototype:app", host="0.0.0.0", port=9050, reload=True)
