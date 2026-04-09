"""add password_hash, remove auth_type and is_bootstrap_admin, seed admin user

Revision ID: b3a1f7c9d2e4
Revises: 978d62a7ec86
Create Date: 2026-03-30 12:00:00.000000

"""

import os
from collections.abc import Sequence
from pathlib import Path
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from argon2 import PasswordHasher

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

    # CUSTOM: Seed admin user from password file
    password_path = os.environ.get("APP_ADMIN_PASSWORD_PATH")
    if not password_path:
        msg = (
            "APP_ADMIN_PASSWORD_PATH environment variable is required. "
            "Set it to the path of a file containing the bootstrap admin password "
            "(e.g. APP_ADMIN_PASSWORD_PATH=.secrets/admin-password). "
            "Generate secrets with: make secrets-generate"
        )
        raise RuntimeError(msg)
    password = Path(password_path).read_text().strip()
    if not password:
        msg = f"Admin password file is empty: {password_path}"
        raise RuntimeError(msg)

    hashed = PasswordHasher().hash(password)
    admin_id = str(uuid4())

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "INSERT INTO users "
            "(id, username, email, full_name, role, "
            "is_active, password_hash, preferences, created_at, updated_at) "
            "VALUES "
            "(CAST(:id AS uuid), :username, :email, :full_name, "
            "CAST(:role AS userrole), "
            ":is_active, :password_hash, :preferences, NOW(), NOW()) "
            "ON CONFLICT DO NOTHING"
        ),
        {
            "id": admin_id,
            "username": "admin",
            "email": "admin@nexus.local",
            "full_name": "Administrator",
            "role": "administrator",
            "is_active": True,
            "password_hash": hashed,
            "preferences": "{}",
        },
    )
    # END CUSTOM


def downgrade() -> None:
    """Downgrade schema."""
    # CUSTOM: Remove admin user
    op.execute(sa.text("DELETE FROM users WHERE username = 'admin'"))
    # END CUSTOM

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
