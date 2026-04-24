"""New user telemetry event model.

Captures analytics when a user logs in for the first time.
Enables "new users per day" dashboard metrics and new vs. returning user distinction.
"""

from sqlmodel import Field

from nexus.telemetry.events.base import BaseTelemetryEvent


class NewUserEvent(BaseTelemetryEvent):
    """Analytics event for a new user's first connection.

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
