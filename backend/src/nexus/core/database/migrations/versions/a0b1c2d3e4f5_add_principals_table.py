"""Add principals table and retarget ownership FKs.

Introduces the ``principals`` supertype table for class-table inheritance.
Users become subtypes (their PK references ``principals.id``).
``UserOwnedResource.created_by``/``updated_by`` FKs are retargeted from
``users.id`` to ``principals.id``.

Groups are NOT part of the class-table inheritance hierarchy — they use
``RoleAssignment.principal_type`` as a denormalized discriminator without
FK integrity to the principals table.

Revision ID: a0b1c2d3e4f5
Revises: a0f042999fd8
Create Date: 2026-06-16

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a0b1c2d3e4f5"
down_revision: str | Sequence[str] | None = "a0f042999fd8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Tables that inherit created_by / updated_by from UserOwnedResource
_OWNED_TABLES = [
    "credentials",
    "executions",
    "identity_providers",
    "integrations",
    "invocations",
    "rate_limits",
    "service_accounts",
    "tool_executions",
    "tool_providers",
    "tools",
    "usage_counters",
    "workflow_versions",
    "workflows",
]


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create principals table
    op.create_table(
        "principals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("principal_type", sa.String(length=20), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_principals_principal_type"), "principals", ["principal_type"])

    # CUSTOM: backfill principals from existing users and service accounts
    op.execute(
        """
        INSERT INTO principals (id, principal_type)
        SELECT id, 'user' FROM users
        """
    )
    op.execute(
        """
        INSERT INTO principals (id, principal_type)
        SELECT id, 'service_account' FROM service_accounts
        """
    )
    # END CUSTOM

    # 2. Add subtype FKs: users.id / service_accounts.id → principals.id
    op.create_foreign_key(
        op.f("users_id_fkey"),
        "users",
        "principals",
        ["id"],
        ["id"],
    )
    op.create_foreign_key(
        op.f("service_accounts_id_fkey"),
        "service_accounts",
        "principals",
        ["id"],
        ["id"],
    )

    # 3. Retarget created_by / updated_by FKs from users.id → principals.id
    for table in _OWNED_TABLES:
        op.drop_constraint(f"{table}_created_by_fkey", table, type_="foreignkey")
        op.create_foreign_key(
            f"{table}_created_by_fkey",
            table,
            "principals",
            ["created_by"],
            ["id"],
        )

        op.drop_constraint(f"{table}_updated_by_fkey", table, type_="foreignkey")
        op.create_foreign_key(
            f"{table}_updated_by_fkey",
            table,
            "principals",
            ["updated_by"],
            ["id"],
        )

    # 4. Widen role_assignments.principal_type from String(10) to String(20)
    op.alter_column(
        "role_assignments",
        "principal_type",
        type_=sa.String(length=20),
        existing_type=sa.String(length=10),
    )

    # 5. Add is_builtin column to role_assignments if not present
    # (already exists from prior migration — kept here for documentation)


def downgrade() -> None:
    """Downgrade schema."""
    # Reverse principal_type column width
    op.alter_column(
        "role_assignments",
        "principal_type",
        type_=sa.String(length=10),
        existing_type=sa.String(length=20),
    )

    # Retarget created_by / updated_by FKs back to users.id
    for table in _OWNED_TABLES:
        op.drop_constraint(f"{table}_updated_by_fkey", table, type_="foreignkey")
        op.create_foreign_key(
            f"{table}_updated_by_fkey",
            table,
            "users",
            ["updated_by"],
            ["id"],
        )

        op.drop_constraint(f"{table}_created_by_fkey", table, type_="foreignkey")
        op.create_foreign_key(
            f"{table}_created_by_fkey",
            table,
            "users",
            ["created_by"],
            ["id"],
        )

    # Drop subtype FKs
    op.drop_constraint(op.f("service_accounts_id_fkey"), "service_accounts", type_="foreignkey")
    op.drop_constraint(op.f("users_id_fkey"), "users", type_="foreignkey")

    # Drop principals table
    op.drop_index(op.f("ix_principals_principal_type"), table_name="principals")
    op.drop_table("principals")
