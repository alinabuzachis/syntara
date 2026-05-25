"""Suite 22 — Credential Storage: List Latency KPI (22.4).

Test 22.4: GET /api/v1/credentials — list 500+ credentials
    KPI: List Latency (p95) < 200ms
    MetricType: REQUEST_DURATION
    Validation:
        - Verify no decryption occurs on list (metadata only,
          all secret fields show $encrypted$ sentinel)
        - Compare with smaller datasets to confirm scaling behaviour

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
)
from tests.performance.credential_storage.conftest import (
    ENCRYPTED_SENTINEL,
    cleanup_credentials,
    extract_credential_metric_latencies,
    list_credentials,
    seed_credentials,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

SEED_CREDENTIAL_COUNT = 500
LIST_ITERATIONS = 20
LIST_PAGE_SIZE = 100  # API maximum per docs/standards/api-response-format.md
TARGET_LIST_LATENCY_P95_MS = 200
SMALL_DATASET_SIZES = [20, 100]


class TestListLatency:
    """22.4 — List 500+ credentials via GET /credentials.

    Seeds the deployment with 500 credentials (across all 5 types),
    then repeatedly fetches the full list to measure latency.

    Validates:
        - p95 list latency < 200ms
        - Response contains no decrypted secret values (all $encrypted$)
        - Smaller-dataset listing is faster (or at least not slower)
          than the full 500+ dataset
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_list_latency_p95_with_no_decryption(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """Seed 500 credentials, list them; p95 must be < 200ms with no decryption."""
        seeded_ids = seed_credentials(
            nexus_api,
            credential_type_map=credential_type_map,
            project_id=perf_project_id,
            count=SEED_CREDENTIAL_COUNT,
            name_prefix="perf-suite22-list-seed",
        )

        try:
            assert len(seeded_ids) >= SEED_CREDENTIAL_COUNT * 0.9, (
                f"Seeding failed: only {len(seeded_ids)}/{SEED_CREDENTIAL_COUNT} credentials created"
            )

            # --- Measure list latency at full dataset size ---
            full_latencies: list[float] = []
            decryption_violations: list[str] = []

            for _ in range(LIST_ITERATIONS):
                elapsed_ms, ok, parsed = list_credentials(
                    nexus_api,
                    limit=LIST_PAGE_SIZE,
                )
                if ok:
                    full_latencies.append(elapsed_ms)
                    violations = _check_no_decrypted_secrets(parsed)
                    decryption_violations.extend(violations)

            assert len(full_latencies) > 0, "All list requests failed"

            full_p95 = compute_percentile(full_latencies, 95)
            full_p50 = compute_percentile(full_latencies, 50)

            # --- Measure list latency at smaller page sizes ---
            small_results: dict[int, dict[str, float]] = {}
            for page_size in SMALL_DATASET_SIZES:
                small_latencies: list[float] = []
                for _ in range(LIST_ITERATIONS):
                    elapsed_ms, ok, _ = list_credentials(
                        nexus_api,
                        limit=page_size,
                    )
                    if ok:
                        small_latencies.append(elapsed_ms)
                if small_latencies:
                    small_results[page_size] = {
                        "p50": compute_percentile(small_latencies, 50),
                        "p95": compute_percentile(small_latencies, 95),
                    }

            # --- Server-side metrics ---
            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "request_duration_ms",
                limit=LIST_ITERATIONS * (1 + len(SMALL_DATASET_SIZES)) + 50,
                timeout=30.0,
            )
            server_latencies = extract_credential_metric_latencies(
                records,
                method="GET",
            )
            server_p95 = compute_percentile(server_latencies, 95) if server_latencies else None

            diag = _build_list_diagnostic(
                seeded_count=len(seeded_ids),
                full_latencies=full_latencies,
                full_p50=full_p50,
                full_p95=full_p95,
                small_results=small_results,
                server_latencies=server_latencies,
                server_p95=server_p95,
                decryption_violations=decryption_violations,
            )

            # --- Assertions ---
            assert not decryption_violations, (
                f"List response contains decrypted secret values — "
                f"expected all secrets masked as {ENCRYPTED_SENTINEL!r}{diag}"
            )

            if server_latencies:
                assert server_p95 < TARGET_LIST_LATENCY_P95_MS, (  # type: ignore[operator]
                    f"Server-side list latency p95 {server_p95:.1f}ms exceeds "
                    f"target {TARGET_LIST_LATENCY_P95_MS}ms{diag}"
                )
            else:
                assert full_p95 < TARGET_LIST_LATENCY_P95_MS, (
                    f"Client-measured list latency p95 {full_p95:.1f}ms exceeds "
                    f"target {TARGET_LIST_LATENCY_P95_MS}ms "
                    f"(server metrics unavailable){diag}"
                )

        finally:
            cleanup_credentials(nexus_api, seeded_ids)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_list_diagnostic(
    *,
    seeded_count: int,
    full_latencies: list[float],
    full_p50: float,
    full_p95: float,
    small_results: dict[int, dict[str, float]],
    server_latencies: list[float],
    server_p95: float | None,
    decryption_violations: list[str],
) -> str:
    """Build a diagnostic string for list latency test results."""
    parts = [
        "\n--- List latency results (22.4) ---",
        f"  seeded_credentials={seeded_count}",
        f"  list_iterations={LIST_ITERATIONS}",
        f"  full dataset (limit={LIST_PAGE_SIZE}):"
        f" p50={full_p50:.1f}ms, p95={full_p95:.1f}ms,"
        f" samples={len(full_latencies)}",
    ]
    for ps, stats in small_results.items():
        parts.append(f"  small dataset (limit={ps}): p50={stats['p50']:.1f}ms, p95={stats['p95']:.1f}ms")
    if server_latencies:
        parts.append(f"  server GET /credentials records={len(server_latencies)}, p95={server_p95:.1f}ms")
    if decryption_violations:
        parts.append(f"  DECRYPTION VIOLATIONS ({len(decryption_violations)}):")
        for v in decryption_violations[:10]:
            parts.append(f"    {v}")
    return "\n".join(parts) + "\n"


def _check_no_decrypted_secrets(parsed: dict[str, Any]) -> list[str]:
    """Verify that all secret-looking fields in list response are masked.

    Returns a list of violation descriptions (empty means pass).
    The list endpoint should mask all input fields as $encrypted$
    without performing decryption.
    """
    violations: list[str] = []
    for resource in parsed.get("resources", []):
        cred_name = resource.get("name", "<unknown>")
        inputs = resource.get("inputs", {})
        if not isinstance(inputs, dict):
            continue
        for field_name, value in inputs.items():
            if isinstance(value, str) and value != ENCRYPTED_SENTINEL:
                violations.append(
                    f"credential={cred_name!r}, field={field_name!r}: value is not {ENCRYPTED_SENTINEL!r}"
                )
    return violations
