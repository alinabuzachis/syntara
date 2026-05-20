"""Helper functions for OIDC authentication and authorization."""

import re
from http import HTTPStatus
from typing import Any, cast
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import httpx
from bs4 import BeautifulSoup
from nexus_api_client import AuthenticatedClient, Client
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.api.authentication.refresh_token import sync_detailed as refresh_sync
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate
from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
from nexus_api_client.models.oidc_configuration import OIDCConfiguration


def _has_forms(content: bytes) -> bool:
    soup = BeautifulSoup(content)
    forms = soup.find_all("form")
    return len(forms) > 0


def _submit_form(
    client: httpx.Client,
    content: bytes,
    *,
    pass_creds: bool = True,
    username: str | None = None,
    password: str | None = None,
) -> httpx.Response:
    soup = BeautifulSoup(content, "html.parser")
    forms = soup.find_all("form")
    form = forms[0]
    form_data: dict[str, Any] = {}

    for an_input in form.find_all("input"):
        if an_input.get("name", None):
            form_data[str(an_input["name"])] = an_input.get("value", None)
    if pass_creds:
        form_data["username"] = username
        form_data["password"] = password

    return client.post(str(form["action"]), data=form_data, follow_redirects=False)


def _describe_redirect_error(status_code: int) -> str:
    if 400 <= status_code < 500:
        return "client-side issue (invalid parameters, bad request, auth failure)"
    if 500 <= status_code < 600:
        return "server-side issue (identity provider error or unavailable)"
    return "unexpected error"


def _describe_direct_error(status_code: int) -> str:
    if status_code in (502, 503, 504):
        return (
            "Infrastructure issue. Worker may have been killed or timed out during authentication. "
            "Check nginx/uWSGI layer and backend Keycloak logs."
        )
    if status_code == 500:
        return "Nexus internal server error"
    if 400 <= status_code < 500:
        return "Client error (bad request, authentication required, or forbidden)"
    return "Unexpected error"


def _idp_form_user_login(
    client: httpx.Client, login_url: str, username: str | None = None, password: str | None = None
) -> httpx.Response:
    try:
        idp_resp = client.get(login_url, follow_redirects=True)
    except (httpx.ConnectError, httpx.TimeoutException) as e:
        msg = (
            f"Failed to connect during login flow.\n"
            f"URL: {login_url}\n"
            f"Error: {type(e).__name__}: {e!s}\n"
            f"Infrastructure issue: Network connectivity issue or nginx/Nexus infrastructure is unreachable."
        )
        raise RuntimeError(msg) from e

    if not httpx.codes.is_success(idp_resp.status_code):
        response_preview = idp_resp.text

        if idp_resp.history:
            likely_cause = _describe_redirect_error(status_code=idp_resp.status_code)

            msg = (
                f"Nexus redirect succeeded, but identity provider returned error.\n"
                f"Initial URL: {login_url}\n"
                f"Final URL: {idp_resp.url}\n"
                f"Status code: {idp_resp.status_code}\n"
                f"Likely cause: {likely_cause}\n"
                f"Response preview: {response_preview}"
            )
            raise RuntimeError(msg)
        likely_cause = _describe_direct_error(status_code=idp_resp.status_code)

        msg = (
            f"Nexus directly returned error without redirect.\n"
            f"URL: {login_url}\n"
            f"Status code: {idp_resp.status_code}\n"
            f"Likely cause: {likely_cause}\n"
            f"Response preview: {response_preview}"
        )
        raise RuntimeError(msg)

    if _has_forms(idp_resp.content):
        oidc_resp = _submit_form(client=client, content=idp_resp.content, username=username, password=password)
        if oidc_resp.status_code not in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT):
            msg = f"Unable to login with idp. Status_code: {oidc_resp.status_code}"
            raise RuntimeError(msg)
        return oidc_resp
    return idp_resp


def create_oidc_identity_provider(
    nexus_api: NexusApiRegistry, oidc_config: OIDCConfiguration
) -> IdentityProviderResponse:
    """Create an OIDC identity provider."""
    create_resp = nexus_api.identity_providers.create(
        body=IdentityProviderCreate(
            name=f"e2e-oidc-provider-{uuid4().hex[:8]}",
            configuration=oidc_config,
        )
    )
    if create_resp.status_code != HTTPStatus.CREATED:
        msg = "Unable to create OIDC identity provider."
        raise RuntimeError(msg)
    provider = create_resp.parsed
    if provider is None:
        msg = "Unable to create OIDC identity provider."
        raise RuntimeError(msg)
    return cast("IdentityProviderResponse", provider)


def create_oidc_auth_client(
    nexus_base_url: str,
    nexus_api: NexusApiRegistry,
    oidc_provider_id: UUID,
    username: str | None = None,
    password: str | None = None,
) -> "AuthenticatedClient":
    """Create an OIDC IdP authenticated client."""
    auth_resp = nexus_api.authentication.oidc_authorize(provider_id=oidc_provider_id)

    if auth_resp.status_code not in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT):
        msg = "Unable to login with OIDC authorization."
        raise RuntimeError(msg)

    oidc_auth_url = auth_resp.headers["location"]
    client = httpx.Client(
        verify=False,  # noqa: S501
        follow_redirects=True,
    )
    idp_resp = _idp_form_user_login(client=client, login_url=oidc_auth_url, username=username, password=password)
    idp_parsed = urlparse(idp_resp.headers["Location"])
    query_params = parse_qs(idp_parsed.query)

    oidc_callback_resp = nexus_api.authentication.oidc_callback(
        state=query_params["state"][0], code=query_params["code"][0]
    )
    if oidc_callback_resp.status_code != HTTPStatus.FOUND:
        msg = "Unable to login with OIDC authorization."
        raise RuntimeError(msg)

    set_cookie = oidc_callback_resp.headers["set-cookie"]
    cookie_match = re.search(r"ao_refresh_token=([^;]+)", set_cookie)
    if cookie_match is None:
        msg = "Unable to find refresh token in response cookies."
        raise RuntimeError(msg)
    refresh_token = cookie_match.group(1)
    refresh_token_client = Client(
        base_url=f"{nexus_base_url}/api/v1", cookies={"ao_refresh_token": refresh_token}, verify_ssl=False
    )
    refresh_resp = refresh_sync(client=refresh_token_client)
    if refresh_resp.status_code != HTTPStatus.OK:
        msg = "Unable to login with OIDC authorization."
        raise RuntimeError(msg)

    parsed = refresh_resp.parsed
    if not isinstance(parsed, AccessTokenResponse):
        msg = "Unable to login with OIDC authorization."
        raise RuntimeError(msg)  # noqa: TRY004
    access_token = parsed.access_token
    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token=access_token, verify_ssl=False)
