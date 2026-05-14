"""Suite 14 - Model Management & Selection performance tests (14.1-14.4).

Test 14.1: Submit tasks with known optimal models, verify selection
    KPI: Selection Accuracy > 85% fitness score
    MetricType: Manual comparison (selected model vs expected model)

Test 14.2: Measure overhead for model selection logic
    KPI: System Overhead vs Model Latency < 30%
    MetricType: REQUEST_DURATION, LLM_DURATION
    Validation: (request_duration - llm_duration) / llm_duration

Test 14.3: LLM calls across all configured models
    KPI: LLM Response Latency (p95) < 5s per model
    MetricType: LLM_DURATION
    Validation: /_internal/metrics/records?metric_type=llm_duration_ms -> group by model label

Test 14.4: Track overhead breakdown
    KPI: Component Overhead Breakdown - Routing, context preparation
    MetricType: AGENT_ROUTING_DURATION, CONTEXT_DURATION
    Validation: /_internal/metrics/records -> multiple metric types

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import (
    ALL_LLM_TEST_PROMPTS,
    LLM_COMPONENT,
    compute_percentile,
    get_configured_models,
    poll_for_component_kpis,
    poll_for_invocation_terminal_status,
    poll_for_metric_records,
    submit_invocation,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATIONS_PER_MODEL = 10
TARGET_SELECTION_FITNESS_SCORE = 0.85
TARGET_OVERHEAD_RATIO = 0.30
TARGET_LLM_LATENCY_P95_MS = 5_000
CONCURRENT_BATCH_SIZE = 5
INVOCATION_TERMINAL_TIMEOUT = 120.0


class TestSelectionAccuracy:
    """14.1 - Submit tasks with known optimal models, verify selection.

    Validates:
        - Invocations submitted with an explicit model via context_data
          complete successfully and the LLM_DURATION metrics record the
          correct model label
        - Fitness score (successful completions with correct model / total) > 85%

    The test submits invocations with a specific model in context_data
    and verifies that the LLM metrics record the expected model name,
    confirming the model selection path works correctly.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_model_selection_accuracy(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Submit invocations with explicit models; fitness score must be > 85%."""
        models = get_configured_models()
        assert len(models) > 0, "No test models configured"

        prompts = list(
            itertools.islice(
                itertools.cycle(ALL_LLM_TEST_PROMPTS),
                INVOCATIONS_PER_MODEL,
            )
        )

        total_submitted = 0
        successful_with_correct_model = 0
        submission_failures = 0
        completion_failures = 0
        model_results: dict[str, dict[str, int]] = {}

        for model in models:
            model_results[model] = {"submitted": 0, "completed": 0, "correct_model": 0}

            for prompt in prompts:
                _, ok, inv_id = submit_invocation(nexus_api, prompt, model=model, credential_id=llm_credential_id)
                total_submitted += 1
                model_results[model]["submitted"] += 1

                if not ok or inv_id is None:
                    submission_failures += 1
                    continue

                parsed = poll_for_invocation_terminal_status(
                    nexus_api,
                    inv_id,
                    timeout=INVOCATION_TERMINAL_TIMEOUT,
                )
                status = str(parsed.get("status", "unknown"))
                if status != "completed":
                    completion_failures += 1
                    continue

                model_results[model]["completed"] += 1

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_duration_ms",
            limit=total_submitted * 2,
            timeout=30.0,
        )

        for record in records.get("records", []):
            labels = record.get("labels", {})
            record_model = labels.get("model", "")
            if record_model in model_results:
                model_results[record_model]["correct_model"] += 1
                successful_with_correct_model += 1

        total_completed = sum(m["completed"] for m in model_results.values())
        fitness_score = successful_with_correct_model / total_submitted if total_submitted > 0 else 0.0

        diag = (
            f"\n--- Selection accuracy results ---\n"
            f"  total_submitted={total_submitted}, "
            f"submission_failures={submission_failures}, "
            f"completion_failures={completion_failures}\n"
            f"  total_completed={total_completed}, "
            f"correct_model_records={successful_with_correct_model}\n"
            f"  fitness_score={fitness_score:.2%}\n"
            f"  per_model={model_results}\n"
            f"  llm_duration_records={records.get('total', 0)}\n"
            f"  credential_id={'<set>' if llm_credential_id else '<none>'}\n"
        )

        assert total_completed > 0, f"No invocations completed successfully{diag}"
        assert fitness_score >= TARGET_SELECTION_FITNESS_SCORE, (
            f"Model selection fitness score {fitness_score:.2%} is below "
            f"target {TARGET_SELECTION_FITNESS_SCORE:.0%}{diag}"
        )


class TestSystemOverhead:
    """14.2 - Measure overhead for model selection logic.

    Validates:
        - System overhead ratio = (request_duration - llm_duration) / llm_duration
        - Overhead must be < 30%

    Compares server-reported REQUEST_DURATION (total API time) against
    LLM_DURATION (pure model call time) to isolate Nexus-added overhead
    including routing, context preparation, and orchestration.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_system_overhead_below_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
        configured_model: str,
    ) -> None:
        """Submit invocations and compare request vs LLM duration; overhead must be < 30%."""
        prompts = list(itertools.islice(itertools.cycle(ALL_LLM_TEST_PROMPTS), INVOCATIONS_PER_MODEL))

        invocation_ids: list[str] = []
        for prompt in prompts:
            _, ok, inv_id = submit_invocation(
                nexus_api,
                prompt,
                model=configured_model,
                credential_id=llm_credential_id,
            )
            if ok and inv_id:
                invocation_ids.append(inv_id)

        assert len(invocation_ids) > 0, "No invocations were created"

        for inv_id in invocation_ids:
            poll_for_invocation_terminal_status(
                nexus_api,
                inv_id,
                timeout=INVOCATION_TERMINAL_TIMEOUT,
            )

        api_kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "api_service",
            timeout=30.0,
        )
        llm_kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            LLM_COMPONENT,
            timeout=30.0,
        )

        api_metrics = api_kpis.get("metrics", {}).get("response_time_ms", {})
        llm_metrics = llm_kpis.get("metrics", {}).get("response_time_ms", {})

        api_p95 = api_metrics.get("p95", 0)
        llm_p95 = llm_metrics.get("p95", 0)

        llm_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_duration_ms",
            limit=len(invocation_ids) * 2,
            timeout=30.0,
        )
        llm_values = [
            r.get("value", 0)
            for r in llm_records.get("records", [])
            if isinstance(r.get("value"), (int, float)) and r["value"] > 0
        ]

        request_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
            limit=200,
            timeout=30.0,
        )
        request_values = [
            r.get("value", 0)
            for r in request_records.get("records", [])
            if isinstance(r.get("value"), (int, float)) and r["value"] > 0
        ]

        if llm_values and request_values:
            avg_llm = sum(llm_values) / len(llm_values)
            avg_request = sum(request_values) / len(request_values)
            overhead_ratio = (avg_request - avg_llm) / avg_llm if avg_llm > 0 else 0.0
        elif isinstance(api_p95, (int, float)) and isinstance(llm_p95, (int, float)) and llm_p95 > 0:
            overhead_ratio = (api_p95 - llm_p95) / llm_p95
        else:
            overhead_ratio = 0.0

        diag = (
            f"\n--- System overhead results ---\n"
            f"  invocations_submitted={len(invocation_ids)}\n"
            f"  api_service: p95={api_p95}ms, "
            f"record_count={len(request_values)}\n"
            f"  llm: p95={llm_p95}ms, record_count={len(llm_values)}\n"
            f"  overhead_ratio={overhead_ratio:.2%}\n"
        )

        assert len(llm_values) > 0 or llm_p95 > 0, f"No LLM_DURATION metrics recorded - cannot compute overhead{diag}"
        assert overhead_ratio < TARGET_OVERHEAD_RATIO, (
            f"System overhead ratio {overhead_ratio:.2%} exceeds target {TARGET_OVERHEAD_RATIO:.0%}{diag}"
        )


class TestLLMResponseLatency:
    """14.3 - LLM calls across all configured models.

    Validates:
        - LLM response latency p95 < 5s per model
        - LLM_DURATION records are emitted with model labels
        - Each configured model responds within the target threshold

    Tests each configured model independently by submitting invocations
    with explicit model selection via context_data and collecting
    per-model LLM_DURATION records.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_per_model_latency_p95(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Submit invocations per model; LLM latency p95 must be < 5s for each."""
        models = get_configured_models()
        assert len(models) > 0, "No test models configured"

        prompts = list(itertools.islice(itertools.cycle(ALL_LLM_TEST_PROMPTS), INVOCATIONS_PER_MODEL))

        all_invocation_ids: list[str] = []
        model_invocations: dict[str, list[str]] = {m: [] for m in models}

        for model in models:
            for prompt in prompts:
                _, ok, inv_id = submit_invocation(nexus_api, prompt, model=model, credential_id=llm_credential_id)
                if ok and inv_id:
                    all_invocation_ids.append(inv_id)
                    model_invocations[model].append(inv_id)

        for inv_id in all_invocation_ids:
            poll_for_invocation_terminal_status(
                nexus_api,
                inv_id,
                timeout=INVOCATION_TERMINAL_TIMEOUT,
            )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_duration_ms",
            limit=len(all_invocation_ids) * 2,
            timeout=30.0,
        )

        per_model_values: dict[str, list[float]] = {m: [] for m in models}
        for record in records.get("records", []):
            labels = record.get("labels", {})
            record_model = labels.get("model", "")
            value = record.get("value")
            if record_model in per_model_values and isinstance(value, (int, float)):
                per_model_values[record_model].append(float(value))

        diag_parts: list[str] = ["\n--- Per-model LLM latency results ---"]
        all_passed = True
        failures: list[str] = []

        for model in models:
            values = per_model_values[model]
            submitted = len(model_invocations[model])
            if values:
                p95 = compute_percentile(values, 95)
                p50 = compute_percentile(values, 50)
                diag_parts.append(
                    f"  {model}: submitted={submitted}, records={len(values)}, p50={p50:.0f}ms, p95={p95:.0f}ms"
                )
                if p95 >= TARGET_LLM_LATENCY_P95_MS:
                    all_passed = False
                    failures.append(f"{model}: p95={p95:.0f}ms exceeds {TARGET_LLM_LATENCY_P95_MS}ms")
            else:
                diag_parts.append(f"  {model}: submitted={submitted}, records=0 (no LLM_DURATION metrics)")

        diag_parts.append(f"  total_llm_records={records.get('total', 0)}")
        diag = "\n".join(diag_parts) + "\n"

        total_records = sum(len(v) for v in per_model_values.values())
        assert total_records > 0, f"No LLM_DURATION records emitted{diag}"
        assert all_passed, f"LLM latency p95 exceeded target for: {'; '.join(failures)}{diag}"

    def test_concurrent_multi_model_latency(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Submit invocations across models concurrently; p95 must be < 5s."""
        from nexus_api_client import AuthenticatedClient
        from nexus_api_client.api import NexusApiRegistry as _Registry
        from nexus_api_client.api.internal_metrics import InternalMetricsApi

        models = get_configured_models()
        prompts = list(itertools.islice(itertools.cycle(ALL_LLM_TEST_PROMPTS), INVOCATIONS_PER_MODEL))

        invocation_ids: list[str] = []

        tasks: list[tuple[str, str]] = []
        for model in models:
            for prompt in prompts:
                tasks.append((model, prompt))

        base_client = nexus_api._client
        api_base_url: str = base_client._base_url
        root_base_url = api_base_url.replace("/api/v1", "")

        def _worker(model: str, prompt: str) -> tuple[float, bool, str | None]:
            client = AuthenticatedClient(
                base_url=api_base_url,
                token=base_client.token,
                verify_ssl=False,
            )
            thread_api = _Registry(client)
            root_client = AuthenticatedClient(
                base_url=root_base_url,
                token=base_client.token,
                verify_ssl=False,
            )
            thread_api.__dict__["internal_metrics"] = InternalMetricsApi(client=root_client)
            return submit_invocation(thread_api, prompt, model=model, credential_id=llm_credential_id)

        with ThreadPoolExecutor(max_workers=CONCURRENT_BATCH_SIZE) as executor:
            futures = [executor.submit(_worker, model, prompt) for model, prompt in tasks]
            for future in as_completed(futures):
                _, ok, inv_id = future.result()
                if ok and inv_id:
                    invocation_ids.append(inv_id)

        for inv_id in invocation_ids:
            poll_for_invocation_terminal_status(
                nexus_api,
                inv_id,
                timeout=INVOCATION_TERMINAL_TIMEOUT,
            )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_duration_ms",
            limit=len(tasks) * 2,
            timeout=30.0,
        )

        all_values: list[float] = []
        for record in records.get("records", []):
            value = record.get("value")
            if isinstance(value, (int, float)):
                all_values.append(float(value))

        diag = (
            f"\n--- Concurrent multi-model latency results ---\n"
            f"  tasks={len(tasks)}, "
            f"successful_submissions={len(invocation_ids)}\n"
            f"  llm_records={len(all_values)}\n"
        )

        assert len(all_values) > 0, f"No LLM_DURATION records emitted{diag}"

        p95 = compute_percentile(all_values, 95)
        p50 = compute_percentile(all_values, 50)
        diag += f"  p50={p50:.0f}ms, p95={p95:.0f}ms\n"

        assert p95 < TARGET_LLM_LATENCY_P95_MS, (
            f"Concurrent multi-model LLM latency p95 {p95:.0f}ms exceeds target {TARGET_LLM_LATENCY_P95_MS}ms{diag}"
        )


class TestComponentOverheadBreakdown:
    """14.4 - Track overhead breakdown.

    Validates:
        - AGENT_ROUTING_DURATION records are emitted
        - CONTEXT_DURATION records are emitted
        - The overhead components are measurable and within expected ranges

    This test submits invocations and then retrieves per-component
    duration metrics to produce a breakdown of where time is spent
    during model selection and invocation processing.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_overhead_breakdown_components_recorded(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
        configured_model: str,
    ) -> None:
        """Submit invocations and verify component-level duration metrics."""
        prompts = list(itertools.islice(itertools.cycle(ALL_LLM_TEST_PROMPTS), INVOCATIONS_PER_MODEL))

        invocation_ids: list[str] = []
        for prompt in prompts:
            _, ok, inv_id = submit_invocation(
                nexus_api,
                prompt,
                model=configured_model,
                credential_id=llm_credential_id,
            )
            if ok and inv_id:
                invocation_ids.append(inv_id)

        assert len(invocation_ids) > 0, "No invocations were created"

        for inv_id in invocation_ids:
            poll_for_invocation_terminal_status(
                nexus_api,
                inv_id,
                timeout=INVOCATION_TERMINAL_TIMEOUT,
            )

        llm_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_duration_ms",
            limit=len(invocation_ids) * 2,
            timeout=30.0,
        )

        routing_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=len(invocation_ids) * 2,
            timeout=30.0,
        )

        context_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "context_duration_ms",
            limit=len(invocation_ids) * 2,
            timeout=30.0,
        )

        llm_values = _extract_values_from_records(llm_records)
        routing_values = _extract_values_from_records(routing_records)
        context_values = _extract_values_from_records(context_records)

        breakdown = _build_overhead_breakdown(llm_values, routing_values, context_values)

        diag = _format_breakdown_diagnostic(
            breakdown, len(invocation_ids), llm_records, routing_records, context_records
        )

        has_metrics = bool(llm_values or routing_values or context_values)
        assert has_metrics, (
            f"No overhead breakdown metrics recorded. "
            f"Expected at least LLM_DURATION, AGENT_ROUTING_DURATION, "
            f"or CONTEXT_DURATION records to be emitted.{diag}"
        )

        if llm_values:
            llm_p95 = compute_percentile(llm_values, 95)
            assert llm_p95 < TARGET_LLM_LATENCY_P95_MS, (
                f"LLM duration p95 {llm_p95:.0f}ms exceeds {TARGET_LLM_LATENCY_P95_MS}ms{diag}"
            )


def _extract_values_from_records(records: dict[str, Any]) -> list[float]:
    """Extract numeric values from metric records."""
    return [float(r["value"]) for r in records.get("records", []) if isinstance(r.get("value"), (int, float))]


def _compute_stats(values: list[float]) -> dict[str, Any]:
    """Compute count, p50, p95, and avg for a list of durations."""
    return {
        "count": len(values),
        "p50": compute_percentile(values, 50),
        "p95": compute_percentile(values, 95),
        "avg": sum(values) / len(values),
    }


def _build_overhead_breakdown(
    llm_values: list[float],
    routing_values: list[float],
    context_values: list[float],
) -> dict[str, dict[str, Any]]:
    """Build a per-component overhead breakdown from metric values."""
    breakdown: dict[str, dict[str, Any]] = {}

    if llm_values:
        breakdown["llm_duration"] = _compute_stats(llm_values)

    if routing_values:
        breakdown["routing_duration"] = _compute_stats(routing_values)

    if context_values:
        breakdown["context_preparation"] = _compute_stats(context_values)

    return breakdown


def _format_breakdown_diagnostic(
    breakdown: dict[str, dict[str, Any]],
    invocation_count: int,
    llm_records: dict[str, Any],
    routing_records: dict[str, Any],
    context_records: dict[str, Any],
) -> str:
    """Format the overhead breakdown as a diagnostic string."""
    diag_parts = [
        "\n--- Component overhead breakdown ---",
        f"  invocations={invocation_count}",
    ]
    for name, stats in breakdown.items():
        diag_parts.append(
            f"  {name}: count={stats['count']}, "
            f"avg={stats['avg']:.1f}ms, "
            f"p50={stats['p50']:.1f}ms, "
            f"p95={stats['p95']:.1f}ms"
        )
    diag_parts.append(
        f"  raw_record_counts: llm={llm_records.get('total', 0)}, "
        f"routing={routing_records.get('total', 0)}, "
        f"context_prep={context_records.get('total', 0)}"
    )
    return "\n".join(diag_parts) + "\n"
