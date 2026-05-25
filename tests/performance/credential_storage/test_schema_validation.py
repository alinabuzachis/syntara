"""Suite 22 — Credential Storage: Schema Validation Rejection KPI (22.10).

Test 22.10: Schema validation — create credentials with invalid inputs
    (unknown fields, missing required, wrong types) at 50 RPS
    KPI: Validation Rejection Latency < 50ms (fast fail with 422)
    MetricType: REQUEST_DURATION, ERROR
    Validation:
        Verify rejection is faster than successful creation

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import pytest

from tests.performance.conftest import (
    compute_percentile,
    log_request_failure,
    poll_for_metric_records,
)
from tests.performance.credential_storage.conftest import (
    CREDENTIAL_TYPE_NAMES,
    create_credential,
    delete_credential_by_id,
    extract_credential_metric_latencies,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVALID_REQUESTS_COUNT = 200
VALID_BASELINE_COUNT = 50
MAX_WORKERS = 10
TARGET_REJECTION_P95_MS = 50


@dataclass
class _InvalidResult:
    elapsed_ms: float
    status_code: int
    is_422: bool


# ---------------------------------------------------------------------------
# Invalid payload definitions — three categories of schema violations
# ---------------------------------------------------------------------------


def _build_missing_required_payload(
    credential_type_id: UUID,
    project_id: UUID,
) -> dict[str, Any]:
    """Missing the required ``inputs`` field entirely."""
    return {
        "credential_type_id": str(credential_type_id),
        "name": f"perf-invalid-missing-{uuid4().hex[:8]}",
        "project_id": str(project_id),
    }


def _build_unknown_fields_payload(
    credential_type_id: UUID,
    project_id: UUID,
) -> dict[str, Any]:
    """Inputs contain fields not defined in the credential type schema."""
    return {
        "credential_type_id": str(credential_type_id),
        "name": f"perf-invalid-unknown-{uuid4().hex[:8]}",
        "project_id": str(project_id),
        "inputs": {
            "nonexistent_field_alpha": "should-not-exist",
            "nonexistent_field_beta": 12345,
            "nonexistent_field_gamma": True,
        },
    }


def _build_wrong_type_payload(
    credential_type_id: UUID,
    project_id: UUID,
) -> dict[str, Any]:
    """Required field ``token`` given as a nested object instead of string."""
    return {
        "credential_type_id": str(credential_type_id),
        "name": f"perf-invalid-wrongtype-{uuid4().hex[:8]}",
        "project_id": str(project_id),
        "inputs": {
            "token": {"nested": "object", "should": "fail"},
        },
    }


def _build_bad_type_id_payload(project_id: UUID) -> dict[str, Any]:
    """Non-existent credential_type_id — triggers a 404 or 422."""
    return {
        "credential_type_id": str(uuid4()),
        "name": f"perf-invalid-badtype-{uuid4().hex[:8]}",
        "project_id": str(project_id),
        "inputs": {"token": "some-value"},
    }


PAYLOAD_BUILDERS = [
    _build_missing_required_payload,
    _build_unknown_fields_payload,
    _build_wrong_type_payload,
]


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------


class TestSchemaValidationRejection:
    """22.10 — Schema validation rejection latency under load.

    Fires 200 invalid credential-creation requests at ~50 RPS across
    10 workers, using three categories of invalid input:
        - Missing required fields
        - Unknown / extra fields
        - Wrong field types

    Then creates 50 valid credentials as a baseline comparison.

    Validates:
        - Invalid requests receive 422 (or 400/404) status — not 2xx
        - Rejection p95 < 50ms
        - Rejections are faster than successful creation p50
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_validation_rejection_latency(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """Invalid requests must be rejected with 422 in < 50ms at p95."""
        bearer_type_id = credential_type_map["HTTP Bearer Token"]

        # --- Phase 1: Fire invalid requests concurrently ---
        rejection_results = _fire_invalid_requests(
            nexus_api,
            credential_type_id=bearer_type_id,
            project_id=perf_project_id,
        )

        rejection_latencies = [r.elapsed_ms for r in rejection_results]
        rejection_422_count = sum(1 for r in rejection_results if r.is_422)
        unexpected_successes = [r for r in rejection_results if 200 <= r.status_code < 300]
        non_422_errors = [r for r in rejection_results if not r.is_422 and not (200 <= r.status_code < 300)]

        # --- Phase 2: Create valid credentials as baseline ---
        valid_latencies, created_ids = _create_valid_baseline(
            nexus_api,
            credential_type_map,
            perf_project_id,
        )

        try:
            assert len(rejection_latencies) > 0, "No invalid requests completed"
            assert len(valid_latencies) > 0, "No valid baseline requests completed"

            rej_p95 = compute_percentile(rejection_latencies, 95)
            rej_p50 = compute_percentile(rejection_latencies, 50)
            valid_p95 = compute_percentile(valid_latencies, 95)
            valid_p50 = compute_percentile(valid_latencies, 50)

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "request_duration_ms",
                limit=INVALID_REQUESTS_COUNT + VALID_BASELINE_COUNT + 100,
                timeout=30.0,
            )
            server_post_lats = extract_credential_metric_latencies(
                records,
                method="POST",
            )

            diag = _build_diagnostic(
                rejection_count=len(rejection_results),
                rejection_422_count=rejection_422_count,
                unexpected_success_count=len(unexpected_successes),
                non_422_error_count=len(non_422_errors),
                rej_p50=rej_p50,
                rej_p95=rej_p95,
                valid_count=len(valid_latencies),
                valid_p50=valid_p50,
                valid_p95=valid_p95,
                server_post_count=len(server_post_lats),
            )

            assert not unexpected_successes, (
                f"{len(unexpected_successes)} invalid requests returned 2xx instead of an error{diag}"
            )

            assert rejection_422_count >= len(rejection_results) * 0.8, (
                f"Only {rejection_422_count}/{len(rejection_results)} invalid requests returned 422{diag}"
            )

            assert rej_p95 < TARGET_REJECTION_P95_MS, (
                f"Rejection latency p95 {rej_p95:.1f}ms exceeds target {TARGET_REJECTION_P95_MS}ms{diag}"
            )

            assert rej_p50 < valid_p50, (
                f"Rejection p50 {rej_p50:.1f}ms is not faster than valid creation p50 {valid_p50:.1f}ms{diag}"
            )

        finally:
            for cred_id in created_ids:
                delete_credential_by_id(nexus_api, cred_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _send_invalid_request(
    nexus_api: NexusApiRegistry,
    payload: dict[str, Any],
) -> _InvalidResult:
    """POST a raw JSON payload to /credentials and capture status + latency."""
    from nexus_api_client.models.credential_create import CredentialCreate

    body = CredentialCreate.from_dict(payload)
    start = time.monotonic()
    try:
        r = nexus_api.credentials.create(body=body)
        elapsed_ms = (time.monotonic() - start) * 1000
        code = int(r.status_code)
        return _InvalidResult(
            elapsed_ms=elapsed_ms,
            status_code=code,
            is_422=code in (400, 404, 422),
        )
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="invalid_credential_request")
        return _InvalidResult(
            elapsed_ms=elapsed_ms,
            status_code=0,
            is_422=False,
        )


def _fire_invalid_requests(
    nexus_api: NexusApiRegistry,
    *,
    credential_type_id: UUID,
    project_id: UUID,
) -> list[_InvalidResult]:
    """Fire INVALID_REQUESTS_COUNT invalid requests across a thread pool."""
    builder_cycle = itertools.cycle(PAYLOAD_BUILDERS)
    payloads: list[dict[str, Any]] = []

    for _ in range(INVALID_REQUESTS_COUNT):
        builder = next(builder_cycle)
        payload = builder(credential_type_id, project_id)
        payloads.append(payload)

    # Append some bad-type-id payloads for extra coverage
    for _ in range(INVALID_REQUESTS_COUNT // 10):
        payloads.append(_build_bad_type_id_payload(project_id))

    results: list[_InvalidResult] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures: list[Future[_InvalidResult]] = [
            executor.submit(_send_invalid_request, nexus_api, payload) for payload in payloads
        ]
        for future in as_completed(futures):
            results.append(future.result())

    return results


def _create_valid_baseline(
    nexus_api: NexusApiRegistry,
    credential_type_map: dict[str, UUID],
    project_id: UUID,
) -> tuple[list[float], list[str]]:
    """Create VALID_BASELINE_COUNT valid credentials concurrently to match invalid request load."""
    type_cycle = itertools.cycle(CREDENTIAL_TYPE_NAMES)
    latencies: list[float] = []
    created_ids: list[str] = []

    # Build all payloads first
    payloads: list[tuple[str, UUID]] = []
    for _ in range(VALID_BASELINE_COUNT):
        type_name = next(type_cycle)
        type_id = credential_type_map[type_name]
        payloads.append((type_name, type_id))

    # Execute concurrently with same workers as invalid requests
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = [
            executor.submit(
                create_credential,
                nexus_api,
                credential_type_name=type_name,
                credential_type_id=type_id,
                project_id=project_id,
                name_prefix="perf-suite22-valid-baseline",
            )
            for type_name, type_id in payloads
        ]
        for future in as_completed(futures):
            elapsed_ms, ok, cred_id = future.result()
            if ok:
                latencies.append(elapsed_ms)
            if cred_id:
                created_ids.append(cred_id)

    return latencies, created_ids


def _build_diagnostic(
    *,
    rejection_count: int,
    rejection_422_count: int,
    unexpected_success_count: int,
    non_422_error_count: int,
    rej_p50: float,
    rej_p95: float,
    valid_count: int,
    valid_p50: float,
    valid_p95: float,
    server_post_count: int,
) -> str:
    """Build a diagnostic string for validation rejection results."""
    parts = [
        "\n--- Schema validation rejection results (22.10) ---",
        f"  invalid_requests={rejection_count} (target_rps ~{INVALID_REQUESTS_COUNT // 4})",
        f"  422/400/404={rejection_422_count},"
        f" unexpected_2xx={unexpected_success_count},"
        f" other_errors={non_422_error_count}",
        f"  rejection latency: p50={rej_p50:.1f}ms, p95={rej_p95:.1f}ms (target p95 < {TARGET_REJECTION_P95_MS}ms)",
        f"  valid baseline: count={valid_count}, p50={valid_p50:.1f}ms, p95={valid_p95:.1f}ms",
        f"  rejection faster than valid? p50: {rej_p50:.1f}ms vs {valid_p50:.1f}ms"
        f" ({'YES' if rej_p50 < valid_p50 else 'NO'})",
        f"  server POST records={server_post_count}",
    ]
    return "\n".join(parts) + "\n"
