"""Suite-specific fixtures for Suite 5: Invocation Service performance tests.

Shared fixtures (perf_test_mode_enabled, llm_credential_id,
llm_invocation_enabled) and helpers (compute_percentile,
poll_for_component_kpis, poll_for_metric_records, submit_invocation,
find_llm_credential_id, poll_for_invocation_terminal_status) live in
``tests/performance/conftest.py`` and are inherited automatically.

This file adds invocation-service-specific batch helpers used by the
throughput, E2E duration, and status distribution test modules.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM Provider credential** created and enabled on the deployment,
      OR ``E2E_LLM_CREDENTIAL_CONFIGURED=1`` env var set on the deployment
      with a valid ``openrouter_api_key`` in settings.

Cleanup:
    Unlike workflows, invocations cannot be deleted via the API (only cancelled).
    Tests create invocations that persist in the target deployment. Use a dedicated
    test environment and ensure adequate database capacity for repeated test runs.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.models.invocation_create_request_contextdata import (
        InvocationCreateRequestContextdata,
    )
    from nexus_api_client.types import Unset


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def create_invocation(
    nexus_api: NexusApiRegistry,
    session_id: str,
    prompt: str = "Performance test invocation",
    credential_id: str | None = None,
) -> tuple[float, bool]:
    """Create a single invocation and return (elapsed_ms, success).

    Args:
        nexus_api: Authenticated API client registry.
        session_id: Session identifier for grouping invocations.
        prompt: Prompt text for the invocation.
        credential_id: Optional LLM Provider credential ID to inject
            into ``context_data.metadata``.

    """
    from nexus_api_client.models.invocation_create_request import InvocationCreateRequest
    from nexus_api_client.models.invocation_create_request_contextdata import (
        InvocationCreateRequestContextdata as _Ctx,
    )
    from nexus_api_client.types import UNSET

    ctx: InvocationCreateRequestContextdata | Unset = UNSET
    if credential_id:
        ctx = _Ctx.from_dict({"metadata": {"credential_id": credential_id}})

    start = time.monotonic()
    try:
        r = nexus_api.invocation.create(
            body=InvocationCreateRequest(
                prompt=prompt,
                session_id=session_id,
                context_data=ctx,
            ),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success
    except Exception:
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, False


def create_invocation_with_id(
    nexus_api: NexusApiRegistry,
    session_id: str,
    prompt: str = "Performance test invocation",
    credential_id: str | None = None,
) -> tuple[str | None, bool]:
    """Create a single invocation and return (invocation_id, success).

    Args:
        nexus_api: Authenticated API client registry.
        session_id: Session identifier for grouping invocations.
        prompt: Prompt text for the invocation.
        credential_id: Optional LLM Provider credential ID to inject
            into ``context_data.metadata``.

    """
    from nexus_api_client.models.invocation_create_request import InvocationCreateRequest
    from nexus_api_client.models.invocation_create_request_contextdata import (
        InvocationCreateRequestContextdata as _Ctx,
    )
    from nexus_api_client.types import UNSET

    ctx: InvocationCreateRequestContextdata | Unset = UNSET
    if credential_id:
        ctx = _Ctx.from_dict({"metadata": {"credential_id": credential_id}})

    try:
        r = nexus_api.invocation.create(
            body=InvocationCreateRequest(
                prompt=prompt,
                session_id=session_id,
                context_data=ctx,
            ),
        )
        if r.is_success and r.parsed:
            return str(r.parsed.id), True
        return None, r.is_success
    except Exception:
        return None, False


def submit_invocations_batch(
    nexus_api: NexusApiRegistry,
    count: int,
    session_id: str,
    *,
    prompt_prefix: str = "Perf test",
    prompts: list[str] | None = None,
    max_workers: int = 10,
    credential_id: str | None = None,
) -> tuple[int, int]:
    """Submit *count* invocations concurrently. Returns (successes, failures).

    If *prompts* is given, cycles through them; otherwise generates
    prompts from *prompt_prefix*.

    Args:
        nexus_api: Authenticated API client registry.
        count: Number of invocations to submit.
        session_id: Session identifier for grouping invocations.
        prompt_prefix: Prefix for auto-generated prompts.
        prompts: Optional list of prompts to cycle through.
        max_workers: Maximum concurrent threads.
        credential_id: Optional LLM Provider credential ID.

    """
    successes = 0
    failures = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                create_invocation,
                nexus_api,
                session_id,
                prompts[i % len(prompts)] if prompts else f"{prompt_prefix} {i}",
                credential_id,
            )
            for i in range(count)
        ]
        for future in as_completed(futures):
            _, ok = future.result()
            if ok:
                successes += 1
            else:
                failures += 1

    return successes, failures


def submit_invocations_batch_with_ids(
    nexus_api: NexusApiRegistry,
    count: int,
    session_id: str,
    *,
    prompt_prefix: str = "Perf test",
    prompts: list[str] | None = None,
    max_workers: int = 10,
    credential_id: str | None = None,
) -> tuple[list[str], int]:
    """Submit *count* invocations concurrently. Returns (invocation_ids, failures).

    Args:
        nexus_api: Authenticated API client registry.
        count: Number of invocations to submit.
        session_id: Session identifier for grouping invocations.
        prompt_prefix: Prefix for auto-generated prompts.
        prompts: Optional list of prompts to cycle through.
        max_workers: Maximum concurrent threads.
        credential_id: Optional LLM Provider credential ID.

    """
    invocation_ids: list[str] = []
    failures = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [
            executor.submit(
                create_invocation_with_id,
                nexus_api,
                session_id,
                prompts[i % len(prompts)] if prompts else f"{prompt_prefix} {i}",
                credential_id,
            )
            for i in range(count)
        ]
        for future in as_completed(futures):
            inv_id, ok = future.result()
            if ok and inv_id:
                invocation_ids.append(inv_id)
            else:
                failures += 1

    return invocation_ids, failures
