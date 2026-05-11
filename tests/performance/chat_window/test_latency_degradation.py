"""Suite 13 — Chat Window: Latency Degradation KPI (13.5).

Test 13.5: Long conversation chains (20+ turns)
    KPI: Latency Degradation — no significant increase
    MetricType: REQUEST_DURATION

    Validation source:
        - Compare early-turn vs late-turn latencies (client-measured)
        - A conversation session sends 20+ sequential messages and asserts
          that late-turn response times do not significantly degrade
          compared to early turns.

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from tests.performance.chat_window.conftest import create_chat_session_id, send_chat_message
from tests.performance.conftest import compute_percentile

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TOTAL_TURNS = 25
EARLY_TURN_COUNT = 5
LATE_TURN_START = 20
MAX_DEGRADATION_RATIO = 1.5


CONVERSATION_PROMPTS = [
    "Hello, what can you help me with?",
    "Tell me about workflows in this system.",
    "How do I create a new workflow?",
    "What triggers are available?",
    "Can you explain manual triggers?",
    "How do I add a script task?",
    "What languages are supported for scripts?",
    "How do I connect nodes together?",
    "What are edges in a workflow?",
    "Can I have conditional branches?",
    "How do I handle errors in a workflow?",
    "What happens when a task fails?",
    "Can I retry failed tasks?",
    "How do I set up notifications?",
    "What integrations are available?",
    "Tell me about the tool manager.",
    "How do I register a new tool provider?",
    "What APIs can tools access?",
    "How do I test a workflow before deploying?",
    "Can I schedule workflows to run periodically?",
    "How do I monitor running workflows?",
    "What metrics are available for workflows?",
    "How do I debug a stuck execution?",
    "Can I cancel a running workflow?",
    "Summarize everything we discussed.",
]


class TestLatencyDegradation:
    """13.5 — Long conversation chains (20+ turns); no significant latency increase.

    Validates:
        - Late-turn p50 does not exceed early-turn p50 by more than 1.5x
        - Conversation context accumulation does not cause response time blowup
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_late_turns_no_significant_degradation(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """20+ turn conversation; late-turn latency must not significantly exceed early turns."""
        session_id = create_chat_session_id()
        turn_times: list[float] = []

        for i in range(TOTAL_TURNS):
            prompt = CONVERSATION_PROMPTS[i % len(CONVERSATION_PROMPTS)]
            elapsed_ms, _, _ = send_chat_message(nexus_api, session_id, prompt, credential_id=llm_credential_id)
            turn_times.append(elapsed_ms)

        assert len(turn_times) == TOTAL_TURNS, f"Only {len(turn_times)}/{TOTAL_TURNS} turns completed"

        early_times = turn_times[:EARLY_TURN_COUNT]
        late_times = turn_times[LATE_TURN_START:]

        early_p50 = compute_percentile(early_times, 50)
        late_p50 = compute_percentile(late_times, 50)

        if early_p50 <= 0:
            pytest.skip("Early-turn p50 is zero — cannot compute degradation ratio")

        degradation_ratio = late_p50 / early_p50

        assert degradation_ratio <= MAX_DEGRADATION_RATIO, (
            f"Latency degradation ratio {degradation_ratio:.2f}x exceeds "
            f"max allowed {MAX_DEGRADATION_RATIO}x\n"
            f"  Early turns (1-{EARLY_TURN_COUNT}) p50: {early_p50:.1f}ms\n"
            f"  Late turns ({LATE_TURN_START + 1}-{TOTAL_TURNS}) p50: {late_p50:.1f}ms\n"
            f"  All turn times: {[f'{t:.0f}' for t in turn_times]}"
        )

    def test_multiple_long_sessions_no_degradation(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Multiple long sessions must all maintain stable latency across turns."""
        num_sessions = 3
        degradation_ratios: list[float] = []

        for _ in range(num_sessions):
            session_id = create_chat_session_id()
            turn_times: list[float] = []

            for i in range(TOTAL_TURNS):
                prompt = CONVERSATION_PROMPTS[i % len(CONVERSATION_PROMPTS)]
                elapsed_ms, _, _ = send_chat_message(nexus_api, session_id, prompt, credential_id=llm_credential_id)
                turn_times.append(elapsed_ms)

            early_p50 = compute_percentile(turn_times[:EARLY_TURN_COUNT], 50)
            late_p50 = compute_percentile(turn_times[LATE_TURN_START:], 50)

            if early_p50 > 0:
                degradation_ratios.append(late_p50 / early_p50)

        assert len(degradation_ratios) > 0, "No sessions produced valid degradation ratios"

        worst_ratio = max(degradation_ratios)
        avg_ratio = sum(degradation_ratios) / len(degradation_ratios)

        assert worst_ratio <= MAX_DEGRADATION_RATIO, (
            f"Worst session degradation ratio {worst_ratio:.2f}x exceeds "
            f"max allowed {MAX_DEGRADATION_RATIO}x\n"
            f"  Average ratio: {avg_ratio:.2f}x\n"
            f"  All ratios: {[f'{r:.2f}' for r in degradation_ratios]}\n"
            f"  Sessions tested: {num_sessions}"
        )
