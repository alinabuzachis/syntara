"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.oidc_configuration import OIDCConfiguration


class IdentityProviderFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(self, api: NexusApiRegistry, name: str, configuration: OIDCConfiguration) -> Any: ...  # noqa: ANN401


@pytest.fixture(scope="module")
def identity_provider_factory() -> Generator[IdentityProviderFactory, None, None]:
    """Factory that creates identity providers with automatic cleanup.

    Eliminates try/finally blocks by tracking created providers and cleaning up
    automatically on test teardown. Use this instead of manual create/delete.

    Usage:
        def test_something(identity_provider_factory):
            provider = identity_provider_factory(
                nexus_api,
                name="test-provider",
                configuration=OIDCConfiguration(...),
            )
            # Use provider.id
            # Cleanup happens automatically

    Args:
        nexus_api: Admin API client for creating providers
        nexus_base_url: Base URL for redirect URI construction

    Returns:
        Factory function that creates and tracks identity providers

    """
    created_provider_ids: list[UUID] = []
    test_api = None

    def _create(api: NexusApiRegistry, name: str, configuration: OIDCConfiguration) -> Any:  # noqa: ANN401
        provider = api.identity_providers.create(
            body=IdentityProviderCreate(name=name, configuration=configuration)
        ).assert_and_get()
        nonlocal test_api
        test_api = api
        created_provider_ids.append(UUID(str(provider.id)))
        return provider

    yield _create

    if test_api is not None:
        for provider_id in created_provider_ids:
            try:
                test_api.identity_providers.delete(provider_id=provider_id)
            except Exception:
                pass
