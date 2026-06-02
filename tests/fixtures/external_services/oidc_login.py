"""Helper functions for OIDC authentication and authorization."""

import logging
import re
import time
from http import HTTPStatus
from typing import Any, cast
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import httpx
from bs4 import BeautifulSoup
from nexus_api_client import AuthenticatedClient
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate
from nexus_api_client.models.identity_provider_response import IdentityProviderResponse
from nexus_api_client.models.oidc_configuration import OIDCConfiguration

from tests.e2e.conftest import refresh_with_cookies

logger = logging.getLogger(__name__)

_OIDC_CLIENT_TIMEOUT = httpx.Timeout(60.0)
_OIDC_LOGIN_MAX_RETRIES = 3
_OIDC_LOGIN_RETRY_DELAY = 5.0


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
    last_error: Exception | None = None
    for attempt in range(1, _OIDC_LOGIN_MAX_RETRIES + 1):
        try:
            return _idp_form_user_login_attempt(client, login_url, username=username, password=password)
        except (httpx.ConnectError, httpx.TimeoutException) as e:
            last_error = e
            if attempt < _OIDC_LOGIN_MAX_RETRIES:
                logger.warning(
                    "OIDC login attempt %d/%d failed (%s), retrying in %.0fs",
                    attempt,
                    _OIDC_LOGIN_MAX_RETRIES,
                    type(e).__name__,
                    _OIDC_LOGIN_RETRY_DELAY,
                )
                time.sleep(_OIDC_LOGIN_RETRY_DELAY)

    msg = (
        f"Failed to connect during login flow after {_OIDC_LOGIN_MAX_RETRIES} attempts.\n"
        f"URL: {login_url}\n"
        f"Error: {type(last_error).__name__}: {last_error!s}\n"
        f"Infrastructure issue: Network connectivity issue or nginx/Nexus infrastructure is unreachable."
    )
    raise RuntimeError(msg) from last_error


def _idp_form_user_login_attempt(
    client: httpx.Client, login_url: str, username: str | None = None, password: str | None = None
) -> httpx.Response:
    idp_resp = client.get(login_url, follow_redirects=True)

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


def create_oidc_login_session(
    nexus_base_url: str,
    nexus_api: NexusApiRegistry,
    oidc_provider_id: UUID,
    username: str | None = None,
    password: str | None = None,
) -> tuple[str, dict[str, str]]:
    """Complete OIDC login and return (access_token, refresh_token cookies)."""
    auth_resp = nexus_api.authentication.oidc_authorize(provider_id=oidc_provider_id)

    if auth_resp.status_code not in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT):
        msg = "Unable to login with OIDC authorization."
        raise RuntimeError(msg)

    oidc_auth_url = auth_resp.headers["location"]
    client = httpx.Client(
        verify=False,  # noqa: S501
        follow_redirects=True,
        timeout=_OIDC_CLIENT_TIMEOUT,
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

    location = oidc_callback_resp.headers.get("location", "")
    set_cookie = oidc_callback_resp.headers.get("set-cookie")
    if not set_cookie:
        if "auth_error" in location:
            callback_parsed = urlparse(location)
            auth_errors = parse_qs(callback_parsed.query).get("auth_error", [])
            auth_detail = auth_errors[0] if auth_errors else location
            msg = f"OIDC login denied: {auth_detail}"
            raise RuntimeError(msg)
        msg = f"OIDC callback missing session cookie; location={location!r}"
        raise RuntimeError(msg)
    cookie_match = re.search(r"ao_refresh_token=([^;]+)", set_cookie)
    if cookie_match is None:
        msg = "Unable to find refresh token in response cookies."
        raise RuntimeError(msg)
    csrf_match = re.search(r"ao_csrf_token=([^;]+)", set_cookie)
    if csrf_match is None:
        msg = "Unable to find CSRF token in response cookies."
        raise RuntimeError(msg)

    cookies = {
        "ao_refresh_token": cookie_match.group(1),
        "ao_csrf_token": csrf_match.group(1),
    }
    refresh_resp = refresh_with_cookies(nexus_base_url, cookies)
    if refresh_resp.status_code != HTTPStatus.OK:
        msg = "Unable to login with OIDC authorization."
        raise RuntimeError(msg)

    parsed = refresh_resp.parsed
    if not isinstance(parsed, AccessTokenResponse):
        msg = "Unable to login with OIDC authorization."
        raise RuntimeError(msg)  # noqa: TRY004
    return parsed.access_token, cookies


def create_oidc_auth_client(
    nexus_base_url: str,
    nexus_api: NexusApiRegistry,
    oidc_provider_id: UUID,
    username: str | None = None,
    password: str | None = None,
) -> "AuthenticatedClient":
    """Create an OIDC IdP authenticated client."""
    access_token, _refresh_cookies = create_oidc_login_session(
        nexus_base_url=nexus_base_url,
        nexus_api=nexus_api,
        oidc_provider_id=oidc_provider_id,
        username=username,
        password=password,
    )
    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token=access_token, verify_ssl=False)


def assert_oidc_login_denied(
    nexus_base_url: str,
    nexus_api: NexusApiRegistry,
    oidc_provider_id: UUID,
    *,
    username: str,
    password: str,
) -> str:
    """Complete OIDC login expecting group-mapping denial (auth_error redirect).

    Returns the decoded auth_error query parameter from the callback redirect.
    """
    auth_resp = nexus_api.authentication.oidc_authorize(provider_id=oidc_provider_id)
    if auth_resp.status_code not in (HTTPStatus.FOUND, HTTPStatus.TEMPORARY_REDIRECT):
        msg = f"Expected OIDC authorize redirect, got {auth_resp.status_code}"
        raise AssertionError(msg)

    oidc_auth_url = auth_resp.headers["location"]
    client = httpx.Client(verify=False, follow_redirects=True, timeout=_OIDC_CLIENT_TIMEOUT)  # noqa: S501
    idp_resp = _idp_form_user_login(client=client, login_url=oidc_auth_url, username=username, password=password)
    idp_parsed = urlparse(idp_resp.headers["Location"])
    query_params = parse_qs(idp_parsed.query)

    oidc_callback_resp = nexus_api.authentication.oidc_callback(
        state=query_params["state"][0], code=query_params["code"][0]
    )
    if oidc_callback_resp.status_code != HTTPStatus.FOUND:
        msg = f"Expected callback redirect, got {oidc_callback_resp.status_code}"
        raise AssertionError(msg)

    location = oidc_callback_resp.headers.get("location", "")
    if "auth_error" not in location:
        msg = f"Expected auth_error in callback redirect, got location={location!r}"
        raise AssertionError(msg)

    callback_parsed = urlparse(location)
    auth_errors = parse_qs(callback_parsed.query).get("auth_error", [])
    if not auth_errors:
        msg = f"Missing auth_error query param in redirect: {location!r}"
        raise AssertionError(msg)
    return auth_errors[0]
