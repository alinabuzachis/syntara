"""Tool Manager Integration Services.

This module provides functions for integrating with the Tool Manager component,
including tool discovery, synchronization, and error reporting.
"""

from typing import Any
from uuid import UUID

import structlog
from langchain_core.tools import BaseTool

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
from nexus.core.config.base import get_settings
from nexus.tool_manager.lib.providers.factory import ProviderFactory, get_provider_factory
from nexus.tool_manager.models.tool import ToolStatus, ToolWithParameters
from nexus.tool_manager.models.tool_provider import ProviderStatus, ToolProviderWithConfiguration

logger = structlog.stdlib.get_logger(__name__)


async def _discover_tool_providers() -> list[ToolProviderWithConfiguration]:
    """Discover tool providers from Tool Manager.

    Fetches all tool providers from the Tool Manager API.

    Returns:
        List of all tool providers.
        Returns empty list if Tool Manager is unavailable or fails.

    """
    settings = get_settings()

    try:
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            all_providers = await client.get_all_tool_providers()
            logger.info("Discovered Tool Providers", provider_count=len(all_providers))
            return all_providers
    except Exception as e:  # noqa: BLE001 (Failure of ToolManagerClient for whatever reason is not critical)
        logger.warning("Tool Manager failed, continuing without tool providers", error=str(e))
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


def _should_skip_provider(provider: ToolProviderWithConfiguration) -> bool:
    """Check if provider should be skipped due to missing configuration."""
    if not provider.configuration:
        logger.warning("Skipping provider: no configuration", provider_name=provider.name)
        return True
    return False


def _should_retry_disabled_provider(provider: ToolProviderWithConfiguration) -> bool:
    """Check if a disabled provider should be retried for re-enablement.

    Only retry providers that are:
    - disabled (enabled=False)
    - AND in ERROR state (status=ERROR)

    This avoids overriding user-intentionally disabled providers.
    """
    return not provider.enabled and provider.status == ProviderStatus.ERROR


def _is_provider_type_supported(provider: ToolProviderWithConfiguration, provider_factory: ProviderFactory) -> bool:
    """Check if provider type is supported by the factory."""
    provider_type = provider.configuration.provider_type
    if not provider_factory.is_registered(provider_type):
        supported_types = provider_factory.get_registered_provider_types()
        logger.warning(
            "Skipping provider with unsupported type",
            provider_name=provider.name,
            provider_type=provider_type,
            supported_types=supported_types,
        )
        return False
    return True


def _prepare_config_params(provider: ToolProviderWithConfiguration) -> dict[str, Any]:
    """Prepare configuration parameters for provider adapter creation."""
    config_params = {k: v for k, v in provider.configuration.model_dump().items() if k != "provider_type"}
    config_params["provider_id"] = provider.id
    config_params["provider_name"] = provider.name
    return config_params


def _create_namespaced_tools(
    provider: ToolProviderWithConfiguration, provider_tools: list[BaseTool]
) -> list[NamespacedBaseTool]:
    """Create namespaced tools from provider tools."""
    namespaced_tools = []
    for tool in provider_tools:
        namespaced_name = f"{provider.name}::{tool.name}"
        namespaced_tools.append((namespaced_name, tool))
    return namespaced_tools


async def _handle_provider_errors(provider: ToolProviderWithConfiguration, error: Exception) -> None:
    """Handle different types of provider errors with appropriate logging and provider disabling."""
    # Log the error appropriately based on type
    if isinstance(error, (ConnectionError, TimeoutError)):
        logger.warning(
            "Failed to get tools from provider, disabling provider", provider_name=provider.name, error=str(error)
        )
        validation_error = f"Connection/timeout error: {error}"
    elif isinstance(error, OSError):
        logger.warning(
            "Network/system error from provider, disabling provider", provider_name=provider.name, error=str(error)
        )
        validation_error = f"Network/system error: {error}"
    elif isinstance(error, RuntimeError):
        logger.warning(
            "Unexpected error from provider, disabling provider", provider_name=provider.name, error=str(error)
        )
        validation_error = f"Runtime error: {error}"
    elif isinstance(error, ValueError):
        logger.warning(
            "Invalid configuration for provider, disabling provider", provider_name=provider.name, error=str(error)
        )
        validation_error = f"Invalid configuration: {error}"
    else:
        logger.exception("Unexpected error processing provider, disabling provider", provider_name=provider.name)
        validation_error = f"Unexpected error: {error}"

    # Disable the provider and set error status using ToolManagerClient
    settings = get_settings()
    try:
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            await client.update_tool_provider_status(
                provider_id=provider.id,
                status=ProviderStatus.ERROR,
                validation_error=validation_error,
            )
            logger.info("Disabled provider due to error", provider_name=provider.name)
    except Exception:
        logger.exception("Failed to disable provider via ToolManagerClient", provider_name=provider.name)


async def _handle_provider_re_enablement(provider: ToolProviderWithConfiguration) -> None:
    """Re-enable a previously disabled provider that is now working.

    Sets enabled=True, status=AVAILABLE, and clears validation_error.
    """
    settings = get_settings()
    try:
        async with ToolManagerClient(
            base_url=str(settings.tool_manager_base_url),
            timeout=settings.tool_manager_timeout_seconds,
            max_connections=settings.tool_manager_max_connections,
            max_keepalive_connections=settings.tool_manager_max_keepalive_connections,
        ) as client:
            await client.update_tool_provider_status(
                provider_id=provider.id,
                status=ProviderStatus.AVAILABLE,
                validation_error=None,
            )
            logger.info("Re-enabled previously disabled provider", provider_name=provider.name)
    except Exception:
        logger.exception("Failed to re-enable provider via ToolManagerClient", provider_name=provider.name)


async def _process_single_provider(
    provider: ToolProviderWithConfiguration,
    provider_factory: ProviderFactory,
) -> list[NamespacedBaseTool]:
    """Process a single provider and return its namespaced tools.

    For enabled providers: Attempt connection, disable on failure.
    For disabled ERROR providers: Retry connection, re-enable on success.
    For disabled AVAILABLE providers: Skip (user-intentionally disabled).
    """
    if _should_skip_provider(provider):
        return []

    if not _is_provider_type_supported(provider, provider_factory):
        return []

    # Skip disabled providers unless they're in ERROR state (eligible for retry)
    if not provider.enabled and not _should_retry_disabled_provider(provider):
        logger.debug("Skipping disabled provider", provider_name=provider.name, provider_status=provider.status.value)
        return []

    try:
        config_params = _prepare_config_params(provider)
        provider_type = provider.configuration.provider_type

        adapter = provider_factory.create_provider_instance(provider_type, **config_params)
        provider_tools = await adapter.get_base_tools()

        namespaced_tools = _create_namespaced_tools(provider, provider_tools)
        logger.info("Retrieved tools from provider", tool_count=len(provider_tools), provider_name=provider.name)

        # If this was a disabled ERROR provider that succeeded, re-enable it
        if _should_retry_disabled_provider(provider):
            await _handle_provider_re_enablement(provider)

        return namespaced_tools

    except (OSError, RuntimeError, ValueError) as e:
        # Only disable if provider was enabled (don't update status for failed retries)
        if provider.enabled:
            await _handle_provider_errors(provider, e)
        else:
            logger.debug("Retry failed for disabled provider", provider_name=provider.name, error=str(e))
        return []
    except Exception as e:  # noqa: BLE001 (Handle any unexpected provider errors gracefully)
        # Only disable if provider was enabled (don't update status for failed retries)
        if provider.enabled:
            await _handle_provider_errors(provider, e)
        else:
            logger.debug("Retry failed for disabled provider", provider_name=provider.name, error=str(e))
        return []


async def _retrieve_base_tools_from_providers(
    all_providers: list[ToolProviderWithConfiguration],
) -> list[NamespacedBaseTool]:
    """Retrieve BaseTools from providers using ProviderFactory pattern.

    Processes all providers (enabled and disabled). For disabled providers in ERROR state,
    attempts to retry connection to potentially re-enable them.

    Args:
        all_providers: List of all tool providers (enabled and disabled)

    Returns:
        List of NamespacedTool containing (namespaced_name, BaseTool) retrieved from providers

    """
    namespaced_tools: list[NamespacedBaseTool] = []

    async for provider_factory in get_provider_factory():
        for provider in all_providers:
            provider_tools = await _process_single_provider(provider, provider_factory)
            namespaced_tools.extend(provider_tools)
        break  # Exit the async generator after first iteration

    logger.info(
        "Retrieved total tools from providers",
        total_tool_count=len(namespaced_tools),
        provider_count=len(all_providers),
    )
    return namespaced_tools


def _filter_enabled_tools(
    namespaced_tools: list[NamespacedBaseTool],
    enabled_tools: list[ToolWithParameters],
) -> list[NamespacedBaseTool]:
    """Filter NamespacedBaseTools by enabled status using namespaced_name.

    Args:
        namespaced_tools: List of NamespacedTool from providers
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
        namespaced_tools: List of NamespacedTool from providers
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
        namespaced_tools: List of NamespacedTool from providers
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
        namespaced_tools: List of NamespacedTool from providers
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

    def __init__(self, invocation_id: UUID) -> None:
        """Initialize the tool synchronizer.

        Args:
            invocation_id: Unique identifier for this synchronization session

        """
        self.invocation_id = invocation_id
        self.all_providers: list[ToolProviderWithConfiguration] = []
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

        try:
            # Step 1: Discover tools and providers from Tool Manager
            self.all_providers = await _discover_tool_providers()
            self.enabled_tools, self.disabled_tools = await _discover_tools()

            # Step 2: Process all providers and retrieve BaseTools
            self.namespaced_tools = await _retrieve_base_tools_from_providers(self.all_providers)

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
            return enhanced_tools

        except Exception:
            # Don't fail the entire execution if tool sync fails
            logger.exception("Tool synchronization failed", invocation_id=self.invocation_id)
            return []
