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
    """Create test credential. Returns ``(credential_id, credential_name)``."""
    created_credential_id = None
    test_api = None

    def _create_credential(
        api: NexusApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        type_id: UUID | None = None,
    ) -> tuple[UUID, str, dict[str, Any]]:
        """Create an HTTP Bearer Token credential. Returns ``(credential_id, name)``."""
        prefx = prefix or "test"
        credential_name = name or unique_name(f"e2e-rbac-cred-{prefx}")
        cred_type_id = type_id or get_bearer_token_type_id(api)
        resp = api.credentials.create(
            body=CredentialCreate(
                name=credential_name,
                credential_type_id=cred_type_id,
                project_id=project_id,
                inputs=CredentialCreateInputs.from_dict({"token": f"test-{name}"}),
            ),
        )
        cred = resp.assert_and_get()
        nonlocal test_api, created_credential_id
        test_api = api
        created_credential_id = UUID(str(cred.id))
        return created_credential_id, str(cred.name), cred.to_dict()

    yield _create_credential

    # delete user
    if created_credential_id is not None and test_api is not None:
        try:
            test_api.credentials.delete(credential_id=created_credential_id)
        except Exception:
            pass  # Best effort cleanup
