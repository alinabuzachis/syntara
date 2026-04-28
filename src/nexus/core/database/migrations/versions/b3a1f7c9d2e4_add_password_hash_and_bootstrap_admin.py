"""add password_hash, remove auth_type and is_bootstrap_admin

Revision ID: b3a1f7c9d2e4
Revises: 978d62a7ec86
Create Date: 2026-03-30 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3a1f7c9d2e4"
down_revision: str | Sequence[str] | None = "978d62a7ec86"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add password_hash column to users table
    op.add_column(
        "users",
        sa.Column(
            "password_hash",
            sa.String(255),
            nullable=True,
        ),
    )

    # Remove auth_type column and enum (replaced by password_hash + future identity_links)
    op.drop_index("ix_users_auth_type", table_name="users", if_exists=True)
    op.drop_column("users", "auth_type")
    sa.Enum(name="authtype").drop(op.get_bind(), checkfirst=True)

    # Remove is_bootstrap_admin column (admin is identified by username convention)
    op.drop_column("users", "is_bootstrap_admin")


def downgrade() -> None:
    """Downgrade schema."""
    # Restore is_bootstrap_admin column
    op.add_column(
        "users",
        sa.Column(
            "is_bootstrap_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    # Restore auth_type column and enum
    authtype_enum = sa.Enum("local", "federated", name="authtype")
    authtype_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column(
            "auth_type",
            authtype_enum,
            nullable=False,
            server_default="local",
        ),
    )
    op.create_index("ix_users_auth_type", "users", ["auth_type"])

    op.drop_column("users", "password_hash")
