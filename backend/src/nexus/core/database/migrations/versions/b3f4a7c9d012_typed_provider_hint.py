"""typed provider_hint in llm_provider configuration

Normalizes the freeform provider_hint string inside the JSONB
configuration column of llm_provider integrations to use the new
LLMProviderHint enum values. Existing rows with unrecognized or null
values are mapped to "custom". Also makes provider_hint required
(no null) at the application layer.

No DDL changes — provider_hint lives inside the JSONB column.

Revision ID: b3f4a7c9d012
Revises: 6c19b1305293
Create Date: 2026-06-25 13:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3f4a7c9d012"
down_revision: str | Sequence[str] | None = "6c19b1305293"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Valid LLMProviderHint enum values after this migration.
_VALID_HINTS = {"red_hat_ai", "openai", "anthropic", "gemini", "custom"}


def upgrade() -> None:
    """Normalize provider_hint values in llm_provider configurations.

    Maps unknown or null values to "custom".
    """
    # CUSTOM: data-only migration for JSONB content normalization
    op.execute(
        "UPDATE integrations "
        "SET configuration = jsonb_set(configuration, '{provider_hint}', '\"custom\"') "
        "WHERE integration_type = 'llm_provider' "
        "AND ("
        "  configuration->>'provider_hint' IS NULL "
        "  OR configuration->>'provider_hint' NOT IN "
        "  ('red_hat_ai', 'openai', 'anthropic', 'gemini', 'custom')"
        ")"
    )
    # END CUSTOM


def downgrade() -> None:
    """No-op: freeform strings are a superset of enum values."""
