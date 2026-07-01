"""Drop storage_backend and retention_expires_at from file_metadata.

S3 is now the only storage backend; local storage and file retention
have been removed. AO has not shipped GA, so no production data exists.

Revision ID: c4a1e8f2b301
Revises: e4189dcce99c
Create Date: 2026-06-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4a1e8f2b301"
down_revision: str | None = "e4189dcce99c"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:  # noqa: D103
    op.drop_index(op.f("ix_file_metadata_retention_expires_at"), table_name="file_metadata")
    op.drop_index(op.f("ix_file_metadata_storage_backend"), table_name="file_metadata")
    op.drop_column("file_metadata", "retention_expires_at")
    op.drop_column("file_metadata", "storage_backend")


def downgrade() -> None:  # noqa: D103
    op.add_column(
        "file_metadata",
        sa.Column(
            "storage_backend",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            server_default="local",
            nullable=False,
        ),
    )
    op.add_column(
        "file_metadata",
        sa.Column("retention_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(op.f("ix_file_metadata_storage_backend"), "file_metadata", ["storage_backend"], unique=False)
    op.create_index(
        op.f("ix_file_metadata_retention_expires_at"), "file_metadata", ["retention_expires_at"], unique=False
    )
    # Remove server_default after backfilling existing rows
    op.alter_column("file_metadata", "storage_backend", server_default=None)
