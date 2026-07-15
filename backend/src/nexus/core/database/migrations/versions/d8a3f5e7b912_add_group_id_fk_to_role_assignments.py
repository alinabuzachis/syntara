"""Add group_id FK to role_assignments, drop principal_type.

Adds a dedicated ``group_id`` column with FK to ``groups.id`` and a FK
from ``principal_id`` to ``principals.id``.  Exactly one of the two
must be set (CHECK constraint).  Existing group assignments are
migrated from ``principal_id`` to ``group_id``.  The ``principal_type``
column is dropped — groups use ``group_id``, and user vs service
account is resolved via the ``principals`` table.

Revision ID: d8a3f5e7b912
Revises: 1f7811e54a52
Create Date: 2026-07-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d8a3f5e7b912"
down_revision: str | Sequence[str] | None = "1f7811e54a52"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add group_id FK to role_assignments, backfill from principal_id for groups."""
    # CUSTOM: multi-step migration — add column, backfill, add constraints
    # Step 1: Add group_id column (nullable, no FK yet)
    op.add_column("role_assignments", sa.Column("group_id", sa.Uuid(), nullable=True))

    # Step 2: Make principal_id nullable (was NOT NULL; now NULL for group rows)
    op.alter_column("role_assignments", "principal_id", existing_type=sa.Uuid(), nullable=True)

    # Step 3: Backfill — move group assignments from principal_id to group_id
    op.execute("UPDATE role_assignments SET group_id = principal_id WHERE principal_type = 'group'")

    # Step 4: Nullify principal_id for group assignments
    op.execute("UPDATE role_assignments SET principal_id = NULL WHERE principal_type = 'group'")

    # Step 5: Drop old indexes that reference principal_type (must happen before column drop)
    op.drop_index("ix_ra_principal_role_global", table_name="role_assignments")
    op.drop_index("ix_ra_principal_role_project", table_name="role_assignments")
    op.drop_index("ix_role_assignments_principal_type", table_name="role_assignments")

    # Step 6: Drop principal_type column (no longer needed — groups use group_id,
    # user vs service_account is resolved via the principals table)
    op.drop_column("role_assignments", "principal_type")

    # Step 7: Add FK constraints
    op.create_foreign_key(
        "fk_ra_principal_id_principals",
        "role_assignments",
        "principals",
        ["principal_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_ra_group_id_groups",
        "role_assignments",
        "groups",
        ["group_id"],
        ["id"],
    )

    # Step 8: Add CHECK constraint — exactly one of principal_id or group_id must be set
    op.create_check_constraint(
        "ck_ra_principal_xor_group",
        "role_assignments",
        "(principal_id IS NOT NULL) != (group_id IS NOT NULL)",
    )

    # Step 9: Create new partial unique indexes
    op.create_index(
        "ix_ra_principal_role_global",
        "role_assignments",
        ["principal_id", "role_name"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL AND principal_id IS NOT NULL"),
    )
    op.create_index(
        "ix_ra_group_role_global",
        "role_assignments",
        ["group_id", "role_name"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL AND group_id IS NOT NULL"),
    )
    op.create_index(
        "ix_ra_principal_role_project",
        "role_assignments",
        ["principal_id", "role_name", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL AND principal_id IS NOT NULL"),
    )
    op.create_index(
        "ix_ra_group_role_project",
        "role_assignments",
        ["group_id", "role_name", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL AND group_id IS NOT NULL"),
    )

    # Step 10: Add index on group_id for lookups
    op.create_index("ix_role_assignments_group_id", "role_assignments", ["group_id"])
    # END CUSTOM


def downgrade() -> None:
    """Reverse: move group_id back to principal_id, remove group_id column."""
    # CUSTOM: reverse the migration
    op.drop_index("ix_role_assignments_group_id", table_name="role_assignments")
    op.drop_index("ix_ra_group_role_project", table_name="role_assignments")
    op.drop_index("ix_ra_principal_role_project", table_name="role_assignments")
    op.drop_index("ix_ra_group_role_global", table_name="role_assignments")
    op.drop_index("ix_ra_principal_role_global", table_name="role_assignments")

    op.drop_constraint("ck_ra_principal_xor_group", "role_assignments", type_="check")
    op.drop_constraint("fk_ra_group_id_groups", "role_assignments", type_="foreignkey")
    op.drop_constraint("fk_ra_principal_id_principals", "role_assignments", type_="foreignkey")

    # Re-add the principal_type column
    op.add_column("role_assignments", sa.Column("principal_type", sa.String(50), nullable=True))

    # Backfill principal_type from principals table for principal assignments
    op.execute(
        "UPDATE role_assignments SET principal_type = p.principal_type "
        "FROM principals p WHERE role_assignments.principal_id = p.id"
    )
    # Backfill principal_type for group assignments
    op.execute("UPDATE role_assignments SET principal_type = 'group' WHERE group_id IS NOT NULL")

    # Restore principal_id for group assignments
    op.execute("UPDATE role_assignments SET principal_id = group_id WHERE group_id IS NOT NULL")

    # Restore principal_type NOT NULL constraint
    op.alter_column("role_assignments", "principal_type", existing_type=sa.String(50), nullable=False)

    # Restore principal_type index
    op.create_index("ix_role_assignments_principal_type", "role_assignments", ["principal_type"])

    op.drop_column("role_assignments", "group_id")

    # Restore principal_id NOT NULL constraint
    op.alter_column("role_assignments", "principal_id", existing_type=sa.Uuid(), nullable=False)

    # Restore old indexes
    op.create_index(
        "ix_ra_principal_role_global",
        "role_assignments",
        ["principal_type", "principal_id", "role_name"],
        unique=True,
        postgresql_where=sa.text("project_id IS NULL"),
    )
    op.create_index(
        "ix_ra_principal_role_project",
        "role_assignments",
        ["principal_type", "principal_id", "role_name", "project_id"],
        unique=True,
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    # END CUSTOM
