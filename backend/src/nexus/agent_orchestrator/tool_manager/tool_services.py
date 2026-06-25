"""Tool Manager Integration Services.

This module provides functions for integrating with the Tool Manager component,
including tool discovery, synchronization, and error reporting.
"""

import re
from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

import structlog
from langchain_core.tools import BaseTool

from nexus.agent_orchestrator.audit.tool_management import ToolDiscoveryEvent, ToolDiscoveryStatus
from nexus.agent_orchestrator.tool_manager.tool_filtering import (
    enhance_namespaced_tools_with_metadata,
    filter_base_tools_by_enabled,
    identify_missing_tools,
    identify_re_enableable_tools,
    identify_unregistered_tools,
)
from nexus.agent_orchestrator.tool_manager.tool_manager_client import ToolManagerClient
from nexus.agent_orchestrator.tool_manager.types import (
    NamespacedBaseTool,
    ToolDiscoveryResult,
)
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.sanitization import CREDENTIAL_PATTERNS, REDACTED
from nexus.core.config.base import get_settings
from nexus.integrations.models.integration import IntegrationRead, IntegrationStatus, IntegrationType
from nexus.tool_manager.lib.providers.factory import ProviderFactory, get_provider_factory
from nexus.tool_manager.models.tool import ToolStatus, ToolWithParameters

logger = structlog.stdlib.get_logger(__name__)


async def _discover_mcp_integrations() -> list[IntegrationRead]:
    """Discover MCP server integrations from the Integrations API.

    Fetches all integrations of type mcp_server.

    Returns:
        List of all MCP server IntegrationRead records.
        Returns empty list if the API is unavailable or fails.

    """
    settings = get_settings()

    try:
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            all_integrations = await client.get_all_mcp_integrations()
            logger.info("Discovered MCP integrations", integration_count=len(all_integrations))
            return all_integrations
    except Exception as e:  # noqa: BLE001 (Failure of ToolManagerClient for whatever reason is not critical)
        logger.warning("Failed to discover MCP integrations, continuing without them", error=str(e))
        return []


async def _discover_tools() -> ToolDiscoveryResult:
    """Discover tools from Tool Manager.

    Fetches all tools and filters them at service layer.

    Returns:
        Tuple of (enabled_tools, disabled_tools).
        Returns empty lists if Tool Manager is unavailable or fails.

    """
    settings = get_settings()

    try:
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            all_tools = await client.get_all_tools()
            # Filter to enabled and disabled tools at service layer
            enabled_tools = [t for t in all_tools if t.enabled]
            disabled_tools = [t for t in all_tools if not t.enabled]
            logger.info(
                "Discovered enabled and disabled Tools",
                enabled_count=len(enabled_tools),
                disabled_count=len(disabled_tools),
                total_count=len(all_tools),
            )
            return enabled_tools, disabled_tools
    except Exception as e:  # noqa: BLE001 (Failure of ToolManagerClient for whatever reason is not critical)
        logger.warning("Tool Manager failed, continuing without tools", error=str(e))
        return [], []


async def report_tool_execution_failure(tool_id: UUID, error_message: str) -> None:
    """Report tool execution failure to Tool Manager.

    Args:
        tool_id: ID of the tool that failed
        error_message: Error message describing the failure

    """
    settings = get_settings()

    async with ToolManagerClient(
        base_url=str(settings.tool_manager_base_url),
        timeout=settings.tool_manager_timeout_seconds,
        max_connections=settings.tool_manager_max_connections,
        max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
    ) as client:
        try:
            await client.update_tool_status(tool_id=tool_id, status=ToolStatus.ERROR, refresh_error=error_message)
            logger.info("Reported tool execution failure", tool_id=tool_id)
        except Exception:
            logger.exception("Failed to report tool execution failure")


def _should_skip_integration(integration: IntegrationRead) -> bool:
    """Check if integration should be skipped due to missing configuration."""
    if not integration.configuration:
        logger.warning("Skipping integration: no configuration", integration_name=integration.name)
        return True
    return False


def _should_retry_disabled_integration(integration: IntegrationRead) -> bool:
    """Check if a disabled integration should be retried for re-enablement.

    Only retry integrations that are:
    - disabled (enabled=False)
    - AND in ERROR state (status=ERROR)

    This avoids overriding user-intentionally disabled integrations.
    """
    return not integration.enabled and integration.validation_status == IntegrationStatus.ERROR


def _is_integration_type_supported(integration: IntegrationRead, provider_factory: ProviderFactory) -> bool:
    """Check if integration type is supported by the provider factory."""
    # MCP server integrations always use the "mcp" provider type
    if integration.integration_type != IntegrationType.MCP_SERVER:
        logger.warning(
            "Skipping integration with unsupported type",
            integration_name=integration.name,
            integration_type=integration.integration_type,
        )
        return False

    provider_type = "mcp"
    if not provider_factory.is_registered(provider_type):
        supported_types = provider_factory.get_registered_provider_types()
        logger.warning(
            "Skipping integration: mcp provider type not registered",
            integration_name=integration.name,
            supported_types=supported_types,
        )
        return False
    return True


def _prepare_config_params(integration: IntegrationRead, api_key: str | None = None) -> dict[str, Any]:
    """Prepare configuration parameters for provider adapter creation.

    Filters configuration fields to only those understood by the provider adapter:
    - base_url: The MCP server endpoint
    - provider_id: Set from integration.id
    - provider_name: Set from integration.name
    - api_key: The bearer token (if provided by the credential resolver)

    System-managed fields are excluded since they are not constructor
    parameters on the adapter implementations.
    """
    config = integration.configuration
    # Only include scalar fields that provider adapters accept as constructor kwargs.
    # Exclude discriminator keys and system-managed fields.
    excluded_fields = frozenset({"integration_type", "discovered_models"})
    config_params = {k: v for k, v in config.model_dump().items() if k not in excluded_fields and v is not None}
    config_params["integration_id"] = integration.id
    config_params["integration_name"] = integration.name
    if api_key is not None:
        config_params["api_key"] = api_key
    return config_params


def _create_namespaced_tools(integration: IntegrationRead, provider_tools: list[BaseTool]) -> list[NamespacedBaseTool]:
    """Create namespaced tools from integration tools."""
    namespaced_tools = []
    for tool in provider_tools:
        namespaced_name = f"{integration.name}::{tool.name}"
        namespaced_tools.append((namespaced_name, tool))
    return namespaced_tools


def _sanitize_error_message(error: Exception, max_length: int = 200) -> str:
    """Produce a safe, truncated error summary for user-facing storage.

    Raw exception messages from external services may contain internal
    hostnames, credentials, stack traces, or other sensitive data.
    Uses the same credential patterns as the audit EventSanitizer to
    detect and redact sensitive tokens embedded in the message.
    """
    msg = str(error).split("\n", maxsplit=1)[0].strip()
    if len(msg) > max_length:
        msg = msg[:max_length] + "…"

    msg_lower = msg.lower()
    for pattern in CREDENTIAL_PATTERNS:
        if re.search(rf"(?:^|[_\-. ])(?:{re.escape(pattern)})(?:[_\-. ]|$)", msg_lower):
            return f"{type(error).__name__}: {REDACTED}"

    return msg


async def _handle_integration_errors(integration: IntegrationRead, error: Exception) -> None:
    """Handle different types of integration errors with appropriate logging and disabling."""
    safe_msg = _sanitize_error_message(error)

    if isinstance(error, ConnectionError | TimeoutError):
        logger.warning(
            "Failed to get tools from integration, disabling", integration_name=integration.name, error=str(error)
        )
        validation_error = f"Connection/timeout error: {safe_msg}"
    elif isinstance(error, OSError):
        logger.warning(
            "Network/system error from integration, disabling", integration_name=integration.name, error=str(error)
        )
        validation_error = f"Network/system error: {safe_msg}"
    elif isinstance(error, RuntimeError):
        logger.warning(
            "Unexpected error from integration, disabling", integration_name=integration.name, error=str(error)
        )
        validation_error = f"Runtime error: {safe_msg}"
    elif isinstance(error, ValueError):
        logger.warning(
            "Invalid configuration for integration, disabling", integration_name=integration.name, error=str(error)
        )
        validation_error = f"Invalid configuration: {safe_msg}"
    else:
        logger.exception("Unexpected error processing integration, disabling", integration_name=integration.name)
        validation_error = f"Unexpected error: {safe_msg}"

    # Disable the integration and set error status using ToolManagerClient
    settings = get_settings()
    try:
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            await client.update_integration_status(
                integration_id=integration.id,
                validation_status=IntegrationStatus.ERROR,
                validation_error=validation_error,
            )
            logger.info("Disabled integration due to error", integration_name=integration.name)
    except Exception:
        logger.exception("Failed to disable integration via ToolManagerClient", integration_name=integration.name)


async def _handle_integration_re_enablement(integration: IntegrationRead) -> None:
    """Re-enable a previously disabled integration that is now working.

    Sets enabled=True, validation_status=AVAILABLE, and clears validation_error.
    """
    settings = get_settings()
    try:
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            await client.update_integration_status(
                integration_id=integration.id,
                validation_status=IntegrationStatus.AVAILABLE,
                validation_error=None,
            )
            logger.info("Re-enabled previously disabled integration", integration_name=integration.name)
    except Exception:
        logger.exception("Failed to re-enable integration via ToolManagerClient", integration_name=integration.name)


async def _process_single_integration(
    integration: IntegrationRead,
    provider_factory: ProviderFactory,
    credential_resolver: Callable[[UUID], Awaitable[str | None]] | None = None,
) -> list[NamespacedBaseTool]:
    """Process a single integration and return its namespaced tools.

    For enabled integrations: Attempt connection, disable on failure.
    For disabled ERROR integrations: Retry connection, re-enable on success.
    For disabled AVAILABLE integrations: Skip (user-intentionally disabled).
    """
    if _should_skip_integration(integration):
        return []

    if not _is_integration_type_supported(integration, provider_factory):
        return []

    # Skip disabled integrations unless they're in ERROR state (eligible for retry)
    if not integration.enabled and not _should_retry_disabled_integration(integration):
        logger.debug(
            "Skipping disabled integration",
            integration_name=integration.name,
            integration_status=integration.validation_status.value,
        )
        return []

    try:
        api_key: str | None = None
        if credential_resolver:
            api_key = await credential_resolver(integration.id)

        config_params = _prepare_config_params(integration, api_key=api_key)
        provider_type = "mcp"

        adapter = provider_factory.create_provider_instance(provider_type, **config_params)
        provider_tools = await adapter.get_base_tools()

        namespaced_tools = _create_namespaced_tools(integration, provider_tools)
        logger.info(
            "Retrieved tools from integration", tool_count=len(provider_tools), integration_name=integration.name
        )

        # If this was a disabled ERROR integration that succeeded, re-enable it
        if _should_retry_disabled_integration(integration):
            await _handle_integration_re_enablement(integration)

        return namespaced_tools

    except (OSError, RuntimeError, ValueError) as e:
        # Only disable if integration was enabled (don't update status for failed retries)
        if integration.enabled:
            await _handle_integration_errors(integration, e)
        else:
            logger.debug("Retry failed for disabled integration", integration_name=integration.name, error=str(e))
        return []
    except Exception as e:  # noqa: BLE001 (Handle any unexpected integration errors gracefully)
        # Only disable if integration was enabled (don't update status for failed retries)
        if integration.enabled:
            await _handle_integration_errors(integration, e)
        else:
            logger.debug("Retry failed for disabled integration", integration_name=integration.name, error=str(e))
        return []


async def _retrieve_base_tools_from_integrations(
    all_integrations: list[IntegrationRead],
    credential_resolver: Callable[[UUID], Awaitable[str | None]] | None = None,
) -> list[NamespacedBaseTool]:
    """Retrieve BaseTools from MCP server integrations using ProviderFactory pattern.

    Processes all integrations (enabled and disabled). For disabled integrations in ERROR
    state, attempts to retry connection to potentially re-enable them.

    Args:
        all_integrations: List of all mcp_server integrations (enabled and disabled)
        credential_resolver: Optional async callable that resolves a bearer token given an integration_id

    Returns:
        List of NamespacedTool containing (namespaced_name, BaseTool) retrieved from integrations

    """
    namespaced_tools: list[NamespacedBaseTool] = []

    async for provider_factory in get_provider_factory():
        for integration in all_integrations:
            integration_tools = await _process_single_integration(integration, provider_factory, credential_resolver)
            namespaced_tools.extend(integration_tools)
        break  # Exit the async generator after first iteration

    logger.info(
        "Retrieved total tools from integrations",
        total_tool_count=len(namespaced_tools),
        integration_count=len(all_integrations),
    )
    return namespaced_tools


def _filter_enabled_tools(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> list[NamespacedBaseTool]:
    """Filter NamespacedBaseTools by enabled status using namespaced_name.

    Args:
        namespaced_tools: List of NamespacedTool from integrations
        enabled_tools: List of enabled tools from Tool Manager

    Returns:
        List of filtered NamespacedBaseTools

    """
    filtered_tools = filter_base_tools_by_enabled(namespaced_tools, enabled_tools)
    logger.info("Filtered tools for execution", filtered_tool_count=len(filtered_tools))
    return filtered_tools


def _enhance_tools_with_metadata(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> list[BaseTool]:
    """Enhance NamespacedBaseTools with metadata from Tool Manager (optimized).

    Args:
        namespaced_tools: List of filtered NamespacedBaseTools
        enabled_tools: List of enabled tools from Tool Manager

    Returns:
        List of BaseTools enhanced with metadata

    """
    enhanced_tools = enhance_namespaced_tools_with_metadata(namespaced_tools, enabled_tools)
    logger.info("Enhanced tools with metadata", enhanced_tool_count=len(enhanced_tools))
    return enhanced_tools


async def _update_missing_tools(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> None:
    """Update missing tools in Tool Manager (async, best-effort).

    Args:
        namespaced_tools: List of NamespacedTool from integrations
        enabled_tools: List of enabled tools from Tool Manager

    """
    settings = get_settings()

    # Identify missing tools using the filtering function
    missing_tools = identify_missing_tools(namespaced_tools, enabled_tools)

    async with ToolManagerClient(
        base_url=str(settings.tool_manager_base_url),
        timeout=settings.tool_manager_timeout_seconds,
        max_connections=settings.tool_manager_max_connections,
        max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
    ) as client:
        # Update missing tools status in Tool Manager
        for missing_tool in missing_tools:
            try:
                await client.update_tool_status(
                    tool_id=missing_tool.id, status=ToolStatus.MISSING, refresh_error="Tool not found in MCP server"
                )
                logger.info("Updated missing tool status", tool_name=missing_tool.namespaced_name)
            except (OSError, RuntimeError) as e:
                logger.warning("Failed to update missing tool status", error=str(e))
            except Exception:
                logger.exception("Failed to update tool status", tool_name=missing_tool.namespaced_name)


async def _update_re_enabled_tools(
    namespaced_tools: list[NamespacedBaseTool],
    disabled_tools: list[ToolWithParameters],
) -> None:
    """Re-enable disabled tools that are now available on MCP servers (async, best-effort).

    Args:
        namespaced_tools: List of NamespacedTool from integrations
        disabled_tools: List of disabled tools from Tool Manager

    """
    settings = get_settings()

    # Identify disabled tools that can be re-enabled using the filtering function
    re_enableable_tools = identify_re_enableable_tools(namespaced_tools, disabled_tools)

    if not re_enableable_tools:
        return

    async with ToolManagerClient(
        base_url=str(settings.tool_manager_base_url),
        timeout=settings.tool_manager_timeout_seconds,
        max_connections=settings.tool_manager_max_connections,
        max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
    ) as client:
        # Re-enable tools that are now available on MCP servers
        for re_enableable_tool in re_enableable_tools:
            try:
                await client.update_tool_status(
                    tool_id=re_enableable_tool.id, status=ToolStatus.AVAILABLE, refresh_error=None
                )
                logger.info("Re-enabled previously disabled tool", tool_name=re_enableable_tool.namespaced_name)
            except (OSError, RuntimeError) as e:
                logger.warning("Failed to re-enable tool status", error=str(e))
            except Exception:
                logger.exception("Failed to re-enable tool", tool_name=re_enableable_tool.namespaced_name)

    logger.info(
        "Re-enabled previously disabled tools that are now available on MCP servers",
        re_enabled_count=len(re_enableable_tools),
    )


def _log_unregistered_tools(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> None:
    """Log unregistered tools for awareness.

    Args:
        namespaced_tools: List of NamespacedTool from integrations
        enabled_tools: List of enabled tools from Tool Manager

    """
    unregistered_tools = identify_unregistered_tools(namespaced_tools, enabled_tools)
    if unregistered_tools:
        unregistered_names = [tool.name for tool in unregistered_tools]
        logger.info("Unregistered tools found in MCP servers", unregistered_tool_names=unregistered_names)


class ToolSynchronizer:
    """Stateful tool synchronization orchestrator.

    Provides a class-based interface for tool synchronization while internally
    using the module-level functions. Maintains state for a synchronization session
    and eliminates the need for repeated parameter passing.
    """

    def __init__(
        self,
        session_id: str,
        invocation_id: UUID,
        execution_id: UUID | None = None,
        request_id: UUID | None = None,
        credential_resolver: Callable[[UUID], Awaitable[str | None]] | None = None,
        activity_id: str | None = None,
        activity_name: str | None = None,
    ) -> None:
        """Initialize the tool synchronizer.

        Args:
            session_id: Session identifier for multi-tenant isolation
            invocation_id: Unique identifier for this synchronization session
            execution_id: Optional Workflow Execution ID
            request_id: Optional X-Request-Id from the originating HTTP request.
            credential_resolver: Optional async callable that resolves a bearer token given an integration_id.
                Called per integration at sync time, before the provider adapter is instantiated.
            activity_id: Optional activity identifier from workflow context
            activity_name: Optional activity name from workflow context

        """
        self.session_id = session_id
        self.invocation_id = invocation_id
        self.execution_id = execution_id
        self.request_id = request_id
        self.credential_resolver = credential_resolver
        self.activity_id = activity_id
        self.activity_name = activity_name
        self.all_integrations: list[IntegrationRead] = []
        self.enabled_tools: list[ToolWithParameters] = []
        self.disabled_tools: list[ToolWithParameters] = []
        self.namespaced_tools: list[NamespacedBaseTool] = []

    async def synchronize_tools(self) -> list[BaseTool]:
        """Perform tool synchronization and validation before execution.

        This method orchestrates all the tool management components using
        the module-level functions while maintaining state internally.

        Returns:
            List of filtered BaseTools ready for execution

        """
        logger.info("Starting tool synchronization", invocation_id=self.invocation_id)

        # Emit STARTED event
        AuditEventDispatcher.dispatch(
            ToolDiscoveryEvent(
                status=ToolDiscoveryStatus.STARTED,
                session_id=self.session_id,
                invocation_id=self.invocation_id,
                execution_id=self.execution_id,
                request_id=self.request_id,
                activity_id=self.activity_id,
                activity_name=self.activity_name,
            )
        )

        try:
            # Step 1: Discover MCP integrations and tools from Tool Manager
            self.all_integrations = await _discover_mcp_integrations()
            self.enabled_tools, self.disabled_tools = await _discover_tools()

            # Step 2: Process all integrations and retrieve BaseTools
            self.namespaced_tools = await _retrieve_base_tools_from_integrations(
                self.all_integrations, self.credential_resolver
            )

            # Step 3: Filter BaseTools by enabled status
            filtered_tools = _filter_enabled_tools(self.namespaced_tools, self.enabled_tools)

            # Step 4: Enhance BaseTools with metadata for failure handling
            enhanced_tools = _enhance_tools_with_metadata(filtered_tools, self.enabled_tools)

            # Step 5: Update missing tools in Tool Manager (async, best-effort)
            await _update_missing_tools(self.namespaced_tools, self.enabled_tools)

            # Step 6: Re-enable previously disabled tools that are now available
            await _update_re_enabled_tools(self.namespaced_tools, self.disabled_tools)

            # Step 7: Log unregistered tools for awareness
            _log_unregistered_tools(self.namespaced_tools, self.enabled_tools)

            logger.info("Tool synchronization completed", invocation_id=self.invocation_id)

            # Emit COMPLETED event with metrics
            tool_names = [tool.name for tool in enhanced_tools]
            AuditEventDispatcher.dispatch(
                ToolDiscoveryEvent(
                    status=ToolDiscoveryStatus.COMPLETED,
                    session_id=self.session_id,
                    invocation_id=self.invocation_id,
                    execution_id=self.execution_id,
                    request_id=self.request_id,
                    integrations_discovered=len(self.all_integrations),
                    tools_discovered=len(self.namespaced_tools),
                    tools_enabled=len(self.enabled_tools),
                    tools_disabled=len(self.disabled_tools),
                    tools_filtered=len(filtered_tools),
                    tools_provided_to_llm=len(enhanced_tools),
                    tool_names=tool_names,
                    activity_id=self.activity_id,
                    activity_name=self.activity_name,
                )
            )

            return enhanced_tools

        except Exception as e:
            # Emit FAILED event
            AuditEventDispatcher.dispatch(
                ToolDiscoveryEvent(
                    status=ToolDiscoveryStatus.FAILED,
                    session_id=self.session_id,
                    invocation_id=self.invocation_id,
                    execution_id=self.execution_id,
                    request_id=self.request_id,
                    error_type=type(e).__name__,
                    activity_id=self.activity_id,
                    activity_name=self.activity_name,
                )
            )

            # Don't fail the entire execution if tool sync fails
            logger.exception("Tool synchronization failed", invocation_id=self.invocation_id)
            return []
