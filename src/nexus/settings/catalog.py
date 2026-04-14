"""Settings catalog: canonical definitions of categories and settings.

Adding a new category requires a :class:`CategoryDefinition` entry in
:data:`CATEGORY_CATALOG`. Adding a new setting requires a
:class:`SettingDefinition` entry in :data:`SETTINGS_CATALOG`. The
post-migration seeder upserts both catalogs into the database — no
migration is needed for new entries.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any

from nexus.settings.models.runtime_setting import SettingCategory, SettingValueType


@dataclass
class CategoryDefinition:
    """Canonical definition of a setting category for the startup seeder.

    Attributes:
        slug: Machine key matching ``runtime_settings.category`` values.
        name: Human-readable display name for the UI.
        description: Longer description shown in the UI (e.g. tooltips).
        display_order: Sort position for UI tab rendering (lower = first).

    """

    slug: str
    name: str
    description: str | None = None
    display_order: int = 0


CATEGORY_CATALOG: list[CategoryDefinition] = [
    CategoryDefinition(
        slug="system",
        name="System",
        description="System-level settings including observability and diagnostics",
        display_order=10,
    ),
    CategoryDefinition(
        slug="context_manager",
        name="Context Manager",
        description="Token limits, retrieval, grounding, compression, and context assembly",
        display_order=20,
    ),
]


class ContextManagerGroup(StrEnum):
    """Group names for context_manager settings."""

    GROUNDING = "Grounding scores"
    TOKEN_LIMITS = "Token limits"  # noqa: S105
    RETRIEVAL = "Retrieval"
    SNIPPETS = "Snippets"
    CONTEXT_ASSEMBLY = "Context assembly"
    PERFORMANCE = "Performance"
    COMPRESSION = "Compression"


@dataclass
class SettingDefinition:
    """Canonical definition of a single runtime setting.

    Used by the post-migration seeder to upsert the ``runtime_settings`` table.
    Fields that are not operator-mutable (``value``, ``version``) are
    intentionally absent — the seeder never overwrites them.

    Attributes:
        key: Dot-namespaced setting identifier matching ``RuntimeSetting.key``. Globally unique.
        name: Human-readable display name.
        category: Logical grouping for display and filtering.
        value_type: Expected Python type for UI rendering and validation.
        default_value: Factory default as a native Python type.
        description: Optional longer description shown in the UI.
        requires_restart: Whether a change takes effect without restart.
        cache_ttl_seconds: Per-setting TTL override; ``None`` uses 60s default.
        validation_schema: Optional constraints dict (min, max,
            allowed_values, pattern).

    """

    key: str
    name: str
    category: SettingCategory
    value_type: SettingValueType
    default_value: int | float | bool | str | list[str] | None
    description: str | None = None
    group: str | None = None
    requires_restart: bool = False
    cache_ttl_seconds: int | None = None
    validation_schema: dict[str, Any] | None = field(default=None)


class MetricsGroup(StrEnum):
    """Group names for metrics settings."""

    OBSERVABILITY = "Observability"


SETTINGS_CATALOG: list[SettingDefinition] = [
    # Metrics — Observability
    SettingDefinition(
        key="metrics.perf_test_mode",
        name="Performance test mode",
        category=SettingCategory.SYSTEM,
        value_type=SettingValueType.BOOLEAN,
        default_value=False,
        description=(
            "Enable internal metrics store and /_internal/metrics/* endpoints "
            "for performance testing. When enabled, raw metric records are "
            "stored in memory and queryable without an application restart."
        ),
        group=MetricsGroup.OBSERVABILITY,
    ),
    # Context Manager — Grounding scores
    SettingDefinition(
        key="context_manager.required_grounding_score",
        name="Required grounding score",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.FLOAT,
        default_value=0.7,
        description="Required grounding score threshold (0.0-1.0)",
        group=ContextManagerGroup.GROUNDING,
        validation_schema={"min": 0.0, "max": 1.0},
    ),
    SettingDefinition(
        key="context_manager.minimum_grounding_score",
        name="Minimum grounding score",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.FLOAT,
        default_value=0.5,
        description="Minimum grounding score threshold (0.0-1.0)",
        group=ContextManagerGroup.GROUNDING,
        validation_schema={"min": 0.0, "max": 1.0},
    ),
    # Context Manager — Token limits
    SettingDefinition(
        key="context_manager.max_total_tokens",
        name="Max total tokens",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=4000,
        description="Maximum total tokens in context package",
        group=ContextManagerGroup.TOKEN_LIMITS,
        validation_schema={"min": 1},
    ),
    SettingDefinition(
        key="context_manager.max_context_tokens",
        name="Max context tokens",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=3000,
        description="Maximum tokens for context content",
        group=ContextManagerGroup.TOKEN_LIMITS,
        validation_schema={"min": 1},
    ),
    SettingDefinition(
        key="context_manager.max_system_tokens",
        name="Max system tokens",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=500,
        description="Maximum tokens for system prompts",
        group=ContextManagerGroup.TOKEN_LIMITS,
        validation_schema={"min": 1},
    ),
    SettingDefinition(
        key="context_manager.max_user_tokens",
        name="Max user tokens",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=500,
        description="Maximum tokens for user messages",
        group=ContextManagerGroup.TOKEN_LIMITS,
        validation_schema={"min": 1},
    ),
    # Context Manager — Retrieval
    SettingDefinition(
        key="context_manager.default_k",
        name="Default K (documents to retrieve)",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=10,
        description="Default number of documents to retrieve",
        group=ContextManagerGroup.RETRIEVAL,
        validation_schema={"min": 1},
    ),
    SettingDefinition(
        key="context_manager.enable_hybrid_search",
        name="Hybrid search",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.BOOLEAN,
        default_value=True,
        description="Enable hybrid search (semantic + lexical)",
        group=ContextManagerGroup.RETRIEVAL,
    ),
    SettingDefinition(
        key="context_manager.semantic_weight",
        name="Semantic weight",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.FLOAT,
        default_value=0.7,
        description="Weight for semantic search in hybrid mode (0.0-1.0)",
        group=ContextManagerGroup.RETRIEVAL,
        validation_schema={"min": 0.0, "max": 1.0},
    ),
    SettingDefinition(
        key="context_manager.lexical_weight",
        name="Lexical weight",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.FLOAT,
        default_value=0.3,
        description="Weight for lexical search in hybrid mode (0.0-1.0)",
        group=ContextManagerGroup.RETRIEVAL,
        validation_schema={"min": 0.0, "max": 1.0},
    ),
    # Context Manager — Snippets
    SettingDefinition(
        key="context_manager.max_snippets_per_doc",
        name="Max snippets per document",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=3,
        description="Maximum number of snippets to extract per document",
        group=ContextManagerGroup.SNIPPETS,
        validation_schema={"min": 1},
    ),
    SettingDefinition(
        key="context_manager.snippet_min_length",
        name="Snippet min length (chars)",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=100,
        description="Minimum length of extracted snippets in characters",
        group=ContextManagerGroup.SNIPPETS,
        validation_schema={"min": 1},
    ),
    SettingDefinition(
        key="context_manager.snippet_max_length",
        name="Snippet max length (chars)",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=500,
        description="Maximum length of extracted snippets in characters",
        group=ContextManagerGroup.SNIPPETS,
        validation_schema={"min": 1},
    ),
    # Context Manager — Context assembly
    SettingDefinition(
        key="context_manager.enforce_hierarchy",
        name="Hierarchical ordering",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.BOOLEAN,
        default_value=True,
        description="Enforce hierarchical ordering of context sections",
        group=ContextManagerGroup.CONTEXT_ASSEMBLY,
    ),
    SettingDefinition(
        key="context_manager.priority_order",
        name="Priority order",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.JSON,
        default_value=["system", "context", "user"],
        description="Priority order for context sections",
        group=ContextManagerGroup.CONTEXT_ASSEMBLY,
    ),
    SettingDefinition(
        key="context_manager.include_citations",
        name="Include source citations",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.BOOLEAN,
        default_value=True,
        description="Include source citations in assembled context",
        group=ContextManagerGroup.CONTEXT_ASSEMBLY,
    ),
    # Context Manager — Performance
    SettingDefinition(
        key="context_manager.request_timeout_seconds",
        name="Request timeout (seconds)",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=30,
        description="Maximum time allowed for context manager requests",
        group=ContextManagerGroup.PERFORMANCE,
        validation_schema={"min": 1},
    ),
    SettingDefinition(
        key="context_manager.max_concurrent_requests",
        name="Max concurrent requests",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=5,
        description="Maximum number of concurrent context requests",
        group=ContextManagerGroup.PERFORMANCE,
        validation_schema={"min": 1},
    ),
    # Context Manager — Compression
    SettingDefinition(
        key="context_manager.compression_mode",
        name="Compression mode",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.STRING,
        default_value="extractive",
        description="Compression mode (extractive or abstractive)",
        group=ContextManagerGroup.COMPRESSION,
        validation_schema={"allowed_values": ["extractive", "abstractive"]},
    ),
    SettingDefinition(
        key="context_manager.compression_loop",
        name="Compression loop",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=3,
        description="Maximum number of compression retry attempts",
        group=ContextManagerGroup.COMPRESSION,
        validation_schema={"min": 0},
    ),
    SettingDefinition(
        key="context_manager.compression_temperature",
        name="Compression temperature",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.FLOAT,
        default_value=0.3,
        description="LLM temperature for compression operations (0.0-1.0)",
        group=ContextManagerGroup.COMPRESSION,
        validation_schema={"min": 0.0, "max": 1.0},
    ),
    SettingDefinition(
        key="context_manager.compression_max_tokens",
        name="Compression max tokens",
        category=SettingCategory.CONTEXT_MANAGER,
        value_type=SettingValueType.INTEGER,
        default_value=2000,
        description="Maximum tokens for compression LLM responses",
        group=ContextManagerGroup.COMPRESSION,
        validation_schema={"min": 1},
    ),
]
