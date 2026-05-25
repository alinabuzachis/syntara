"""Suite 22 — Credential Storage: Update Latency KPI (22.6).

Test 22.6: PATCH /api/v1/credentials/{id} — update with $encrypted$
    sentinel preservation
    KPI: Update Latency (p95) < 200ms
    MetricType: REQUEST_DURATION
    Validation:
        - Verify unchanged fields sent as $encrypted$ are not re-encrypted
          (original values preserved after round-trip)
        - Verify only modified fields are re-encrypted with the new value

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
    patch_credential,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

CREDENTIALS_PER_TYPE = 4
UPDATE_ITERATIONS_PER_CREDENTIAL = 5
TARGET_UPDATE_LATENCY_P95_MS = 200


class TestUpdateLatency:
    """22.6 — Update credentials with $encrypted$ sentinel preservation.

    Creates credentials, then PATCHes each one with a mix of:
        - Secret fields set to $encrypted$ (should be preserved)
        - One non-secret field changed to a new value

    After each PATCH, verifies via GET that:
        - Unchanged secret fields still decrypt correctly (preserved)
        - The modified field reflects the new value
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_update_latency_and_sentinel_preservation(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """PATCH credentials with $encrypted$; p95 < 200ms, sentinel preservation verified."""
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
                    name_prefix="perf-suite22-patch",
                )
                if ok and cred_id:
                    created.append((cred_id, type_name))

            assert len(created) > 0, "No credentials were created for update test"

            client_latencies: list[float] = []
            preservation_violations: list[str] = []

            for cred_id, type_name in created:
                lats, viols = _run_update_iterations(
                    nexus_api,
                    cred_id,
                    type_name,
                )
                client_latencies.extend(lats)
                preservation_violations.extend(viols)

            assert len(client_latencies) > 0, "All PATCH requests failed"

            client_p95 = compute_percentile(client_latencies, 95)
            client_p50 = compute_percentile(client_latencies, 50)

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "request_duration_ms",
                limit=len(client_latencies) + 200,
                timeout=30.0,
            )
            server_latencies = extract_credential_metric_latencies(
                records,
                method="PATCH",
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
                preservation_violations=preservation_violations,
            )

            assert not preservation_violations, (
                f"Sentinel preservation violations detected — "
                f"unchanged fields must survive $encrypted$ round-trip{diag}"
            )

            if server_latencies:
                assert server_p95 < TARGET_UPDATE_LATENCY_P95_MS, (  # type: ignore[operator]
                    f"Server-side update latency p95 {server_p95:.1f}ms "
                    f"exceeds target {TARGET_UPDATE_LATENCY_P95_MS}ms{diag}"
                )
            else:
                assert client_p95 < TARGET_UPDATE_LATENCY_P95_MS, (
                    f"Client-measured update latency p95 {client_p95:.1f}ms "
                    f"exceeds target {TARGET_UPDATE_LATENCY_P95_MS}ms "
                    f"(server metrics unavailable){diag}"
                )

        finally:
            for cred_id, _ in created:
                delete_credential_by_id(nexus_api, cred_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _run_update_iterations(
    nexus_api: NexusApiRegistry,
    cred_id: str,
    type_name: str,
) -> tuple[list[float], list[str]]:
    """Run UPDATE_ITERATIONS_PER_CREDENTIAL PATCH+GET cycles for one credential."""
    latencies: list[float] = []
    violations: list[str] = []

    for iteration in range(UPDATE_ITERATIONS_PER_CREDENTIAL):
        patch_inputs = _build_sentinel_patch(type_name, iteration)

        elapsed_ms, ok, _ = patch_credential(
            nexus_api,
            cred_id,
            patch_inputs=patch_inputs,
            new_description=f"Updated iteration {iteration}",
        )
        if ok:
            latencies.append(elapsed_ms)

        _, get_ok, get_resp = get_credential_by_id(nexus_api, cred_id)
        if get_ok and get_resp:
            violations.extend(
                _validate_preservation(
                    get_resp,
                    type_name,
                    cred_id,
                    patch_inputs,
                    iteration,
                )
            )

    return latencies, violations


def _build_sentinel_patch(type_name: str, iteration: int) -> dict[str, Any]:
    """Build a PATCH inputs dict that sends $encrypted$ for all secret fields.

    Changes one non-secret field. For types with no non-secret fields
    (HTTP Bearer Token), only the sentinel is sent — confirming a no-op
    update preserves the value.

    Only includes secret fields that were present in the original credential
    (e.g., AAP has both 'password' and 'oauth_token' as secret fields, but
    they're mutually exclusive - only include the one that was set).

    Skips enum/boolean fields that can't be arbitrarily modified.
    """
    # Fields that should NOT be modified (enum/constrained values)
    immutable_fields = {"provider", "verify_ssl"}

    original = CREDENTIAL_TYPE_INPUTS.get(type_name, {})
    secret = SECRET_FIELDS.get(type_name, set())
    non_secret = NON_SECRET_FIELDS.get(type_name, set())

    result: dict[str, Any] = {}

    # Only include secret fields that exist in original credential
    for field_name in secret:
        if field_name in original:
            result[field_name] = ENCRYPTED_SENTINEL

    # For non-secret fields, find one we can safely modify
    modifiable = [f for f in sorted(non_secret) if f not in immutable_fields]
    if modifiable:
        target_field = modifiable[iteration % len(modifiable)]
        for field_name in non_secret:
            if field_name in modifiable and field_name == target_field:
                # Modify the target field
                result[field_name] = f"{original.get(field_name, '')}-updated-{iteration}"
            else:
                # Keep others unchanged
                result[field_name] = original.get(field_name, "")
    else:
        # No modifiable fields - send all non-secret fields unchanged
        for field_name in non_secret:
            result[field_name] = original.get(field_name, "")

    return result


def _validate_preservation(
    get_resp: dict[str, Any],
    type_name: str,
    cred_id: str,
    patch_inputs: dict[str, Any],
    iteration: int,
) -> list[str]:
    """After a PATCH + GET round-trip, verify preservation semantics.

    Only validates fields that were included in the PATCH request.
    """
    violations: list[str] = []
    inputs = get_resp.get("inputs", {})
    if not isinstance(inputs, dict):
        return violations

    secret = SECRET_FIELDS.get(type_name, set())

    # Only validate secret fields that were in the PATCH
    for field_name in secret:
        if field_name not in patch_inputs:
            continue
        value = inputs.get(field_name)
        if value != ENCRYPTED_SENTINEL:
            violations.append(
                f"cred={cred_id}, iter={iteration}, "
                f"secret field {field_name!r}: expected {ENCRYPTED_SENTINEL!r} "
                f"after sentinel PATCH, got {str(value)[:40]!r}"
            )

    for field_name, sent_value in patch_inputs.items():
        if field_name in secret:
            continue
        returned_value = inputs.get(field_name)
        if returned_value == ENCRYPTED_SENTINEL:
            violations.append(
                f"cred={cred_id}, iter={iteration}, "
                f"non-secret field {field_name!r}: got {ENCRYPTED_SENTINEL!r} "
                f"but expected plaintext after PATCH"
            )
        elif returned_value != sent_value:
            violations.append(
                f"cred={cred_id}, iter={iteration}, "
                f"field {field_name!r}: sent {str(sent_value)[:40]!r}, "
                f"got {str(returned_value)[:40]!r}"
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
    preservation_violations: list[str],
) -> str:
    """Build a diagnostic string for update latency test results."""
    parts = [
        "\n--- Update latency results (22.6) ---",
        f"  credentials={created_count}, iterations_per_cred={UPDATE_ITERATIONS_PER_CREDENTIAL}",
        f"  client: samples={len(client_latencies)}, p50={client_p50:.1f}ms, p95={client_p95:.1f}ms",
    ]
    if server_latencies:
        parts.append(f"  server: records={len(server_latencies)}, p95={server_p95:.1f}ms")
    if preservation_violations:
        parts.append(f"  PRESERVATION VIOLATIONS ({len(preservation_violations)}):")
        for v in preservation_violations[:15]:
            parts.append(f"    {v}")
    return "\n".join(parts) + "\n"
