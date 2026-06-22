"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol
from uuid import UUID

import pytest
from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs

from tests.e2e.conftest import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry


def get_bearer_token_type_id(api: NexusApiRegistry) -> UUID:
    """Retrieve bearer token id."""
    resp = api.credentials.list_types()
    assert resp.is_success
    assert resp.parsed is not None
    for ct in resp.parsed.resources:
        if ct.name == "HTTP Bearer Token":
            return UUID(str(ct.id))
    pytest.fail("Preseeded 'HTTP Bearer Token' credential type not found")


class CredentialFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self,
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        type_id: UUID | None = None,
    ) -> tuple[UUID, str, dict[str, Any]]: ...


@pytest.fixture(scope="module")
def create_credential() -> Generator[CredentialFactory, None, None]:
    """Create test credential. Returns ``(credential_id, credential_name, credential_dict)``."""
    created: list[tuple[NexusApiRegistry, UUID]] = []

    def _create_credential(
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        type_id: UUID | None = None,
    ) -> tuple[UUID, str, dict[str, Any]]:
        """Create an HTTP Bearer Token credential. Returns ``(credential_id, name, dict)``."""
        prefx = prefix or "test"
        credential_name = name or unique_name(f"e2e-rbac-cred-{prefx}")
        cred_type_id = type_id or get_bearer_token_type_id(api)
        resp = api.credentials.create(
            body=CredentialCreate(
                name=credential_name,
                credential_type_id=cred_type_id,
                project_id=project_id,
                inputs=CredentialCreateInputs.from_dict({"token": f"test-{credential_name}"}),
            ),
        )
        cred = resp.assert_and_get()
        cred_id = UUID(str(cred.id))
        created.append((api, cred_id))
        return cred_id, str(cred.name), cred.to_dict()

    yield _create_credential

    for api, cred_id in created:
        try:
            api.credentials.delete(credential_id=cred_id)
        except Exception:
            pass
