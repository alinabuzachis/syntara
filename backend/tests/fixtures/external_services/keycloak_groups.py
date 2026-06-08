"""Keycloak helpers for group-claim and user-attribute OIDC E2E tests."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, cast

import httpx
import pytest

if TYPE_CHECKING:
    from external_services.types import HttpApiService

from tests.fixtures.external_services.keycloak import (
    _CLIENT_ID,
    _REALM,
    _get_admin_token,
    _get_realm_user_id,
)

logger = logging.getLogger(__name__)


def _admin_headers(keycloak_url: str) -> dict[str, str]:
    token = _get_admin_token(keycloak_url)
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _get_client_uuid(keycloak_url: str) -> str:
    headers = _admin_headers(keycloak_url)
    resp = httpx.get(
        f"{keycloak_url}/admin/realms/{_REALM}/clients",
        params={"clientId": _CLIENT_ID},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    resp.raise_for_status()
    clients = resp.json()
    if not clients:
        msg = f"Keycloak client {_CLIENT_ID!r} not found in realm {_REALM!r}"
        raise RuntimeError(msg)
    return str(clients[0]["id"])


def _list_protocol_mappers(keycloak_url: str, client_uuid: str) -> list[dict[str, object]]:
    headers = _admin_headers(keycloak_url)
    resp = httpx.get(
        f"{keycloak_url}/admin/realms/{_REALM}/clients/{client_uuid}/protocol-mappers/models",
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    resp.raise_for_status()
    return cast("list[dict[str, object]]", resp.json())


def ensure_unmanaged_attributes_enabled(keycloak_url: str) -> None:
    """Allow custom user attributes on the nexus realm (required for API-15 claim mapping).

    Keycloak 24+ disables unmanaged attributes by default, so protocol mappers cannot read
    admin-set attributes like ``department`` until this policy is enabled.
    """
    headers = _admin_headers(keycloak_url)
    profile_resp = httpx.get(
        f"{keycloak_url}/admin/realms/{_REALM}/users/profile",
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if profile_resp.status_code == 404:
        return
    profile_resp.raise_for_status()
    profile = profile_resp.json()
    if profile.get("unmanagedAttributePolicy") == "ENABLED":
        return
    profile["unmanagedAttributePolicy"] = "ENABLED"
    update_resp = httpx.put(
        f"{keycloak_url}/admin/realms/{_REALM}/users/profile",
        json=profile,
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    update_resp.raise_for_status()


def ensure_groups_claim_mapper(keycloak_url: str) -> None:
    """Ensure the nexus OIDC client emits a ``groups`` claim in ID and access tokens."""
    client_uuid = _get_client_uuid(keycloak_url)
    existing = _list_protocol_mappers(keycloak_url, client_uuid)
    if any(m.get("name") == "nexus-groups-mapper" for m in existing):
        return

    headers = _admin_headers(keycloak_url)
    resp = httpx.post(
        f"{keycloak_url}/admin/realms/{_REALM}/clients/{client_uuid}/protocol-mappers/models",
        json={
            "name": "nexus-groups-mapper",
            "protocol": "openid-connect",
            "protocolMapper": "oidc-group-membership-mapper",
            "config": {
                "full.path": "false",
                "id.token.claim": "true",
                "access.token.claim": "true",
                "claim.name": "groups",
                "userinfo.token.claim": "true",
            },
        },
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if resp.status_code not in (201, 409):
        resp.raise_for_status()


def _delete_protocol_mapper(keycloak_url: str, client_uuid: str, mapper_id: str) -> None:
    headers = _admin_headers(keycloak_url)
    resp = httpx.delete(
        f"{keycloak_url}/admin/realms/{_REALM}/clients/{client_uuid}/protocol-mappers/models/{mapper_id}",
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if resp.status_code not in (204, 404):
        resp.raise_for_status()


def ensure_user_attribute_claim_mapper(keycloak_url: str, *, attribute: str, claim_name: str) -> None:
    """Map a Keycloak user attribute into an OIDC claim (for claim-based group mapping tests).

    Recreates the mapper when it already exists so shared Keycloak instances always get a
    known-good configuration (idempotent create alone can leave a stale mapper behind).
    """
    client_uuid = _get_client_uuid(keycloak_url)
    mapper_name = f"nexus-{attribute}-claim"
    existing = _list_protocol_mappers(keycloak_url, client_uuid)
    headers = _admin_headers(keycloak_url)
    for mapper in existing:
        if mapper.get("name") == mapper_name:
            mapper_id = mapper.get("id")
            if isinstance(mapper_id, str):
                _delete_protocol_mapper(keycloak_url, client_uuid, mapper_id)
            break

    resp = httpx.post(
        f"{keycloak_url}/admin/realms/{_REALM}/clients/{client_uuid}/protocol-mappers/models",
        json={
            "name": mapper_name,
            "protocol": "openid-connect",
            "protocolMapper": "oidc-usermodel-attribute-mapper",
            "config": {
                "user.attribute": attribute,
                "claim.name": claim_name,
                "jsonType.label": "String",
                "multivalued": "true",
                "aggregate.attrs": "false",
                "id.token.claim": "true",
                "access.token.claim": "true",
                "userinfo.token.claim": "true",
            },
        },
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if resp.status_code not in (201, 409):
        resp.raise_for_status()


def create_keycloak_group(keycloak_url: str, group_name: str) -> str:
    """Create a realm group and return its Keycloak group id."""
    headers = _admin_headers(keycloak_url)
    resp = httpx.post(
        f"{keycloak_url}/admin/realms/{_REALM}/groups",
        json={"name": group_name},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if resp.status_code not in (201, 409):
        resp.raise_for_status()

    search = httpx.get(
        f"{keycloak_url}/admin/realms/{_REALM}/groups",
        params={"search": group_name, "exact": "true"},
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    search.raise_for_status()
    groups = search.json()
    if not groups:
        msg = f"Keycloak group {group_name!r} not found after create"
        raise RuntimeError(msg)
    return str(groups[0]["id"])


def set_keycloak_user_attributes(
    keycloak_url: str,
    username: str,
    attributes: dict[str, list[str]],
) -> None:
    """Set custom attributes on a Keycloak user."""
    headers = _admin_headers(keycloak_url)
    user_id = _get_realm_user_id(keycloak_url, username)
    user_resp = httpx.get(
        f"{keycloak_url}/admin/realms/{_REALM}/users/{user_id}",
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    user_resp.raise_for_status()
    user_body = user_resp.json()
    merged_attrs = dict(user_body.get("attributes") or {})
    merged_attrs.update(attributes)
    user_body["attributes"] = merged_attrs
    patch_resp = httpx.put(
        f"{keycloak_url}/admin/realms/{_REALM}/users/{user_id}",
        json=user_body,
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    patch_resp.raise_for_status()


def add_keycloak_user_to_group(keycloak_url: str, username: str, group_name: str) -> None:
    """Add a Keycloak user to a realm group by group name."""
    headers = _admin_headers(keycloak_url)
    user_id = _get_realm_user_id(keycloak_url, username)
    group_id = create_keycloak_group(keycloak_url, group_name)
    resp = httpx.put(
        f"{keycloak_url}/admin/realms/{_REALM}/users/{user_id}/groups/{group_id}",
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    if resp.status_code not in (204, 409):
        resp.raise_for_status()


@pytest.fixture
def keycloak_service_with_group_mapping(keycloak_service: HttpApiService) -> HttpApiService:
    """Keycloak service configured for IdP group-mapping E2E tests (groups claim + user attributes)."""
    base_url = keycloak_service.url
    ensure_unmanaged_attributes_enabled(base_url)
    ensure_groups_claim_mapper(base_url)
    return keycloak_service
