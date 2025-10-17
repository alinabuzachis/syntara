"""Nexus Tool Manager - Provider-agnostic tool management system."""

from nexus.tool_manager.lib import (
    # Repository Protocols
    CacheAdapter,
    ExecutionRepository,
    # Pagination and Filtering
    FilterParam,
    PaginationParams,
    PaginationResult,
    # Domain Models
    Provider,
    # Exceptions
    ProviderError,
    ProviderNotFoundError,
    ProviderRepository,
    # Enums
    ProviderStatus,
    Tool,
    ToolExecution,
    ToolExecutionStatus,
    ToolManagerError,
    ToolNotFoundError,
    ToolParameter,
    ToolRepository,
    ValidationError,
    # Core Functions
    bulk_update_tools,
    delete_provider,
    get_provider_detail,
    get_tool_detail,
    list_providers,
    list_tools,
    refresh_tools,
    register_provider,
    update_provider,
    update_tool_enabled,
    validate_provider_connection,
    validate_tool,
)
from nexus.tool_manager.lib.providers import (
    ProviderFactory,
    ToolProviderAdapter,
)
from nexus.tool_manager.models import (
    BulkUpdateResult,
    ConnectionValidationResult,
    ToolMetricsSummary,
    ToolRefreshResult,
    ToolSchema,
    ToolValidationResult,
)

__version__ = "0.1.0"

__all__ = [  # noqa: RUF022
    # Version
    "__version__",
    # Domain Models
    "Provider",
    "Tool",
    "ToolExecution",
    "ToolParameter",
    # Enums
    "ProviderStatus",
    "ToolExecutionStatus",
    # Exceptions
    "ProviderError",
    "ProviderNotFoundError",
    "ToolManagerError",
    "ToolNotFoundError",
    "ValidationError",
    # Pagination and Filtering
    "FilterParam",
    "PaginationParams",
    "PaginationResult",
    # Repository Protocols
    "CacheAdapter",
    "ExecutionRepository",
    "ProviderRepository",
    "ToolRepository",
    # Core Functions
    "bulk_update_tools",
    "delete_provider",
    "get_provider_detail",
    "get_tool_detail",
    "list_providers",
    "list_tools",
    "refresh_tools",
    "register_provider",
    "update_provider",
    "update_tool_enabled",
    "validate_provider_connection",
    "validate_tool",
    # Provider System
    "ProviderFactory",
    "ToolProviderAdapter",
    # Result Models
    "BulkUpdateResult",
    "ConnectionValidationResult",
    "ToolMetricsSummary",
    "ToolRefreshResult",
    "ToolSchema",
    "ToolValidationResult",
]
