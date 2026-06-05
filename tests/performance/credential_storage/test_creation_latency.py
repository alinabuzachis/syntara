"""Suite 22 — Credential Storage: Creation Latency KPI (22.1).

Test 22.1: Create 200 credentials sequentially (mix of 5 types:
    Bearer, Basic Auth, AAP, LLM Provider, SSH Key)
    KPI: Creation Latency (p95) < 200ms
    MetricType: REQUEST_DURATION
    Validation:
        /_internal/metrics/records → filter endpoint=/api/v1/credentials,
        method=POST

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
)
from tests.performance.credential_storage.conftest import (
    CREDENTIAL_TYPE_NAMES,
    create_credential,
    delete_credential_by_id,
    extract_credential_metric_latencies,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.stdlib.get_logger(__name__)

SEQUENTIAL_CREDENTIAL_COUNT = 200
TARGET_CREATION_LATENCY_P95_MS = 200


class TestCreationLatency:
    """22.1 — Create 200 credentials sequentially (5 types).

    Creates credentials in a round-robin fashion across all 5 managed
    credential types, then validates:
        - Client-measured p95 creation latency < 200ms
        - Server-side REQUEST_DURATION records for POST /credentials
          confirm the p95 stays below the target threshold
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_sequential_creation_latency_p95(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """Create 200 credentials sequentially; p95 latency must be < 200ms."""
        logger.info(
            "Starting sequential credential creation test",
            total_count=SEQUENTIAL_CREDENTIAL_COUNT,
            target_p95_ms=TARGET_CREATION_LATENCY_P95_MS,
            credential_types=len(CREDENTIAL_TYPE_NAMES),
        )

        type_cycle = itertools.cycle(CREDENTIAL_TYPE_NAMES)

        created_ids: list[str] = []
        client_latencies: list[float] = []
        failures = 0
        failure_details: list[str] = []

        try:
            for i in range(SEQUENTIAL_CREDENTIAL_COUNT):
                type_name = next(type_cycle)
                type_id = credential_type_map[type_name]

                elapsed_ms, ok, cred_id = create_credential(
                    nexus_api,
                    credential_type_name=type_name,
                    credential_type_id=type_id,
                    project_id=perf_project_id,
                )

                client_latencies.append(elapsed_ms)
                if ok and cred_id:
                    created_ids.append(cred_id)
                else:
                    failures += 1
                    failure_details.append(f"  credential {i} ({type_name}): elapsed={elapsed_ms:.1f}ms, ok={ok}")
                    logger.warning(
                        "Credential creation failed",
                        index=i,
                        credential_type=type_name,
                        elapsed_ms=round(elapsed_ms, 1),
                    )

                # Log progress every 50 credentials
                if (i + 1) % 50 == 0:
                    current_p95 = compute_percentile(client_latencies, 95)
                    logger.info(
                        "Creation progress",
                        completed=i + 1,
                        total=SEQUENTIAL_CREDENTIAL_COUNT,
                        successes=len(created_ids),
                        failures=failures,
                        current_p95_ms=round(current_p95, 1),
                    )

            assert len(client_latencies) > 0, "No credentials were created"

            client_p95 = compute_percentile(client_latencies, 95)
            client_p50 = compute_percentile(client_latencies, 50)
            success_count = len(created_ids)
            success_rate = success_count / SEQUENTIAL_CREDENTIAL_COUNT

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "request_duration_ms",
                limit=SEQUENTIAL_CREDENTIAL_COUNT + 50,
                timeout=30.0,
            )

            server_latencies = extract_credential_metric_latencies(
                records,
                method="POST",
            )
            server_p95 = compute_percentile(server_latencies, 95) if server_latencies else None
            server_p50 = compute_percentile(server_latencies, 50) if server_latencies else None

            logger.info(
                "Sequential credential creation completed",
                total=SEQUENTIAL_CREDENTIAL_COUNT,
                successes=success_count,
                failures=failures,
                success_rate=round(success_rate, 3),
                client_p50_ms=round(client_p50, 1),
                client_p95_ms=round(client_p95, 1),
                server_records=len(server_latencies) if server_latencies else 0,
                server_p95_ms=round(server_p95, 1) if server_p95 else None,
            )

            diag_header = (
                f"\n--- Creation latency results (22.1) ---\n"
                f"  total={SEQUENTIAL_CREDENTIAL_COUNT}, "
                f"successes={success_count}, failures={failures}\n"
                f"  success_rate={success_rate:.2%}\n"
                f"  client: p50={client_p50:.1f}ms, p95={client_p95:.1f}ms\n"
            )
            if server_latencies:
                diag = (
                    diag_header + f"  server: records={len(server_latencies)}, "
                    f"p50={server_p50:.1f}ms, p95={server_p95:.1f}ms\n"
                )
            else:
                diag = diag_header + "  server: no request_duration_ms records for POST /credentials\n"
            if failure_details:
                diag += "--- Failure details ---\n" + "\n".join(failure_details[:20]) + "\n"

            assert success_rate > 0.90, f"Credential creation success rate {success_rate:.2%} is below 90%{diag}"

            if server_latencies:
                assert server_p95 < TARGET_CREATION_LATENCY_P95_MS, (  # type: ignore[operator]
                    f"Server-side creation latency p95 {server_p95:.1f}ms exceeds "
                    f"target {TARGET_CREATION_LATENCY_P95_MS}ms{diag}"
                )
            else:
                assert client_p95 < TARGET_CREATION_LATENCY_P95_MS, (
                    f"Client-measured creation latency p95 {client_p95:.1f}ms exceeds "
                    f"target {TARGET_CREATION_LATENCY_P95_MS}ms "
                    f"(server metrics unavailable){diag}"
                )

        finally:
            for cred_id in created_ids:
                delete_credential_by_id(nexus_api, cred_id)
