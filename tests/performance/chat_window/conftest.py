"""Suite-specific fixtures for Suite 13: Chat Window performance tests.

Shared fixtures (perf_test_mode_enabled, llm_credential_id,
llm_invocation_enabled) and helpers (compute_percentile,
poll_for_component_kpis, poll_for_metric_records, submit_invocation)
live in ``tests/performance/conftest.py`` and are inherited automatically.

Authentication uses credential-based LLM invocations: the
``llm_credential_id`` fixture discovers the stored LLM Provider
credential on the deployment, and ``send_chat_message`` passes it
to ``submit_invocation`` which injects it into
``context_data.metadata.credential_id`` so the invocation executor
resolves the LLM API key at runtime.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)
    - **LLM Provider credential** created and enabled on the deployment,

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

from tests.performance.conftest import submit_invocation

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def create_chat_session_id() -> str:
    """Generate a unique chat session identifier."""
    return f"perf-chat-{uuid4().hex[:12]}"


def send_chat_message(
    nexus_api: NexusApiRegistry,
    session_id: str,
    message: str = "Hello, how can you help me?",
    *,
    credential_id: str | None = None,
) -> tuple[float, bool, str | None]:
    """Send a single chat message (invocation) within a session.

    Simulates a chat window interaction by creating an invocation
    tied to the given session_id.  Delegates to the shared
    ``submit_invocation`` helper which handles credential injection.

    Returns (elapsed_ms, success, invocation_id).
    """
    return submit_invocation(
        nexus_api,
        message,
        session_id=session_id,
        credential_id=credential_id,
    )
