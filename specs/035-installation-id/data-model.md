# Data Model: Installation ID

**Feature**: 035-installation-id
**Date**: 2026-03-13

## Entities

### Installation

A singleton record representing a Nexus deployment. Created during database migration. Read-only from application code.

| Field          | Type        | Constraints                | Description                                  |
| -------------- | ----------- | -------------------------- | -------------------------------------------- |
| `id`           | UUID        | PK, NOT NULL               | Unique installation identifier (UUID v4)     |
| `created_at`   | DateTime(tz)| NOT NULL, server default   | Timestamp of installation record creation    |

**Notes**:
- Does NOT inherit from `BaseResource` — this is a system-internal singleton, not a user-facing API resource
- Defined as a SQLModel `table=True` class for consistency with the codebase
- The `created_at` field uses `server_default=text("now()")` following existing patterns
- No `updated_at` — the record is immutable once created
- No `labels`, `name`, `description`, `deleted_at`, or user ownership fields
- Only one row ever exists in this table

### Table DDL (reference)

```sql
CREATE TABLE installation (
    id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);
```

## Migration Strategy

The Alembic migration performs two operations:

1. **Schema**: Create the `installation` table with the columns defined above
2. **Data**: Insert a single row with `id = uuid.uuid4()` (generated in Python migration code)

The downgrade drops the table entirely.

```python
# Upgrade (pseudocode)
def upgrade():
    op.create_table(
        "installation",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # Data migration: insert singleton row
    installation_table = sa.table("installation", sa.column("id", sa.Uuid()))
    op.execute(installation_table.insert().values(id=uuid.uuid4()))

# Downgrade
def downgrade():
    op.drop_table("installation")
```

## Derived Values (not stored)

The following value is computed at runtime, not stored in the database:

| Value                   | Derivation                                                    | Purpose                               |
| ----------------------- | ------------------------------------------------------------- | ------------------------------------- |
| Telemetry identifier    | `SHA-256(f"{installation_id}:{db_host}:{db_name}")` (hex)     | Anonymous telemetry tracking          |

## Relationships

None. The Installation entity is standalone with no foreign key relationships to other entities.

## State Transitions

None. The Installation record is immutable once created by the migration.
