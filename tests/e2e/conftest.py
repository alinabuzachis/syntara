"""Shared fixtures for Nexus E2E tests."""

import os

import httpx
import pytest
from nexus_api_client import Client
from nexus_api_client.api import NexusApiRegistry


@pytest.fixture(scope="session")
def nexus_client() -> Client:
    """Return a Nexus API client connected to the test environment."""
    base_url = os.environ.get("APP_BASE_URL", "http://localhost:8000")
    client = Client(base_url=base_url, verify_ssl=False)

    try:
        response = httpx.get(f"{base_url}/health", timeout=5, verify=False)  # noqa: S501
        response.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.exit(
            f"Environment not available at {base_url}: {exc}\n"
            "Start the services first with: make services-run && make dev",
            returncode=1,
        )

    return client


@pytest.fixture(scope="session")
def nexus_api(nexus_client: Client) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the test client."""
    return NexusApiRegistry(nexus_client)
