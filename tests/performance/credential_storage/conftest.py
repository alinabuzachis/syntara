"""Shared fixtures for Suite 22: Credential Storage performance tests.

These tests run against a live Nexus deployment and validate the
Credential Storage KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled) and helpers
(compute_percentile, poll_for_metric_records) are defined in the parent
tests/performance/conftest.py and inherited automatically.  This file
adds credential-storage-specific helpers and test data.

The five preseeded managed credential types are:
    - HTTP Bearer Token
    - HTTP Basic Auth
    - Ansible Automation Platform
    - LLM Provider
    - SSH Key

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - At least one project must exist (test discovers the first available)
    - PERF_TEST_SSH_PRIVATE_KEY environment variable (optional):
        * Required for SSH Key credential tests
        * If not set, SSH Key tests are skipped; other credential types run normally
        * Set to a valid SSH private key in OpenSSH format

Run with:
    make test-performance

    # To include SSH Key tests:
    export PERF_TEST_SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----
    ...
    -----END OPENSSH PRIVATE KEY-----"
    make test-performance
"""

from __future__ import annotations

import itertools
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import pytest

from tests.performance.conftest import log_request_failure

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

logger = logging.getLogger(__name__)

ENCRYPTED_SENTINEL = "$encrypted$"

# ---------------------------------------------------------------------------
# Credential type definitions
# ---------------------------------------------------------------------------

CREDENTIAL_TYPE_NAMES: list[str] = [
    "HTTP Bearer Token",
    "HTTP Basic Auth",
    "Ansible Automation Platform",
    "LLM Provider",
    "SSH Key",
]

_SSH_KEY_ENV_VAR = "PERF_TEST_SSH_PRIVATE_KEY"


def _get_ssh_test_key() -> str:
    """Return the SSH private key from the environment variable.

    Returns empty string if not set.
    """
    return os.environ.get(_SSH_KEY_ENV_VAR, "")


CREDENTIAL_TYPE_INPUTS: dict[str, dict[str, Any]] = {
    "HTTP Bearer Token": {
        "token": "perf-test-bearer-token-placeholder",
    },
    "HTTP Basic Auth": {
        "username": "perf-test-user",
        "password": "perf-test-password-placeholder",
    },
    "Ansible Automation Platform": {
        "host": "https://aap.perf-test.example.com",
        "username": "perf-test-aap-user",
        "password": "perf-test-aap-password",
        "verify_ssl": True,
    },
    "LLM Provider": {
        "provider": "openai",
        "api_key": "perf-test-llm-api-key-placeholder",
    },
    "SSH Key": {
        "username": "perf-test-ssh-user",
        "ssh_private_key": _get_ssh_test_key() or None,
    },
}

SECRET_FIELDS: dict[str, set[str]] = {
    "HTTP Bearer Token": {"token"},
    "HTTP Basic Auth": {"password"},
    "Ansible Automation Platform": {"password", "oauth_token"},
    "LLM Provider": {"api_key"},
    "SSH Key": {"ssh_private_key"},
}

NON_SECRET_FIELDS: dict[str, set[str]] = {
    "HTTP Bearer Token": set(),
    "HTTP Basic Auth": {"username"},
    "Ansible Automation Platform": {"host", "username", "verify_ssl"},
    "LLM Provider": {"provider"},
    "SSH Key": {"username"},
}

# ---------------------------------------------------------------------------
# Discovery helpers
# ---------------------------------------------------------------------------


def resolve_credential_type_ids(
    nexus_api: NexusApiRegistry,
) -> dict[str, UUID]:
    """Fetch credential types and return a name->UUID mapping.

    Only includes types whose names match ``CREDENTIAL_TYPE_NAMES``.
    """
    r = nexus_api.credentials.list_types()
    if not (r.is_success and r.parsed):
        msg = f"Failed to list credential types: status={r.status_code}"
        raise RuntimeError(msg)

    resources = getattr(r.parsed, "resources", None) or []
    type_map: dict[str, UUID] = {}
    for ct in resources:
        name = str(getattr(ct, "name", "") or "")
        ct_id = getattr(ct, "id", None)
        if name in CREDENTIAL_TYPE_NAMES and ct_id is not None:
            type_map[name] = UUID(str(ct_id))
    return type_map


def resolve_project_id(nexus_api: NexusApiRegistry) -> UUID:
    """Discover the first available project on the deployment.

    Credentials require a ``project_id``. This fetches the project list
    and returns the ID of the first project found.
    """
    r = nexus_api.projects.list()
    if not (r.is_success and r.parsed):
        msg = f"Failed to list projects: status={r.status_code}"
        raise RuntimeError(msg)

    resources = getattr(r.parsed, "resources", None) or []
    for project in resources:
        pid = getattr(project, "id", None)
        if pid is not None:
            return UUID(str(pid))

    msg = "No projects found on deployment. At least one project is required for credential tests."
    raise RuntimeError(msg)


# ---------------------------------------------------------------------------
# CRUD helpers (timed)
# ---------------------------------------------------------------------------


def create_credential(
    nexus_api: NexusApiRegistry,
    *,
    credential_type_name: str,
    credential_type_id: UUID,
    project_id: UUID,
    name_prefix: str = "perf-suite22",
) -> tuple[float, bool, str | None]:
    """Create a single credential and measure API response time.

    Returns (elapsed_ms, success, credential_id).
    """
    from nexus_api_client.models.credential_create import CredentialCreate
    from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs

    inputs_dict = CREDENTIAL_TYPE_INPUTS.get(credential_type_name, {})

    # Validate SSH key is available
    if credential_type_name == "SSH Key" and not inputs_dict.get("ssh_private_key"):
        logger.warning(
            "Cannot create SSH credential - %s not set. Skipping this credential.",
            _SSH_KEY_ENV_VAR,
        )
        return 0.0, False, None

    cred_name = f"{name_prefix}-{credential_type_name.lower().replace(' ', '-')}-{uuid4().hex[:8]}"

    start = time.monotonic()
    try:
        r = nexus_api.credentials.create(
            body=CredentialCreate(
                credential_type_id=credential_type_id,
                name=cred_name,
                project_id=project_id,
                description=f"Performance test credential ({credential_type_name})",
                inputs=CredentialCreateInputs.from_dict(inputs_dict),
            ),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        cred_id = str(r.parsed.id) if r.is_success and r.parsed and hasattr(r.parsed, "id") else None
        return elapsed_ms, r.is_success or r.status_code in (200, 201), cred_id
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="create_credential")
        return elapsed_ms, False, None


def get_credential_by_id(
    nexus_api: NexusApiRegistry,
    credential_id: str,
) -> tuple[float, bool, dict[str, Any]]:
    """GET a single credential and measure response time.

    Returns (elapsed_ms, success, parsed_response_dict).
    """
    start = time.monotonic()
    try:
        r = nexus_api.credentials.get(credential_id=UUID(credential_id))
        elapsed_ms = (time.monotonic() - start) * 1000
        parsed = r.parsed.to_dict() if r.is_success and r.parsed else {}
        return elapsed_ms, r.is_success, parsed
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="get_credential")
        return elapsed_ms, False, {}


def list_credentials(
    nexus_api: NexusApiRegistry,
    *,
    limit: int = 20,
    include_total: bool = False,
) -> tuple[float, bool, dict[str, Any]]:
    """Issue a single GET /credentials request and measure response time.

    Returns (elapsed_ms, success, parsed_response_dict).
    """
    start = time.monotonic()
    try:
        r = nexus_api.credentials.list(limit=limit, include_total=include_total)
        elapsed_ms = (time.monotonic() - start) * 1000
        parsed = r.parsed.to_dict() if r.is_success and r.parsed else {}
        return elapsed_ms, r.is_success, parsed
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="list_credentials")
        return elapsed_ms, False, {}


def patch_credential(
    nexus_api: NexusApiRegistry,
    credential_id: str,
    *,
    patch_inputs: dict[str, Any],
    new_description: str | None = None,
) -> tuple[float, bool, dict[str, Any]]:
    """PATCH a single credential and measure response time.

    Returns (elapsed_ms, success, parsed_response_dict).
    """
    from nexus_api_client.models.credential_patch import CredentialPatch
    from nexus_api_client.models.credential_patch_inputs_type_0 import (
        CredentialPatchInputsType0,
    )
    from nexus_api_client.types import UNSET

    body_kwargs: dict[str, Any] = {
        "inputs": CredentialPatchInputsType0.from_dict(patch_inputs),
    }
    if new_description is not None:
        body_kwargs["description"] = new_description
    else:
        body_kwargs["description"] = UNSET

    start = time.monotonic()
    try:
        r = nexus_api.credentials.update(
            credential_id=UUID(credential_id),
            body=CredentialPatch(**body_kwargs),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        if r.is_success and r.parsed:
            parsed = r.parsed.to_dict()
        else:
            # Capture error details for non-2xx responses
            parsed = {
                "status_code": r.status_code,
                "error": str(r.parsed) if r.parsed else "No error details",
            }
        return elapsed_ms, r.is_success, parsed
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="patch_credential")
        return elapsed_ms, False, {"error": str(exc), "exc_type": type(exc).__name__}


def delete_credential_by_id(
    nexus_api: NexusApiRegistry,
    credential_id: str,
) -> None:
    """Best-effort cleanup of a credential."""
    try:
        nexus_api.credentials.delete(credential_id=UUID(credential_id))
    except Exception:
        logger.debug("Failed to delete credential %s during cleanup", credential_id)


def delete_credential_timed(
    nexus_api: NexusApiRegistry,
    credential_id: str,
) -> tuple[float, bool]:
    """Delete a credential and measure response time.

    Returns (elapsed_ms, success).
    """
    start = time.monotonic()
    try:
        r = nexus_api.credentials.delete(credential_id=UUID(credential_id))
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success or r.status_code in (200, 204)
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="delete_credential")
        return elapsed_ms, False


# ---------------------------------------------------------------------------
# Bulk seeding / cleanup
# ---------------------------------------------------------------------------

DEFAULT_SEED_MAX_WORKERS = 10


def seed_credentials(
    nexus_api: NexusApiRegistry,
    *,
    credential_type_map: dict[str, UUID],
    project_id: UUID,
    count: int,
    name_prefix: str = "perf-suite22-seed",
    max_workers: int = DEFAULT_SEED_MAX_WORKERS,
) -> list[str]:
    """Create *count* credentials concurrently for seeding. Returns list of IDs."""
    type_cycle = itertools.cycle(CREDENTIAL_TYPE_NAMES)
    tasks = [(name := next(type_cycle), credential_type_map[name]) for _ in range(count)]

    created_ids: list[str] = []
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                create_credential,
                nexus_api,
                credential_type_name=type_name,
                credential_type_id=type_id,
                project_id=project_id,
                name_prefix=name_prefix,
            )
            for type_name, type_id in tasks
        ]
        for future in as_completed(futures):
            _, ok, cred_id = future.result()
            if ok and cred_id:
                created_ids.append(cred_id)

    return created_ids


def cleanup_credentials(
    nexus_api: NexusApiRegistry,
    credential_ids: list[str],
    *,
    max_workers: int = DEFAULT_SEED_MAX_WORKERS,
) -> None:
    """Best-effort concurrent cleanup."""
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        for cred_id in credential_ids:
            executor.submit(delete_credential_by_id, nexus_api, cred_id)


# ---------------------------------------------------------------------------
# Metric record extraction
# ---------------------------------------------------------------------------


def extract_credential_metric_latencies(
    records: dict[str, Any],
    *,
    method: str,
    single_resource: bool = False,
) -> list[float]:
    """Extract latency values from request_duration_ms records for credential endpoints.

    Args:
        records: Parsed metric records dict from poll_for_metric_records.
        method: HTTP method to filter (e.g. "POST", "GET", "PATCH").
        single_resource: If True, match /credentials/{id} style endpoints.
            If False, match the collection endpoint /credentials.

    Returns:
        List of latency values in ms.

    """
    latencies: list[float] = []
    target_method = method.upper()

    for record in records.get("records", []):
        labels = record.get("labels", {})
        endpoint = labels.get("endpoint", "")
        rec_method = labels.get("method", "").upper()
        value = record.get("value")

        if rec_method != target_method or not isinstance(value, (int, float)):
            continue

        if single_resource:
            if endpoint.startswith(("/credentials/", "/api/v1/credentials/")):
                latencies.append(float(value))
        elif endpoint in ("/api/v1/credentials", "/credentials"):
            latencies.append(float(value))

    return latencies


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def credential_type_map(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> dict[str, UUID]:
    """Resolve the preseeded credential type name->UUID mapping.

    Skips the module if fewer than 5 managed types are found.
    """
    type_map = resolve_credential_type_ids(nexus_api)
    missing = set(CREDENTIAL_TYPE_NAMES) - set(type_map)
    if missing:
        pytest.skip(f"Missing credential types on deployment: {missing}. All 5 managed types must be preseeded.")
    return type_map


@pytest.fixture(scope="module")
def perf_project_id(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> UUID:
    """Discover a project ID for credential creation."""
    try:
        return resolve_project_id(nexus_api)
    except RuntimeError as exc:
        pytest.skip(str(exc))
        raise  # unreachable, keeps mypy happy
