"""convert user role to enum type

Revision ID: f5f4b399ef33
Revises: 68bd8e14bec3
Create Date: 2025-10-29 16:14:44.747993

"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f5f4b399ef33"
down_revision: str | Sequence[str] | None = "68bd8e14bec3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema - convert user role column from VARCHAR to ENUM."""
    # Create the enum type
    user_role_enum = postgresql.ENUM(
        "creator", "approver", "administrator", "viewer", name="userrole", create_type=True
    )
    user_role_enum.create(op.get_bind())

    # Convert the column to use the enum type
    # Using USING clause to cast existing VARCHAR values to the new enum type
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE userrole USING role::userrole")


def downgrade() -> None:
    """Downgrade schema - convert user role column from ENUM back to VARCHAR."""
    # Convert the column back to VARCHAR
    op.execute("ALTER TABLE users ALTER COLUMN role TYPE VARCHAR(50) USING role::text")

    # Drop the enum type
    user_role_enum = postgresql.ENUM("creator", "approver", "administrator", "viewer", name="userrole")
    user_role_enum.drop(op.get_bind())
