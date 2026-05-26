"""Keycloak helpers for group-claim OIDC E2E tests."""

from __future__ import annotations

from typing import cast

import httpx

from tests.fixtures.external_services.keycloak import (
    _CLIENT_ID,
    _REALM,
    _get_admin_token,
    _get_realm_user_id,
)


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


def ensure_groups_claim_mapper(keycloak_url: str) -> None:
    """Ensure the nexus OIDC client emits a ``groups`` claim in ID and access tokens."""
    client_uuid = _get_client_uuid(keycloak_url)
    headers = _admin_headers(keycloak_url)
    mappers_resp = httpx.get(
        f"{keycloak_url}/admin/realms/{_REALM}/clients/{client_uuid}/protocol-mappers/models",
        headers=headers,
        verify=False,  # noqa: S501
        timeout=30,
    )
    mappers_resp.raise_for_status()
    existing = cast("list[dict[str, object]]", mappers_resp.json())
    if any(m.get("name") == "nexus-groups-mapper" for m in existing):
        return

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
