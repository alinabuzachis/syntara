"""User login telemetry event model.

Captures analytics when a user authenticates (every login).
Enables "active users" dashboard metrics and per-installation user counts.

Requirement: AAP-72352
"""

from sqlmodel import Field

from nexus.telemetry.events.base import BaseTelemetryEvent


class UserLoginEvent(BaseTelemetryEvent):
    """Analytics event for a user login.

    Emitted on every successful authentication (password or OIDC).
    The user_id_hash is a SHA-256 digest of the user's UUID,
    ensuring no personally identifiable information is transmitted.
    """

    user_id_hash: str = Field(
        min_length=64,
        max_length=64,
        description="SHA-256 hash of the user UUID (anonymized)",
    )
    amr: list[str] = Field(
        description="Authentication method references (e.g. ['pwd'] for password, ['fed'] for OIDC)",
    )
    idp: str = Field(
        description="Identity provider identifier (e.g. 'local' for password, provider name for OIDC)",
    )
