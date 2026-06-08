"""add auth_type and is_bootstrap_admin to users

Revision ID: 978d62a7ec86
Revises: a1b2c3d4e5f6
Create Date: 2026-03-28 18:23:44.335543

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "978d62a7ec86"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # CUSTOM: Create authtype enum and add columns to users table
    authtype_enum = sa.Enum("local", "federated", name="authtype")
    authtype_enum.create(op.get_bind(), checkfirst=True)

    op.add_column(
        "users",
        sa.Column(
            "auth_type",
            authtype_enum,
            nullable=False,
            server_default="local",
            index=True,
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "is_bootstrap_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # END CUSTOM


def downgrade() -> None:
    """Downgrade schema."""
    # CUSTOM: Remove columns and enum
    op.drop_column("users", "is_bootstrap_admin")
    op.drop_column("users", "auth_type")

    sa.Enum(name="authtype").drop(op.get_bind(), checkfirst=True)
    # END CUSTOM
