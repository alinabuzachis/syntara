"""remove retriever llm_model setting

The retriever.llm_model setting is superseded by the agent node's
LLM credential config (AAP-77379). Remove any persisted setting row.

Revision ID: 2fa1c46a2358
Revises: c80a30b6398a
Create Date: 2026-07-16 13:40:46.554191

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2fa1c46a2358"
down_revision: str | Sequence[str] | None = "c80a30b6398a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# CUSTOM: Data migration — remove a deprecated runtime setting row.

_SETTING_KEY = "retriever.llm_model"


def upgrade() -> None:
    """Remove the retriever.llm_model runtime setting."""
    op.execute(sa.text("DELETE FROM runtime_settings WHERE key = :key").bindparams(key=_SETTING_KEY))


def downgrade() -> None:
    """No-op: the setting definition was removed from the catalog."""
