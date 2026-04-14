# Runtime Settings

## Overview

Runtime settings are database-backed configuration values that can be changed without redeploying the application. Settings are stored in PostgreSQL and accessible to other backend code via `SettingsCache`, and manageable by administrators through the REST API and Settings UI page.

Like `nexus.core.config`, Runtime settings are accessed by a short key, have default values, and enforce validation criteria.

Unlike `nexus.core.config`, Runtime settings are not configurable by environment variables. They are user-controlled and should not be used for install-time configuration settings that require deployment changes (such as database connection details or HTTP server configuration). Those configuration settings should remain in `nexus.core.config` and configurable by environment variable.

Since Runtime settings may be written by multiple clients, they employ a version number to guarantee consistency using optimistic locking.

Key design points:

- **No migration needed for new settings** -- add a `SettingDefinition` to the catalog and run the post-migration seeder
- **JSONB storage** -- values are stored as native Python types, not strings
- **Optimistic locking** -- concurrent writes are safe; version conflicts are detected
- **Per-key TTL cache (planned)** -- a Redis-backed cache with per-key TTL is planned; reads currently go directly to the database

## Reading Settings

Access settings through the `SettingsCache` singleton via `get_runtime_settings()`. All reads are `async`:

```python
from nexus.settings.cache.settings_cache import get_runtime_settings

class MyService:
    def __init__(self) -> None:
        self.settings = get_runtime_settings()

    async def do_work(self) -> None:
        temperature = await self.settings.get_float("context_manager.compression_temperature")
        max_tokens = await self.settings.get_int("context_manager.max_total_tokens")
```

The cache resolves the effective value: user-set `value` if present, otherwise `default_value`.

### Typed getter methods

Use the typed getter methods to ensure values are validated at read time:

| Method       | Returns | Notes                                                    |
|--------------|---------|----------------------------------------------------------|
| `get_int()`  | `int`   | Rejects `bool` values                                   |
| `get_float()`| `float` | Accepts `int` (coerces to `float`); rejects `bool`      |
| `get_str()`  | `str`   |                                                          |
| `get_bool()` | `bool`  |                                                          |
| `get()`      | `Any`   | Untyped; use for JSON-type settings or when type is mixed|

Each typed method accepts an optional `default` keyword argument. If the setting is missing or `None` and no default is provided, a `SettingTypeError` is raised. If the stored value has the wrong type, a `SettingTypeError` is also raised.

```python
# With a fallback default
timeout = await self.settings.get_int("context_manager.request_timeout_seconds", default=30)

# For JSON-type settings, use the untyped get()
priority_order = await self.settings.get("context_manager.priority_order")
```

> **Important**: Always access settings through `get_runtime_settings()`. A Redis-backed cache will be added in a future iteration, and using `SettingsCache` ensures your code benefits from that upgrade automatically.

## Defining a New Setting

Add a `SettingDefinition` entry to `SETTINGS_CATALOG` in `src/nexus/settings/catalog.py`:

```python
from nexus.settings.catalog import SettingDefinition
from nexus.settings.models.runtime_setting import SettingCategory, SettingValueType

SettingDefinition(
    key="application.max_retries",             # dot-namespaced key
    name="Max retries",                        # human-readable name
    category=SettingCategory.APPLICATION,      # UI tab grouping
    value_type=SettingValueType.INTEGER,       # string | integer | float | boolean | json
    default_value=3,                           # native Python type, not a string
    description="Maximum retry attempts for my feature.",
    group="Reliability",                       # UI section heading within the tab
    requires_restart=False,                    # True if change needs app restart
    cache_ttl_seconds=None,                    # None = use default (caching not yet active)
    validation_schema={"min": 0, "max": 10},  # optional constraints
)
```

That's it. After running migrations and the seeder, the definition is upserted into the `runtime_settings` table:

```bash
uv run alembic upgrade head
uv run python tools/seed_settings.py
```

If no row matching the setting exists, a row will be inserted. If a row does exist, the user-controlled `value` and `version` will be preserved but the other metadata fields (including `default_value`) will be updated. The seeder does not run at app startup — it runs as a post-migration step.

### Key conventions

- Use dot-namespaced keys: `category.setting_name`
- Use an existing category slug from `CATEGORY_CATALOG`, or add a new one (see [Adding a New Category](#adding-a-new-category)).
- `default_value` must be a native Python type matching `value_type`

### Validation schema

The optional `validation_schema` dict supports these constraints:

| Key              | Applies to     | Example                                 |
| ---------------- | -------------- | --------------------------------------- |
| `min`            | integer, float | `{"min": 0}`                            |
| `max`            | integer, float | `{"max": 100}`                          |
| `allowed_values` | string         | `{"allowed_values": ["DEBUG", "INFO"]}` |
| `pattern`        | string         | `{"pattern": "^[a-z]+$"}`               |

Validation runs on every write through the REST API.

## REST API

Settings are managed via the REST API at `/api/v1/settings`. All endpoints require the ADMINISTRATOR role.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/settings` | List all settings (paginated, filterable by category/group) |
| `GET` | `/settings/categories` | List all categories with group names |
| `GET` | `/settings/{key}` | Get a single setting by dot-namespaced key |
| `PATCH` | `/settings/{key}` | Update a setting value |
| `PATCH` | `/settings` | Bulk update multiple settings |

### Updating a setting

Optionally include `expected_version` for optimistic locking. When omitted, the update applies unconditionally. The Settings UI always sends `expected_version` to detect concurrent edits:

```bash
curl -X PATCH http://localhost:8000/api/v1/settings/context_manager.max_total_tokens \
  -H "Content-Type: application/json" \
  -d '{"value": 8000, "expected_version": 1}'
```

### Resetting to default

To reset a setting, set `value` to the setting's `default_value`:

```bash
curl -X PATCH http://localhost:8000/api/v1/settings/context_manager.max_total_tokens \
  -H "Content-Type: application/json" \
  -d '{"value": 4000, "expected_version": 2}'
```

> **Note:** User-specified values cannot be `null`. Internally, `null` means "use the default value" and is managed by the seeder. The API rejects `null` values with a 422 error.

### Bulk operations

Update multiple settings at once:

```bash
curl -X PATCH http://localhost:8000/api/v1/settings \
  -H "Content-Type: application/json" \
  -d '{"updates": [
    {"key": "context_manager.max_total_tokens", "value": 8000, "expected_version": 1},
    {"key": "context_manager.max_context_tokens", "value": 4000, "expected_version": 1}
  ]}'
```

### Filtering and pagination

The list endpoint supports cursor-based pagination and filtering:

```bash
# Filter by category
curl -s "http://localhost:8000/api/v1/settings?category=context_manager"

# Filter by group
curl -s "http://localhost:8000/api/v1/settings?group=Token+limits"

# Pagination (limit, cursor, sort)
curl -s "http://localhost:8000/api/v1/settings?limit=10&sort=key"
```

### Limits

- **Bulk operations**: Maximum 500 items per request
- **Value size**: Maximum 64KB per setting value (serialized JSON)
- **Pagination**: Maximum 100 items per page (default 20)

### Error responses

All errors follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details format:

| Status | Code | When |
|--------|------|------|
| `403` | — | User is not an administrator |
| `404` | `SETTING_NOT_FOUND` | Unknown key |
| `409` | `SETTING_VERSION_CONFLICT` | Optimistic lock version mismatch |
| `422` | `SETTING_VALIDATION_ERROR` | Value fails type or constraint checks |

## Migrating from `nexus.core.config`

To move a setting from `NexusSettings` (Pydantic/env-var config) to runtime settings:

1. **Add the `SettingDefinition`** to `SETTINGS_CATALOG` with the same default value
2. **Map Pydantic validators to `validation_schema`** -- e.g., `ge=0, le=1.0` becomes `{"min": 0.0, "max": 1.0}`
3. **Replace reads** -- swap `settings.my_value` with `await settings.get_float("category.my_value")` (or the appropriate typed getter)
4. **Remove the old field** from the Pydantic config class once all consumers are migrated

### Before (env-var config)

```python
from nexus.core.config import get_settings

settings = get_settings()
temperature = settings.compression_temperature
```

### After (runtime settings)

```python
from nexus.settings.cache.settings_cache import get_runtime_settings

settings = get_runtime_settings()
temperature = await settings.get_float("context_manager.compression_temperature")
```

Note the shift from sync to async -- callers must be in an async context.

## Architecture

```text
SETTINGS_CATALOG (Python)
        |
        v
    Seeder (post-migration)  ──upsert──>  runtime_settings (PostgreSQL)
                                                  ^
                                                  |
                                    SettingsService (BaseService)
                                          ^             ^
                                         /               \
                              SettingsStore           REST API
                           (internal reads)        (/api/v1/settings)
                                  ^
                                  |
                           SettingsCache
                                  ^
                                  |
                       Application code reads
```

## Adding a New Category

Categories are stored in the `setting_categories` database table and seeded
from `CATEGORY_CATALOG` in `src/nexus/settings/catalog.py`. To add a new
category:

1. Add a `CategoryDefinition` entry to `CATEGORY_CATALOG` with a unique slug,
   display name, description, and display order.
2. Add the slug to the `SettingCategory` enum in
   `src/nexus/settings/models/runtime_setting.py` (used for type-safe
   references in `SETTINGS_CATALOG`).
3. Run the seeder (`make dev` or `uv run python tools/seed_settings.py`) —
   no migration is needed.
