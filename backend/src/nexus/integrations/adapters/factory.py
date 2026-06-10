"""Health check adapter factory.

Maps IntegrationType to adapter constructors. Concrete adapters register
themselves here; the service layer calls create_health_check_adapter() to
dispatch by integration type.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from nexus.integrations.exceptions import AdapterNotRegisteredError

if TYPE_CHECKING:
    from collections.abc import Callable

    from nexus.integrations.adapters.protocol import IntegrationHealthCheckAdapter
    from nexus.integrations.models.integration import IntegrationType
    from nexus.integrations.models.integration_configuration import (
        IntegrationConfigurationTypes,
    )

_ADAPTER_REGISTRY: dict[
    str,
    Callable[[Any], IntegrationHealthCheckAdapter],
] = {}


def register_health_check_adapter(
    integration_type: IntegrationType,
    constructor: Callable[[Any], IntegrationHealthCheckAdapter],
) -> None:
    """Register a health check adapter constructor for an integration type.

    Called by each adapter module at import time or during app startup.
    Raises ValueError if the type is already registered.
    """
    if integration_type in _ADAPTER_REGISTRY:
        msg = f"Health check adapter already registered for {integration_type}"
        raise ValueError(msg)
    _ADAPTER_REGISTRY[integration_type] = constructor


def create_health_check_adapter(
    integration_type: IntegrationType,
    configuration: IntegrationConfigurationTypes,
) -> IntegrationHealthCheckAdapter:
    """Create a health check adapter for the given integration type.

    The factory looks up the registered constructor and calls it with the
    integration's configuration. The caller is responsible for passing the
    correct configuration type for the integration type — this is guaranteed
    by IntegrationCreate.validate_type_matches_configuration() at the API
    boundary and the JSONB discriminator at the database layer.

    Raises AdapterNotRegisteredError if no adapter is registered for the type.
    """
    constructor = _ADAPTER_REGISTRY.get(integration_type)
    if constructor is None:
        raise AdapterNotRegisteredError(str(integration_type))
    return constructor(configuration)


def _clear_registry() -> None:
    """Clear the adapter registry. For testing only."""
    _ADAPTER_REGISTRY.clear()
