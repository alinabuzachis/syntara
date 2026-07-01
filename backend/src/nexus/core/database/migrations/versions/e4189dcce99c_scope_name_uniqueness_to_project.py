"""scope_name_uniqueness_to_project

Change credential and workflow name unique indexes from (name) to
(name, project_id) so names are unique per project, not globally.

Revision ID: e4189dcce99c
Revises: a4b92671c6a3
Create Date: 2026-06-30 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4189dcce99c"
down_revision: str | Sequence[str] | None = "a4b92671c6a3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Scope name uniqueness to project for credentials and workflows."""
    # Credentials: hard delete, no partial condition
    op.drop_index("ix_credentials_name_unique", table_name="credentials")
    op.create_index(
        "ix_credentials_name_project_unique",
        "credentials",
        ["name", "project_id"],
        unique=True,
    )

    # Workflows: soft delete, partial index on deleted_at IS NULL
    op.drop_index(
        "ix_workflows_name_unique",
        table_name="workflows",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_workflows_name_project_unique",
        "workflows",
        ["name", "project_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    """Revert to global name uniqueness."""
    op.drop_index(
        "ix_workflows_name_project_unique",
        table_name="workflows",
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_workflows_name_unique",
        "workflows",
        ["name"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.drop_index("ix_credentials_name_project_unique", table_name="credentials")
    op.create_index(
        "ix_credentials_name_unique",
        "credentials",
        ["name"],
        unique=True,
    )
