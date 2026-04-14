"""Convert setting_category enum to lookup table.

Replace the PostgreSQL ``settingcategory`` enum with a ``setting_categories``
lookup table. The ``runtime_settings.category`` column becomes a VARCHAR
with a foreign key to ``setting_categories.slug``.

Revision ID: a7b8c9d0e1f2
Revises: 60c7c1a00001
Create Date: 2026-04-10

"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "a7b8c9d0e1f2"
down_revision = "60c7c1a00001"
branch_labels = None
depends_on = None

# Seed all categories from the existing PG enum so the FK conversion
# doesn't fail on any rows that reference these values.
_CATEGORIES = [
    ("ai_llm", "AI / LLM", "Artificial intelligence and large language model settings", 10),
    ("context_manager", "Context Manager", "Token limits, retrieval, grounding, compression, and context assembly", 20),
    ("workflow_execution", "Workflow Execution", "Workflow execution and orchestration settings", 30),
    ("integrations", "Integrations", "Third-party integration settings", 40),
    ("system", "System", "System-level settings", 50),
    ("application", "Application", "Application-level settings", 60),
]


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Create the setting_categories lookup table
    op.create_table(
        "setting_categories",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "labels",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=2000), nullable=True),
        sa.Column("slug", sa.String(length=255), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_setting_categories")),
    )
    op.create_index(op.f("ix_setting_categories_id"), "setting_categories", ["id"], unique=False)
    op.create_index(op.f("ix_setting_categories_slug"), "setting_categories", ["slug"], unique=True)
    op.create_index(op.f("ix_setting_categories_name"), "setting_categories", ["name"], unique=False)
    op.create_index(op.f("ix_setting_categories_created_at"), "setting_categories", ["created_at"], unique=False)
    op.create_index(op.f("ix_setting_categories_updated_at"), "setting_categories", ["updated_at"], unique=False)

    # 2. Seed initial categories
    # CUSTOM: bulk insert via sa.table() since ORM models are not available in migrations
    now = datetime.now(UTC)
    setting_categories = sa.table(
        "setting_categories",
        sa.column("id", sa.Uuid()),
        sa.column("slug", sa.String()),
        sa.column("name", sa.String()),
        sa.column("description", sa.String()),
        sa.column("display_order", sa.Integer()),
        sa.column("labels", postgresql.JSONB()),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        setting_categories,
        [
            {
                "id": uuid4(),
                "slug": slug,
                "name": name,
                "description": desc,
                "display_order": order,
                "labels": {},
                "created_at": now,
                "updated_at": now,
            }
            for slug, name, desc, order in _CATEGORIES
        ],
    )
    # END CUSTOM

    # 3. Convert category column from PostgreSQL enum to VARCHAR
    op.execute("ALTER TABLE runtime_settings ALTER COLUMN category TYPE VARCHAR(255) USING category::text")

    # 4. Add foreign key constraint
    op.create_foreign_key(
        "fk_runtime_settings_category_setting_categories",
        "runtime_settings",
        "setting_categories",
        ["category"],
        ["slug"],
    )

    # 5. Drop the old PostgreSQL enum type
    sa.Enum(name="settingcategory").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    """Downgrade schema.

    WARNING: If new categories were added after this migration ran
    (via CATEGORY_CATALOG), any runtime_settings rows referencing those
    categories must be deleted before downgrading. The USING cast to
    the recreated PG enum will fail for values not in the original set.
    """
    # 1. Drop foreign key
    op.drop_constraint("fk_runtime_settings_category_setting_categories", "runtime_settings", type_="foreignkey")

    # 2. Recreate the PostgreSQL enum type
    settingcategory = sa.Enum(
        "ai_llm",
        "workflow_execution",
        "integrations",
        "system",
        "context_manager",
        "application",
        name="settingcategory",
    )
    settingcategory.create(op.get_bind(), checkfirst=True)

    # 3. Convert column back to enum
    op.execute(
        "ALTER TABLE runtime_settings ALTER COLUMN category TYPE settingcategory USING category::settingcategory"
    )

    # 4. Drop indexes and table
    op.drop_index(op.f("ix_setting_categories_updated_at"), table_name="setting_categories")
    op.drop_index(op.f("ix_setting_categories_created_at"), table_name="setting_categories")
    op.drop_index(op.f("ix_setting_categories_name"), table_name="setting_categories")
    op.drop_index(op.f("ix_setting_categories_slug"), table_name="setting_categories")
    op.drop_index(op.f("ix_setting_categories_id"), table_name="setting_categories")
    op.drop_table("setting_categories")
