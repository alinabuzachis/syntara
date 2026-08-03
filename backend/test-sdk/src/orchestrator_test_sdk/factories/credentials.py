"""Reusable factory helpers and pytest fixtures for E2E resource creation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol
from uuid import UUID

import pytest
from syntara_api_client.models.credential_create import CredentialCreate
from syntara_api_client.models.credential_create_inputs import CredentialCreateInputs

from orchestrator_test_sdk.e2e import unique_name

if TYPE_CHECKING:
    from collections.abc import Generator

    from syntara_api_client.api import SyntaraApiRegistry


def _get_credential_type_id(api: SyntaraApiRegistry, name: str) -> UUID:
    """Retrieve credential type id by name."""
    resp = api.credentials.list_types()
    assert resp.is_success
    assert resp.parsed is not None
    for ct in resp.parsed.resources:
        if ct.name == name:
            return UUID(str(ct.id))
    pytest.fail(f"Preseeded '{name}' credential type not found")


def get_bearer_token_type_id(api: SyntaraApiRegistry) -> UUID:
    """Retrieve bearer token credential type id."""
    return _get_credential_type_id(api, "HTTP Bearer Token")


def get_basic_auth_type_id(api: SyntaraApiRegistry) -> UUID:
    """Retrieve basic auth credential type id."""
    return _get_credential_type_id(api, "HTTP Basic Auth")


class CredentialFactory(Protocol):
    """Protocol ensuring type safety for optional and keyword arguments on the factory."""

    def __call__(
        self,
        api: SyntaraApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        type_id: UUID | None = None,
        inputs: dict[str, Any] | None = None,
    ) -> tuple[UUID, str, dict[str, Any], str]: ...


@pytest.fixture(scope="module")
def create_credential() -> Generator[CredentialFactory, None, None]:
    """Create test credential. Returns ``(credential_id, credential_name, credential_dict, plaintext_secret)``."""
    created: list[tuple[SyntaraApiRegistry, UUID]] = []

    def _create_credential(
        api: SyntaraApiRegistry,
        project_id: UUID,
        prefix: str | None = None,
        name: str | None = None,
        type_id: UUID | None = None,
        inputs: dict[str, Any] | None = None,
    ) -> tuple[UUID, str, dict[str, Any], str]:
        prefx = prefix or "test"
        credential_name = name or unique_name(f"e2e-rbac-cred-{prefx}")
        plaintext_secret = f"test-{credential_name}"
        cred_type_id = type_id or get_bearer_token_type_id(api)
        cred_inputs = inputs or {"token": plaintext_secret}
        resp = api.credentials.create(
            body=CredentialCreate(
                name=credential_name,
                credential_type_id=cred_type_id,
                project_id=project_id,
                inputs=CredentialCreateInputs.from_dict(cred_inputs),
            ),
        )
        cred = resp.assert_and_get()
        cred_id = UUID(str(cred.id))
        created.append((api, cred_id))
        return cred_id, str(cred.name), cred.to_dict(), plaintext_secret

    yield _create_credential

    for api, cred_id in created:
        try:
            api.credentials.delete(credential_id=cred_id)
        except Exception:
            pass
