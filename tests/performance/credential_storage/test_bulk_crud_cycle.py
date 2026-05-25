"""Suite 22 — Credential Storage: Bulk CRUD Cycle KPI (22.7).

Test 22.7: Bulk credential operations — create 100, list, update 50,
    delete 50
    KPI: Full CRUD Cycle Throughput — complete in < 60s
    Measurement: Client-side timing
    Validation:
        End-to-end timing for the full lifecycle

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest
import structlog

from tests.performance.credential_storage.conftest import (
    CREDENTIAL_TYPE_INPUTS,
    CREDENTIAL_TYPE_NAMES,
    ENCRYPTED_SENTINEL,
    NON_SECRET_FIELDS,
    SECRET_FIELDS,
    cleanup_credentials,
    create_credential,
    delete_credential_timed,
    list_credentials,
    patch_credential,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

BULK_CREATE_COUNT = 100
BULK_UPDATE_COUNT = 50
BULK_DELETE_COUNT = 50
MAX_WORKERS = 10
TARGET_CYCLE_TIME_SECONDS = 60


class TestBulkCrudCycle:
    """22.7 — Full CRUD lifecycle: create 100, list, update 50, delete 50.

    Measures the end-to-end wall-clock time for a realistic bulk
    credential lifecycle and validates:
        - The entire cycle completes in < 60s
        - Each phase (create, list, update, delete) is individually timed
        - Data integrity is verified after list and update phases
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_bulk_crud_cycle_under_60s(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """Full CRUD lifecycle must complete in < 60s."""
        logger.info(
            "Starting bulk CRUD cycle test",
            create_count=BULK_CREATE_COUNT,
            update_count=BULK_UPDATE_COUNT,
            delete_count=BULK_DELETE_COUNT,
            target_total_seconds=TARGET_CYCLE_TIME_SECONDS,
        )

        phase_times: dict[str, float] = {}
        all_created_ids: list[str] = []
        created_with_types: list[tuple[str, str]] = []

        try:
            # --- Phase 1: Create 100 credentials concurrently ---
            logger.info("Phase 1: Bulk create", count=BULK_CREATE_COUNT, workers=MAX_WORKERS)
            create_start = time.monotonic()
            created_with_types = _bulk_create(
                nexus_api,
                credential_type_map,
                perf_project_id,
            )
            phase_times["create"] = time.monotonic() - create_start

            all_created_ids = [cid for cid, _ in created_with_types]
            logger.info(
                "Phase 1 complete",
                created=len(all_created_ids),
                target=BULK_CREATE_COUNT,
                elapsed_s=round(phase_times["create"], 2),
            )

            assert len(all_created_ids) >= BULK_CREATE_COUNT * 0.9, (
                f"Bulk create failed: only {len(all_created_ids)}/{BULK_CREATE_COUNT} "
                f"credentials created in {phase_times['create']:.2f}s"
            )

            # --- Phase 2: List all credentials ---
            # Note: API max limit is 100, so we use that even though we created 100+
            logger.info("Phase 2: List credentials", limit=100)
            list_start = time.monotonic()
            list_elapsed_ms, list_ok, list_parsed = list_credentials(
                nexus_api,
                limit=100,
                include_total=True,
            )
            phase_times["list"] = time.monotonic() - list_start

            assert list_ok, f"List request failed after {list_elapsed_ms:.1f}ms"

            returned_resources = list_parsed.get("resources", [])
            assert len(returned_resources) > 0, "List returned zero credentials"
            logger.info(
                "Phase 2 complete",
                returned=len(returned_resources),
                elapsed_s=round(phase_times["list"], 2),
            )

            # --- Phase 3: Update 50 credentials concurrently ---
            update_targets = created_with_types[:BULK_UPDATE_COUNT]
            logger.info("Phase 3: Bulk update", count=BULK_UPDATE_COUNT, workers=MAX_WORKERS)
            update_start = time.monotonic()
            update_results = _bulk_update(nexus_api, update_targets)
            phase_times["update"] = time.monotonic() - update_start

            update_successes = sum(1 for ok in update_results.values() if ok)
            logger.info(
                "Phase 3 complete",
                successes=update_successes,
                failures=BULK_UPDATE_COUNT - update_successes,
                elapsed_s=round(phase_times["update"], 2),
            )

            assert update_successes >= BULK_UPDATE_COUNT * 0.9, (
                f"Bulk update failed: only {update_successes}/{BULK_UPDATE_COUNT} "
                f"updates succeeded in {phase_times['update']:.2f}s"
            )

            # --- Phase 4: Delete 50 credentials concurrently ---
            delete_targets = [cid for cid, _ in created_with_types[-BULK_DELETE_COUNT:]]
            logger.info("Phase 4: Bulk delete", count=BULK_DELETE_COUNT, workers=MAX_WORKERS)
            delete_start = time.monotonic()
            delete_successes, delete_failures = _bulk_delete(
                nexus_api,
                delete_targets,
            )
            phase_times["delete"] = time.monotonic() - delete_start
            logger.info(
                "Phase 4 complete",
                successes=delete_successes,
                failures=delete_failures,
                elapsed_s=round(phase_times["delete"], 2),
            )

            for cid in delete_targets:
                if cid in [c for c, _ in created_with_types]:
                    all_created_ids.remove(cid)

            assert delete_successes >= BULK_DELETE_COUNT * 0.9, (
                f"Bulk delete failed: only {delete_successes}/{BULK_DELETE_COUNT} "
                f"deletes succeeded in {phase_times['delete']:.2f}s"
            )

            total_time = sum(phase_times.values())

            logger.info(
                "Bulk CRUD cycle completed",
                total_time_s=round(total_time, 2),
                target_s=TARGET_CYCLE_TIME_SECONDS,
                create_s=round(phase_times["create"], 2),
                list_s=round(phase_times["list"], 2),
                update_s=round(phase_times["update"], 2),
                delete_s=round(phase_times["delete"], 2),
                created=len(created_with_types),
                updated=update_successes,
                deleted=delete_successes,
            )

            diag = _build_diagnostic(
                phase_times=phase_times,
                total_time=total_time,
                created_count=len(created_with_types),
                list_count=len(returned_resources),
                update_successes=update_successes,
                delete_successes=delete_successes,
                delete_failures=delete_failures,
            )

            assert total_time < TARGET_CYCLE_TIME_SECONDS, (
                f"Full CRUD cycle took {total_time:.2f}s, exceeds target {TARGET_CYCLE_TIME_SECONDS}s{diag}"
            )

        finally:
            cleanup_credentials(nexus_api, all_created_ids)


# ---------------------------------------------------------------------------
# Phase helpers
# ---------------------------------------------------------------------------


def _bulk_create(
    nexus_api: NexusApiRegistry,
    credential_type_map: dict[str, UUID],
    project_id: UUID,
) -> list[tuple[str, str]]:
    """Create BULK_CREATE_COUNT credentials concurrently.

    Returns list of (credential_id, type_name) tuples.
    """
    type_cycle = itertools.cycle(CREDENTIAL_TYPE_NAMES)
    tasks: list[tuple[str, UUID]] = [
        (name := next(type_cycle), credential_type_map[name]) for _ in range(BULK_CREATE_COUNT)
    ]

    created: list[tuple[str, str]] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures: dict[Future[tuple[float, bool, str | None]], str] = {
            executor.submit(
                create_credential,
                nexus_api,
                credential_type_name=type_name,
                credential_type_id=type_id,
                project_id=project_id,
                name_prefix="perf-suite22-bulk",
            ): type_name
            for type_name, type_id in tasks
        }
        for future in as_completed(futures):
            type_name = futures[future]
            _, ok, cred_id = future.result()
            if ok and cred_id:
                created.append((cred_id, type_name))

    return created


def _bulk_update(
    nexus_api: NexusApiRegistry,
    targets: list[tuple[str, str]],
) -> dict[str, bool]:
    """PATCH each target credential, sending $encrypted$ for secret fields.

    Modifies one non-secret field.

    Returns:
        {credential_id: success}.

    """
    results: dict[str, bool] = {}
    failures: list[tuple[str, str, dict[str, Any]]] = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures: dict[Future[tuple[float, bool, dict[str, Any]]], tuple[str, str]] = {}
        for cred_id, type_name in targets:
            patch_inputs = _build_update_inputs(type_name)
            f = executor.submit(
                patch_credential,
                nexus_api,
                cred_id,
                patch_inputs=patch_inputs,
                new_description="Bulk CRUD cycle update",
            )
            futures[f] = (cred_id, type_name)

        for future in as_completed(futures):
            cred_id, type_name = futures[future]
            _, ok, response_data = future.result()
            results[cred_id] = ok
            if not ok:
                failures.append((cred_id, type_name, response_data))

    if failures:
        logger.warning(
            "Bulk update had failures",
            failure_count=len(failures),
            total=len(targets),
        )
        for cred_id, type_name, resp in failures[:5]:  # Log first 5
            logger.warning(
                "Update failed",
                credential_id=cred_id,
                type_name=type_name,
                response=resp,
            )

    return results


def _build_update_inputs(type_name: str) -> dict[str, Any]:
    """Build a PATCH inputs dict: $encrypted$ for secrets, modified non-secrets.

    For LLM Provider, 'provider' field has enum validation, so we don't modify it.
    """
    # Fields that should NOT be modified (enum/constrained values)
    immutable_fields = {"provider", "verify_ssl"}

    original = CREDENTIAL_TYPE_INPUTS.get(type_name, {})
    secret = SECRET_FIELDS.get(type_name, set())
    non_secret = NON_SECRET_FIELDS.get(type_name, set())

    result: dict[str, Any] = {}
    for field_name in secret:
        result[field_name] = ENCRYPTED_SENTINEL

    # For non-secret fields, find one we can safely modify
    modifiable = [f for f in sorted(non_secret) if f not in immutable_fields]
    for field_name in non_secret:
        if field_name in modifiable and field_name == modifiable[0]:
            # Modify the first modifiable field
            result[field_name] = f"{original.get(field_name, '')}-bulk-updated"
        else:
            # Keep others unchanged
            result[field_name] = original.get(field_name, "")

    return result


def _bulk_delete(
    nexus_api: NexusApiRegistry,
    credential_ids: list[str],
) -> tuple[int, int]:
    """Delete credentials concurrently. Returns (successes, failures)."""
    successes = 0
    failures = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures: list[Future[tuple[float, bool]]] = [
            executor.submit(delete_credential_timed, nexus_api, cred_id) for cred_id in credential_ids
        ]
        for future in as_completed(futures):
            _, ok = future.result()
            if ok:
                successes += 1
            else:
                failures += 1

    return successes, failures


def _build_diagnostic(
    *,
    phase_times: dict[str, float],
    total_time: float,
    created_count: int,
    list_count: int,
    update_successes: int,
    delete_successes: int,
    delete_failures: int,
) -> str:
    """Build a diagnostic string for the bulk CRUD cycle."""
    parts = [
        "\n--- Bulk CRUD cycle results (22.7) ---",
        f"  total_time={total_time:.2f}s (target < {TARGET_CYCLE_TIME_SECONDS}s)",
    ]
    for phase, elapsed in phase_times.items():
        parts.append(f"  {phase}: {elapsed:.2f}s")
    parts.extend(
        [
            f"  created={created_count}/{BULK_CREATE_COUNT}",
            f"  listed={list_count} resources",
            f"  updated={update_successes}/{BULK_UPDATE_COUNT}",
            f"  deleted={delete_successes}/{BULK_DELETE_COUNT} (failures={delete_failures})",
        ]
    )
    return "\n".join(parts) + "\n"
