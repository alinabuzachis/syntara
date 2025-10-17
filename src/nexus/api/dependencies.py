"""FastAPI dependencies for nexus.api."""

from typing import Annotated, cast

from fastapi import Depends, Request

from nexus.tool_manager.lib.providers.factory import ProviderFactory


def get_provider_factory(request: Request) -> ProviderFactory:
    """Get the provider factory from application state.

    Args:
        request: FastAPI request object

    Returns:
        ProviderFactory: The application-scoped factory instance

    Raises:
        RuntimeError: If factory is not initialized in app.state

    """
    if not hasattr(request.app.state, "provider_factory"):
        msg = "Provider factory not initialized. Ensure FastAPI app startup has completed."
        raise RuntimeError(msg)
    return cast("ProviderFactory", request.app.state.provider_factory)


# Type alias for dependency injection
ProviderFactoryDep = Annotated[ProviderFactory, Depends(get_provider_factory)]
