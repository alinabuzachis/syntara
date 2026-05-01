"""Shared JWT claim extraction utilities.

Defines the canonical mapping between JWT claims and actor/user attributes.
Used by both verified (auth) and unverified (audit) JWT processing.
"""

from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class ActorClaims:
    """Extracted actor identity claims from JWT token.

    Attributes:
        actor_id: User UUID from 'sub' claim
        actor_username: Username from 'preferred_username' (with 'sub' fallback)

    """

    actor_id: UUID | None
    actor_username: str | None


def extract_actor_claims(claims: dict[str, Any]) -> ActorClaims:
    """Extract actor identity from JWT claims dictionary.

    Canonical claim extraction strategy:
    - actor_id: 'sub' claim (converted to UUID)
    - actor_username: 'preferred_username' claim, fallback to 'sub'

    Args:
        claims: Decoded JWT claims dictionary (verified or unverified)

    Returns:
        ActorClaims with extracted identity, or None fields if missing/invalid

    """
    try:
        actor_id_str = claims.get("sub")
        actor_id = UUID(actor_id_str) if actor_id_str else None

        actor_username = claims.get("preferred_username") or claims.get("sub")

        return ActorClaims(actor_id=actor_id, actor_username=actor_username)
    except (ValueError, TypeError):
        # Invalid UUID or malformed claims
        return ActorClaims(actor_id=None, actor_username=None)
