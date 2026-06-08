"""Async OPA client for policy evaluation."""

from typing import Any

import httpx
import structlog
from starlette.status import HTTP_200_OK

logger = structlog.stdlib.get_logger(__name__)


class OPAClient:
    """Async HTTP client for Open Policy Agent evaluation.

    Manages an httpx.AsyncClient for communicating with an OPA server.
    The OPA server runs as a container (see podman-compose.yml).
    """

    def __init__(self, base_url: str = "http://localhost:8181") -> None:
        """Initialize OPA client.

        Args:
            base_url: OPA server URL.

        """
        self._base_url = base_url.rstrip("/")
        self._client: httpx.AsyncClient | None = None

    def start(self) -> None:
        """Create the HTTP client."""
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=10)
        logger.info("OPA client started", base_url=self._base_url)

    async def stop(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info("OPA client stopped")

    async def health(self) -> bool:
        """Check OPA server health.

        Returns:
            True if OPA is healthy.

        """
        if not self._client:
            return False
        try:
            resp = await self._client.get("/health")
            return resp.status_code == HTTP_200_OK
        except (httpx.ConnectError, httpx.TimeoutException, OSError):
            return False

    async def evaluate(self, opa_input: dict[str, Any]) -> dict[str, Any]:
        """Evaluate authorization input against OPA policies.

        Args:
            opa_input: The input document for OPA evaluation.

        Returns:
            OPA result dict with allow, deny, matched_policy, etc.

        Raises:
            httpx.HTTPStatusError: If OPA returns an error response.

        """
        if not self._client:
            msg = "OPA client not started"
            raise RuntimeError(msg)

        resp = await self._client.post(
            "/v1/data/nexus/authz",
            json={"input": opa_input},
        )
        resp.raise_for_status()
        result: dict[str, Any] = resp.json().get("result", {})
        return result
