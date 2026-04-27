"""AAP Proxy Service — BFF proxy for AAP Controller REST API v2.

Handles auth resolution, request forwarding, and response shaping for
the UI's cascading resource dropdowns.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx
import structlog

from nexus.aap.auth import AAPConnection, resolve_aap_connection
from nexus.aap.credential_resolver import resolve_aap_connection_from_credential
from nexus.aap.exceptions import AAPAuthenticationError, AAPConnectionError, AAPUpstreamError
from nexus.aap.models.responses import (
    AAPCredential,
    AAPExecutionEnvironment,
    AAPInstanceGroup,
    AAPInventory,
    AAPJobTemplate,
    AAPJobTemplateDetail,
    AAPLabel,
    AAPListResponse,
    AAPOrganization,
)

if TYPE_CHECKING:
    from collections.abc import Callable
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.aap.models.queries import AAPBaseQuery, AAPResourceQuery
    from nexus.core.config.base import Settings

logger = structlog.stdlib.get_logger(__name__)

# AAP Controller API v2 base path
_AAP_API_PREFIX = "/api/controller/v2"

# HTTP status code thresholds
_HTTP_STATUS_CLIENT_ERROR = 400

# Log messages
_LOG_ORG_NOT_FOUND = "Organization not found in AAP"

# ASCII control character boundaries for input sanitization
_MIN_PRINTABLE_CHAR = 0x20  # Space character (first printable ASCII)
_DEL_CHAR = 0x7F  # DEL control character


def _safe_map[T](data: dict[str, Any], mapper: Callable[[dict[str, Any]], T]) -> list[T]:
    """Map AAP response results through *mapper*, skipping malformed entries.

    Logs a warning for each entry that raises ``KeyError``, ``TypeError``,
    ``ValueError``, or ``AssertionError`` (e.g. missing ``id`` / ``name``
    fields or invalid values), rather than letting one bad record break
    the entire response.
    """
    results: list[T] = []
    for entry in data.get("results", []):
        try:
            results.append(mapper(entry))
        except (KeyError, TypeError, ValueError, AssertionError) as exc:
            # Log only safe identifiers, not the full entry (which may contain sensitive data)
            entry_id = entry.get("id")
            entry_name = entry.get("name")
            logger.warning(
                "Skipping malformed AAP resource entry",
                entry_id=entry_id,
                entry_name=entry_name,
                error=str(exc),
            )
    return results


class AAPProxyService:
    """BFF proxy service that forwards requests to AAP Controller REST API v2.

    Each public method resolves AAP auth, calls the appropriate AAP endpoint,
    and returns typed Pydantic models for the router to serialize.
    """

    def __init__(self, settings: Settings, session: AsyncSession) -> None:
        """Initialize with injected dependencies."""
        self._settings = settings
        self._session = session
        # Lazily created per-connection client to avoid repeated TCP/TLS setup
        # within the same request (e.g., org resolution + resource list).
        self._client: httpx.AsyncClient | None = None
        self._client_connection: AAPConnection | None = None

    async def close(self) -> None:
        """Close the underlying httpx client, if any."""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            self._client_connection = None

    async def list_organizations(
        self, query: AAPBaseQuery, user_id: UUID | None = None
    ) -> AAPListResponse[AAPOrganization]:
        """List AAP organizations."""
        connection = await self._resolve_connection(credential_id=query.credential_id, user_id=user_id)
        params = self._build_params(search=query.search, page_size=query.page_size)
        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/organizations/", params)
        results = _safe_map(data, lambda r: AAPOrganization(id=r["id"], name=r["name"]))
        return AAPListResponse(count=data.get("count", len(results)), results=results)

    async def list_job_templates(
        self, query: AAPResourceQuery, user_id: UUID | None = None
    ) -> AAPListResponse[AAPJobTemplate]:
        """List AAP job templates, optionally filtered by organization."""
        connection = await self._resolve_connection(credential_id=query.credential_id, user_id=user_id)
        params = self._build_params(search=query.search, page_size=query.page_size)

        if query.organization:
            org_id = await self._resolve_organization_id(connection, query.organization)
            if org_id is None:
                # Organization not found — return empty list rather than widening the query
                logger.warning(_LOG_ORG_NOT_FOUND, organization=query.organization)
                return AAPListResponse(count=0, results=[])
            params["organization"] = str(org_id)

        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/job_templates/", params)
        results = _safe_map(
            data, lambda r: AAPJobTemplate(id=r["id"], name=r["name"], description=r.get("description"))
        )
        return AAPListResponse(count=data.get("count", len(results)), results=results)

    async def get_job_template(
        self, job_template_id: int, credential_id: str | None = None, user_id: UUID | None = None
    ) -> AAPJobTemplateDetail:
        """Get AAP job template details including prompt-on-launch flags."""
        connection = await self._resolve_connection(credential_id=credential_id, user_id=user_id)
        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/job_templates/{job_template_id}/", {})
        detail = AAPJobTemplateDetail.model_validate(data)
        # Only set detail.url if aap_public_url is explicitly configured (avoid leaking internal addresses)
        if self._settings.aap_public_url:
            public_url = self._settings.aap_public_url.rstrip("/")
            detail.url = f"{public_url}/execution/templates/job-template/{job_template_id}/details"
        else:
            detail.url = None
        return detail

    async def list_inventories(
        self, query: AAPResourceQuery, user_id: UUID | None = None
    ) -> AAPListResponse[AAPInventory]:
        """List AAP inventories, optionally filtered by organization."""
        connection = await self._resolve_connection(credential_id=query.credential_id, user_id=user_id)
        params = self._build_params(search=query.search, page_size=query.page_size)

        if query.organization:
            org_id = await self._resolve_organization_id(connection, query.organization)
            if org_id is None:
                # Organization not found — return empty list rather than widening the query
                logger.warning(_LOG_ORG_NOT_FOUND, organization=query.organization)
                return AAPListResponse(count=0, results=[])
            params["organization"] = str(org_id)

        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/inventories/", params)
        results = _safe_map(data, lambda r: AAPInventory(id=r["id"], name=r["name"], description=r.get("description")))
        return AAPListResponse(count=data.get("count", len(results)), results=results)

    async def list_execution_environments(
        self, query: AAPResourceQuery, user_id: UUID | None = None
    ) -> AAPListResponse[AAPExecutionEnvironment]:
        """List AAP execution environments belonging to the selected org or having no org."""
        connection = await self._resolve_connection(credential_id=query.credential_id, user_id=user_id)
        params = self._build_params(search=query.search, page_size=query.page_size)

        if query.organization:
            org_id = await self._resolve_organization_id(connection, query.organization)
            if org_id is None:
                # Organization not found — return empty list rather than widening the query
                logger.warning(_LOG_ORG_NOT_FOUND, organization=query.organization)
                return AAPListResponse(count=0, results=[])
            params["or__organization__id"] = str(org_id)
            params["or__organization__isnull"] = "True"

        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/execution_environments/", params)
        results = _safe_map(
            data, lambda r: AAPExecutionEnvironment(id=r["id"], name=r["name"], description=r.get("description"))
        )
        return AAPListResponse(count=data.get("count", len(results)), results=results)

    async def list_credentials(
        self, query: AAPBaseQuery, user_id: UUID | None = None
    ) -> AAPListResponse[AAPCredential]:
        """List AAP credentials (not organization-scoped)."""
        connection = await self._resolve_connection(credential_id=query.credential_id, user_id=user_id)
        params = self._build_params(search=query.search, page_size=query.page_size)
        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/credentials/", params)
        results = _safe_map(data, lambda r: AAPCredential(id=r["id"], name=r["name"]))
        return AAPListResponse(count=data.get("count", len(results)), results=results)

    async def list_instance_groups(
        self, query: AAPBaseQuery, user_id: UUID | None = None
    ) -> AAPListResponse[AAPInstanceGroup]:
        """List AAP instance groups (not organization-scoped)."""
        connection = await self._resolve_connection(credential_id=query.credential_id, user_id=user_id)
        params = self._build_params(search=query.search, page_size=query.page_size)
        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/instance_groups/", params)
        results = _safe_map(data, lambda r: AAPInstanceGroup(id=r["id"], name=r["name"]))
        return AAPListResponse(count=data.get("count", len(results)), results=results)

    async def list_labels(self, query: AAPBaseQuery, user_id: UUID | None = None) -> AAPListResponse[AAPLabel]:
        """List AAP labels."""
        connection = await self._resolve_connection(credential_id=query.credential_id, user_id=user_id)
        params = self._build_params(search=query.search, page_size=query.page_size)
        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/labels/", params)
        results = _safe_map(
            data,
            lambda r: AAPLabel(id=r["id"], name=r["name"], organization=r.get("organization")),
        )
        return AAPListResponse(count=data.get("count", len(results)), results=results)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _resolve_connection(
        self, credential_id: UUID | str | None = None, user_id: UUID | None = None
    ) -> AAPConnection:
        """Resolve AAP connection from credential or environment settings.

        Args:
            credential_id: Optional Nexus credential ID (type: "Ansible Automation Platform", UUID format).
            user_id: User ID (UUID) for authorization check (required when credential_id is provided).

        Returns:
            AAPConnection with auth resolved and TLS verification enforced.

        Raises:
            AAPNotConfiguredError: No credential or env vars configured.
            AAPAuthenticationError: Credential decryption failed, user not authorized, or invalid credential_id format.
            ValueError: credential_id provided without user_id (security violation).

        Security:
            - credential_id is validated as UUID format in credential_resolver
            - user_id is required when credential_id is provided to prevent authorization bypass
            - TLS verification is configurable per credential (verify_ssl field, defaults to True)

        """
        if credential_id:
            if user_id is None:
                msg = "user_id is required when credential_id is provided (authorization check cannot be bypassed)"
                raise ValueError(msg)

            logger.debug("Resolving AAP connection from credential", credential_id=str(credential_id))
            connection = await resolve_aap_connection_from_credential(
                session=self._session, credential_id=credential_id, user_id=user_id
            )
            logger.debug("AAP connection resolved from credential")
            return connection

        logger.debug("Resolving AAP connection from environment")
        connection = resolve_aap_connection(settings=self._settings)
        logger.debug("AAP connection resolved from environment")
        return connection

    async def _resolve_organization_id(self, connection: AAPConnection, org_name: str) -> int | None:
        """Resolve an organization name to its AAP ID.

        Uses AAP's ``name`` query parameter for exact matching (not ``search``
        which is full-text/contains).

        Returns None if the organization is not found (results will be unfiltered).
        """
        # Sanitize organization name by removing control characters
        sanitized_name = "".join(
            char for char in org_name if ord(char) >= _MIN_PRINTABLE_CHAR and ord(char) != _DEL_CHAR
        )
        params: dict[str, str] = {"name": sanitized_name, "page_size": "1"}
        data = await self._proxy_get(connection, f"{_AAP_API_PREFIX}/organizations/", params)
        results = data.get("results", [])
        if results:
            try:
                return int(results[0]["id"])
            except (KeyError, TypeError, ValueError):
                logger.warning("Malformed organization entry in AAP response", entry=results[0])
                return None
        return None

    @staticmethod
    def _build_params(
        search: str | None = None,
        page_size: int = 50,
    ) -> dict[str, str]:
        """Build query params dict for AAP API.

        Sanitizes search input by removing control characters to prevent
        unexpected behavior in the upstream AAP API.
        """
        params: dict[str, str] = {"page_size": str(page_size)}
        if search:
            # Strip control characters (ASCII 0x00-0x1F, 0x7F) from search input
            sanitized = "".join(char for char in search if ord(char) >= _MIN_PRINTABLE_CHAR and ord(char) != _DEL_CHAR)
            if sanitized:
                params["search"] = sanitized
        return params

    async def _get_client(self, connection: AAPConnection) -> httpx.AsyncClient:
        """Return a reusable httpx client for the given connection.

        A new client is created only when the connection details change,
        avoiding repeated TCP/TLS handshakes within the same request
        (e.g., org-name resolution followed by a resource list).
        Closes the previous client if connection details changed.
        """
        if self._client is not None and self._client_connection != connection:
            await self._client.aclose()
            self._client = None
            self._client_connection = None
        if self._client is None:
            self._client = httpx.AsyncClient(
                verify=connection.verify_ssl,
                timeout=connection.timeout,
            )
            self._client_connection = connection
        return self._client

    async def _proxy_get(
        self,
        connection: AAPConnection,
        path: str,
        params: dict[str, str],
    ) -> dict[str, Any]:
        """Execute authenticated GET against AAP Controller.

        Raises:
            AAPConnectionError: Network error or timeout.
            AAPAuthenticationError: AAP returned 401/403.
            AAPUpstreamError: AAP returned other 4xx/5xx.

        """
        url = f"{connection.base_url}{path}"
        client = await self._get_client(connection)
        logger.debug("AAP proxy GET", path=path)

        response = await self._send_request(client, url, connection, params)

        logger.debug("AAP proxy response", path=path, status=response.status_code)

        self._check_response_status(response)

        try:
            return response.json()  # type: ignore[no-any-return]
        except ValueError as e:
            msg = "AAP Controller returned an invalid response"
            logger.exception(
                "AAP invalid JSON response",
                url=url,
                content_type=response.headers.get("content-type"),
                content_length=len(response.text),
            )
            raise AAPUpstreamError(msg) from e

    @staticmethod
    async def _send_request(
        client: httpx.AsyncClient,
        url: str,
        connection: AAPConnection,
        params: dict[str, str],
    ) -> httpx.Response:
        """Send GET request to AAP Controller, mapping transport errors."""
        try:
            return await client.get(
                url,
                headers=connection.headers,
                auth=connection.basic_auth,
                params=params,
            )
        except httpx.TimeoutException as e:
            msg = "AAP Controller request timed out"
            logger.exception("AAP timeout", error_type=type(e).__name__)
            raise AAPConnectionError(msg) from e
        except httpx.ConnectError as e:
            msg = "Cannot connect to AAP Controller"
            logger.exception("AAP ConnectError", error_type=type(e).__name__)
            raise AAPConnectionError(msg) from e
        except httpx.RequestError as e:
            msg = "AAP Controller request failed"
            logger.exception("AAP RequestError", error_type=type(e).__name__)
            raise AAPConnectionError(msg) from e
        except Exception as e:
            msg = "AAP Controller request failed unexpectedly"
            logger.exception("AAP unexpected error", error_type=type(e).__name__)
            raise AAPConnectionError(msg) from e

    @staticmethod
    def _check_response_status(response: httpx.Response) -> None:
        """Check HTTP response status and raise domain errors for failures."""
        if response.status_code in (401, 403):
            msg = "AAP Controller authentication failed"
            logger.error("AAP auth failed", status=response.status_code)
            raise AAPAuthenticationError(msg)

        if response.status_code >= _HTTP_STATUS_CLIENT_ERROR:
            logger.error("AAP upstream error", status=response.status_code)
            msg = f"AAP Controller returned HTTP {response.status_code}"
            raise AAPUpstreamError(msg)
