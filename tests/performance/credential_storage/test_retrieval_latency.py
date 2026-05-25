"""Suite 22 — Credential Storage: Retrieval Latency KPI (22.5).

Test 22.5: GET /api/v1/credentials/{id} — retrieve single credential
    KPI: Retrieval Latency (p95) < 100ms
    MetricType: REQUEST_DURATION
    Validation:
        - Verify secret fields masked as $encrypted$
        - Verify non-secret fields decrypted (returned in plaintext)

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
)
from tests.performance.credential_storage.conftest import (
    CREDENTIAL_TYPE_INPUTS,
    CREDENTIAL_TYPE_NAMES,
    ENCRYPTED_SENTINEL,
    NON_SECRET_FIELDS,
    SECRET_FIELDS,
    create_credential,
    delete_credential_by_id,
    extract_credential_metric_latencies,
    get_credential_by_id,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

CREDENTIALS_PER_TYPE = 4
RETRIEVAL_ITERATIONS_PER_CREDENTIAL = 5
TARGET_RETRIEVAL_LATENCY_P95_MS = 100


class TestRetrievalLatency:
    """22.5 — Retrieve single credentials via GET /credentials/{id}.

    Creates a small set of credentials (4 per type = 20 total), then
    retrieves each one multiple times to build a latency sample.

    Validates:
        - p95 retrieval latency < 100ms
        - Secret fields are masked as $encrypted$
        - Non-secret fields are returned in plaintext (not encrypted)
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_retrieval_latency_and_masking(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """Retrieve credentials; p95 < 100ms, secrets masked, non-secrets decrypted."""
        type_cycle = itertools.cycle(CREDENTIAL_TYPE_NAMES)
        total_to_create = CREDENTIALS_PER_TYPE * len(CREDENTIAL_TYPE_NAMES)

        created: list[tuple[str, str]] = []

        try:
            for _ in range(total_to_create):
                type_name = next(type_cycle)
                type_id = credential_type_map[type_name]
                _, ok, cred_id = create_credential(
                    nexus_api,
                    credential_type_name=type_name,
                    credential_type_id=type_id,
                    project_id=perf_project_id,
                    name_prefix="perf-suite22-get",
                )
                if ok and cred_id:
                    created.append((cred_id, type_name))

            assert len(created) > 0, "No credentials were created for retrieval test"

            client_latencies: list[float] = []
            masking_violations: list[str] = []

            for cred_id, type_name in created:
                for _ in range(RETRIEVAL_ITERATIONS_PER_CREDENTIAL):
                    elapsed_ms, ok, parsed = get_credential_by_id(
                        nexus_api,
                        cred_id,
                    )
                    if ok:
                        client_latencies.append(elapsed_ms)
                        violations = _validate_field_masking(
                            parsed,
                            type_name,
                            cred_id,
                        )
                        masking_violations.extend(violations)

            assert len(client_latencies) > 0, "All retrieval requests failed"

            client_p95 = compute_percentile(client_latencies, 95)
            client_p50 = compute_percentile(client_latencies, 50)

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "request_duration_ms",
                limit=len(client_latencies) + 100,
                timeout=30.0,
            )
            server_latencies = extract_credential_metric_latencies(
                records,
                method="GET",
                single_resource=True,
            )
            server_p95 = compute_percentile(server_latencies, 95) if server_latencies else None

            diag = _build_diagnostic(
                created_count=len(created),
                client_latencies=client_latencies,
                client_p50=client_p50,
                client_p95=client_p95,
                server_latencies=server_latencies,
                server_p95=server_p95,
                masking_violations=masking_violations,
            )

            assert not masking_violations, (
                f"Field masking violations detected — secret fields must be "
                f"{ENCRYPTED_SENTINEL!r} and non-secret fields must be "
                f"plaintext{diag}"
            )

            if server_latencies:
                assert server_p95 < TARGET_RETRIEVAL_LATENCY_P95_MS, (  # type: ignore[operator]
                    f"Server-side retrieval latency p95 {server_p95:.1f}ms "
                    f"exceeds target {TARGET_RETRIEVAL_LATENCY_P95_MS}ms{diag}"
                )
            else:
                assert client_p95 < TARGET_RETRIEVAL_LATENCY_P95_MS, (
                    f"Client-measured retrieval latency p95 {client_p95:.1f}ms "
                    f"exceeds target {TARGET_RETRIEVAL_LATENCY_P95_MS}ms "
                    f"(server metrics unavailable){diag}"
                )

        finally:
            for cred_id, _ in created:
                delete_credential_by_id(nexus_api, cred_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _validate_field_masking(
    parsed: dict[str, Any],
    type_name: str,
    cred_id: str,
) -> list[str]:
    """Check that secret fields are $encrypted$ and non-secret fields are plaintext."""
    violations: list[str] = []
    inputs = parsed.get("inputs", {})
    if not isinstance(inputs, dict):
        return violations

    expected_secret = SECRET_FIELDS.get(type_name, set())
    expected_non_secret = NON_SECRET_FIELDS.get(type_name, set())
    original_inputs = CREDENTIAL_TYPE_INPUTS.get(type_name, {})

    for field_name, value in inputs.items():
        if field_name in expected_secret:
            if value != ENCRYPTED_SENTINEL:
                violations.append(
                    f"cred={cred_id}, type={type_name!r}, "
                    f"secret field {field_name!r}: expected "
                    f"{ENCRYPTED_SENTINEL!r}, got {str(value)[:40]!r}"
                )
        elif field_name in expected_non_secret:
            if value == ENCRYPTED_SENTINEL:
                violations.append(
                    f"cred={cred_id}, type={type_name!r}, "
                    f"non-secret field {field_name!r}: should be "
                    f"plaintext but got {ENCRYPTED_SENTINEL!r}"
                )
            expected_value = original_inputs.get(field_name)
            if expected_value is not None and value != expected_value:
                violations.append(
                    f"cred={cred_id}, type={type_name!r}, "
                    f"non-secret field {field_name!r}: expected "
                    f"{str(expected_value)[:40]!r}, got {str(value)[:40]!r}"
                )

    return violations


def _build_diagnostic(
    *,
    created_count: int,
    client_latencies: list[float],
    client_p50: float,
    client_p95: float,
    server_latencies: list[float],
    server_p95: float | None,
    masking_violations: list[str],
) -> str:
    """Build a diagnostic string for retrieval latency test results."""
    parts = [
        "\n--- Retrieval latency results (22.5) ---",
        f"  credentials={created_count}, iterations_per_cred={RETRIEVAL_ITERATIONS_PER_CREDENTIAL}",
        f"  client: samples={len(client_latencies)}, p50={client_p50:.1f}ms, p95={client_p95:.1f}ms",
    ]
    if server_latencies:
        parts.append(f"  server: records={len(server_latencies)}, p95={server_p95:.1f}ms")
    if masking_violations:
        parts.append(f"  MASKING VIOLATIONS ({len(masking_violations)}):")
        for v in masking_violations[:15]:
            parts.append(f"    {v}")
    return "\n".join(parts) + "\n"
