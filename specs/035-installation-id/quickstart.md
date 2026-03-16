# Quickstart: Installation ID

**Feature**: 035-installation-id
**Date**: 2026-03-13

## Overview

This feature adds a database-persisted `installation_id` (UUID) to uniquely identify each Nexus deployment. The ID is created by an Alembic migration and used by the telemetry subsystem to derive the Segment `anonymousId`.

## Files to Create

| File | Purpose |
| ---- | ------- |
| `src/nexus/core/models/installation.py` | SQLModel for the `installation` table |
| `src/nexus/core/database/migrations/versions/xxx_add_installation_table.py` | Alembic migration |
| `tests/unit/models/test_installation.py` | Model unit tests |
| `tests/integration/telemetry/test_installation_telemetry.py` | Integration tests for `anonymousId` derivation |

## Files to Modify

| File | Change |
| ---- | ------ |
| `src/nexus/telemetry/client.py` | Add `anonymous_id` to `TelemetryClientRegistry`, update `send_event()` to use it, update `initialize_telemetry()` to read installation ID from DB and derive `anonymousId` |
| `src/nexus/core/database/migrations/env.py` | Import `Installation` model so Alembic detects it for autogenerate |
| `tests/integration/telemetry/test_client.py` | Update tests for new `anonymous_id` parameter |

## Implementation Order

1. **Create the Installation model** (`src/nexus/core/models/installation.py`)
   - Simple SQLModel with `id` (UUID, PK) and `created_at` (DateTime with timezone)
   - Do NOT inherit from `BaseResource`

2. **Register model in migrations env** (`src/nexus/core/database/migrations/env.py`)
   - Add `from nexus.core.models.installation import Installation` to model imports

3. **Generate Alembic migration**
   - Run `alembic revision --autogenerate -m "add_installation_table"`
   - Add custom data migration step to insert singleton row with `uuid.uuid4()`

4. **Add `anonymousId` derivation** (`src/nexus/telemetry/client.py`)
   - Add function to read installation ID from database
   - Add function to derive `anonymousId` via SHA-256 hash
   - Update `TelemetryClientRegistry.initialize()` to accept and store `anonymous_id`
   - Update `TelemetryClientRegistry.send_event()` to pass `anonymous_id` to `client.track()`
   - Update `initialize_telemetry()` to read installation ID, derive hash, and pass to registry
   - Log the `anonymousId` at startup (FR-008)

5. **Handle entitlement_id as event property**
   - Always include `entitlement_id` in event properties (empty string when not configured)
   - Do NOT use `entitlement_id` as the Segment `userId`

6. **Write tests**
   - Model tests: verify table structure, singleton constraint
   - Telemetry integration tests: verify derived `anonymousId`, verify entitlement_id optionality
   - Hash determinism tests: same inputs produce same output, different inputs produce different output

## Key Design Decisions

- **No API exposure**: The installation ID is internal — no REST endpoint needed
- **No contracts directory**: This feature has no API contracts to define
- **Singleton via migration**: The migration inserts the row; application code only reads
- **SHA-256 of configured coordinates**: Uses `db_host` and `db_name` from settings (not resolved DNS), making the identifier stable across container restarts
- **entitlement_id as event property**: Included in event properties when configured, NOT used as Segment `userId`
