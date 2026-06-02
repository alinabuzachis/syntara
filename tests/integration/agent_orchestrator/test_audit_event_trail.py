"""Integration tests for complete audit event trail.

Verifies that a full invocation lifecycle emits all expected audit events:
- InvocationLifecycleEvent (RUNNING, COMPLETED)
- AgentExecutionEvent (orchestrator, generic_agent)
- ContextIntegrationEvent
- ContextPlanningEvent (retrieval, assembly phases)
- ToolDiscoveryEvent
- ToolInvocationEvent (for tool calls)
- LLMInteractionEvent (for LLM calls)

And validates:
- All events have consistent session_id, invocation_id
- Correct actor_id/username propagation
- Correct resource_urn format
"""

# Ignore code in comments. Some comments _look_ like code, but are not.
# ruff: noqa: ERA001

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from nexus.agent_orchestrator.models import InvocationStatus
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.outbox.worker import get_outbox_worker
from nexus.core.models import User
from tests.helpers.invocations import wait_for_invocation_execution


def _verify_event_counts_by_action(events_by_action: dict[str, list[AuditEventRecord]]) -> None:
    """Verify all expected event types exist with correct counts."""
    # Verify HTTP request_completed event
    assert "request_completed" in events_by_action, "Missing request_completed event"
    assert len(events_by_action["request_completed"]) == 1, "Should have exactly 1 HTTP request event"

    # Verify InvocationLifecycleEvents (RUNNING, COMPLETED)
    assert "invocation_running" in events_by_action, "Missing invocation_running event"
    assert len(events_by_action["invocation_running"]) == 1, "Should have exactly 1 invocation_running event"

    assert "invocation_completed" in events_by_action, "Missing invocation_completed event"
    assert len(events_by_action["invocation_completed"]) == 1, "Should have exactly 1 invocation_completed event"

    # Verify AgentExecutionEvents (orchestrator and generic_agent for simple task)
    assert "agent_started" in events_by_action, "Missing agent_started events"
    assert len(events_by_action["agent_started"]) == 2, (
        "Should have exactly 2 agent_started events (orchestrator + generic_agent)"
    )

    assert "agent_completed" in events_by_action, "Missing agent_completed events"
    assert len(events_by_action["agent_completed"]) == 2, (
        "Should have exactly 2 agent_completed events (orchestrator + generic_agent)"
    )

    # Verify ContextIntegrationEvent (SUCCESS)
    assert "context_integration" in events_by_action, "Missing context_integration event"
    assert len(events_by_action["context_integration"]) == 1, "Should have exactly 1 context_integration event"

    # Verify ContextPlanningEvents (retrieval and assembly phases)
    assert "context_planning" in events_by_action, "Missing context_planning events"
    planning_events = events_by_action["context_planning"]
    # Each phase (retrieval, assembly) emits STARTED and COMPLETED events, so we expect 4 total
    assert len(planning_events) == 4, "Should have exactly 4 context_planning events (2 per phase: STARTED, COMPLETED)"
    planning_phases = {e.structured_data.phase for e in planning_events}  # type: ignore[attr-defined]
    assert planning_phases == {"retrieval", "assembly"}, "Should have both retrieval and assembly phases"

    # Verify ToolDiscoveryEvent (STARTED, COMPLETED)
    assert "tool_discovery" in events_by_action, "Missing tool_discovery events"
    assert len(events_by_action["tool_discovery"]) == 2, (
        "Should have exactly 2 tool_discovery events (STARTED, COMPLETED)"
    )

    # Verify LLMInteractionEvent (at least one SUCCESS)
    assert "llm_call" in events_by_action, "Missing llm_call events"
    assert len(events_by_action["llm_call"]) == 1, "Should have 1 llm_call event"


def _verify_consistent_identifiers(events: list[AuditEventRecord], request_id: str, invocation_id: str) -> None:
    """Verify all events have consistent request_id, session_id, and invocation_id."""
    # Filter out events that don't have session_id in structured_data
    events_with_context = [e for e in events if e.event_action not in ("orchestrate", "request_completed")]

    for event in events_with_context:
        # request_id should match
        assert event.structured_data.request_id == request_id, f"Event {event.id} has incorrect request_id"  # type: ignore[attr-defined]
        # session_id should be redacted in structured_data
        assert event.structured_data.session_id == "[REDACTED]", f"Event {event.id} has incorrect session_id"  # type: ignore[attr-defined]
        # invocation_id should match
        assert event.structured_data.invocation_id == invocation_id, f"Event {event.id} has incorrect invocation_id"  # type: ignore[attr-defined]
        # resource_urn should follow correct format for invocation events
        assert event.resource_urn == f"urn:nexus:invocation:{invocation_id}", (
            f"Event {event.id} has incorrect resource_urn"
        )


def _verify_actor_fields(events: list[AuditEventRecord], test_user: User) -> None:
    """Verify all events have actor_id/actor_username."""
    for event in events:
        assert event.actor_id is not None, f"Event {event.id} missing actor_id"
        assert event.actor_username is not None, f"Event {event.id} missing actor_username"
        # Most events should have the test user as actor
        # (some system events might have system actor, but at least some should have test_user)
        if event.actor_id == test_user.id:
            assert event.actor_username == test_user.username


@pytest.mark.asyncio
async def test_successful_invocation_emits_complete_audit_trail(
    test_db_session: AsyncSession,
    auth_client_with_tool_aware_mocked_llm: AsyncClient,
    test_user: User,
) -> None:
    """Successful invocation emits all expected audit events with consistent identifiers."""
    from uuid import uuid4

    # Generate unique request_id for this test to isolate audit events
    request_id = uuid4()

    # Create invocation via API with X-Request-Id header
    response = await auth_client_with_tool_aware_mocked_llm.post(
        "/api/v1/invocations",
        json={
            "prompt": "Please help me with a simple task that doesn't require tools",
            "session_id": "test-audit-trail-session-1",
        },
        headers={"X-Request-Id": str(request_id)},
    )

    assert response.status_code == 202
    invocation_data = response.json()
    invocation_id = invocation_data["id"]

    # Wait for invocation to complete
    async with wait_for_invocation_execution(auth_client_with_tool_aware_mocked_llm, invocation_id) as invocation:
        assert invocation is not None
        assert invocation["status"] == InvocationStatus.COMPLETED

    # Flush all pending AuditEventRecord writes
    await get_outbox_worker().drain()

    # Query audit_events table by request_id for precise matching
    # All events emitted during this request will have the same request_id
    stmt = select(AuditEventRecord).where(
        AuditEventRecord.structured_data["request_id"].astext == str(request_id)  # type: ignore[index]
    )
    result = await test_db_session.execute(stmt)
    audit_events = list(result.scalars().all())

    # Verify exact event count: 16 total events for simple prompt without tools
    # Breakdown: request_completed (1), invocation lifecycle (2), agents (4),
    # context planning (4), context integration (1), tool discovery (2),
    # llm_call (1), orchestrate (1)
    assert len(audit_events) == 16, (
        f"Should have exactly 16 audit events for request_id {request_id}, got {len(audit_events)}"
    )

    # Categorize events by action for detailed verification
    events_by_action: dict[str, list[AuditEventRecord]] = {}
    for event in audit_events:
        action = event.event_action
        if action not in events_by_action:
            events_by_action[action] = []
        events_by_action[action].append(event)

    # Verify expected event types and counts
    _verify_event_counts_by_action(events_by_action)

    # Verify all events have consistent request_id, session_id, and invocation_id
    _verify_consistent_identifiers(audit_events, str(request_id), str(invocation_id))

    # Verify all events have actor_id/actor_username
    _verify_actor_fields(audit_events, test_user)

    # Verify event categories - all should be valid EventCategory values
    for event in audit_events:
        # Just verify it's a valid EventCategory value (will raise if invalid)
        assert event.event_category is not None, f"Event {event.id} has no category"


@pytest.mark.asyncio
async def test_invocation_with_tool_call_emits_tool_invocation_events(
    test_db_session: AsyncSession,
    auth_client_with_tool_aware_mocked_llm: AsyncClient,
) -> None:
    """Invocation that uses tools emits ToolInvocationEvent for each tool call."""
    from uuid import uuid4

    # Generate unique request_id for this test
    request_id = uuid4()

    # Create invocation that will trigger tool usage (mock_tool_aware_llm recognizes "calculate")
    response = await auth_client_with_tool_aware_mocked_llm.post(
        "/api/v1/invocations",
        json={
            "prompt": "Please calculate 5 + 3 for me",
            "session_id": "test-audit-trail-session-2",
        },
        headers={"X-Request-Id": str(request_id)},
    )

    assert response.status_code == 202
    invocation_data = response.json()
    invocation_id = invocation_data["id"]

    # Wait for invocation to complete
    async with wait_for_invocation_execution(auth_client_with_tool_aware_mocked_llm, invocation_id) as invocation:
        assert invocation is not None
        assert invocation["status"] == InvocationStatus.COMPLETED

    # Flush all pending AuditEventRecord writes
    await get_outbox_worker().drain()

    # Query all audit_events for this request by request_id
    stmt = select(AuditEventRecord).where(
        AuditEventRecord.structured_data["request_id"].astext == str(request_id)  # type: ignore[index]
    )
    result = await test_db_session.execute(stmt)
    all_events = list(result.scalars().all())

    # Verify exact event count: 21 total events for tool-calling invocation
    # Breakdown: invocation lifecycle (2), agents (6 total, 3 started + 3 completed),
    # context planning (4), context integration (1), tool discovery (2),
    # tool invocation (2), llm_call (2), orchestrate (1), request_completed (1)
    assert len(all_events) == 21, f"Should have exactly 21 audit events, got {len(all_events)}"

    # Filter for tool invocation events
    tool_invocation_events = [e for e in all_events if e.event_action == "tool_invocation"]

    # Verify we have exactly 2 tool invocation events (STARTED, COMPLETED)
    assert len(tool_invocation_events) == 2, (
        f"Should have exactly 2 tool invocation events (STARTED, COMPLETED), got {len(tool_invocation_events)}"
    )

    # Verify event details
    tool_names = set()
    statuses = set()
    for event in tool_invocation_events:
        # Verify request_id
        assert event.structured_data.request_id == str(request_id), "Tool event should have correct request_id"  # type: ignore[attr-defined]

        # Verify tool_name
        tool_name = event.structured_data.tool_name  # type: ignore[attr-defined]
        assert tool_name is not None, "Tool invocation event should have tool_name"
        tool_names.add(tool_name)

        # Verify status
        status = event.structured_data.status  # type: ignore[attr-defined]
        assert status in ["started", "completed", "failed"], f"Invalid tool invocation status: {status}"
        statuses.add(status)

        # Verify session_id and invocation_id
        assert event.structured_data.session_id == "[REDACTED]"  # type: ignore[attr-defined]
        assert event.structured_data.invocation_id == str(invocation_id)  # type: ignore[attr-defined]
        assert event.resource_urn == f"urn:nexus:invocation:{invocation_id}"

    # Verify we have both started and completed statuses
    assert statuses == {"started", "completed"}, "Should have both started and completed statuses"

    # Verify exactly one tool was called
    assert len(tool_names) == 1, "Should have exactly one tool invocation"


@pytest.mark.asyncio
async def test_failed_invocation_emits_error_events(
    test_db_session: AsyncSession,
    auth_client_with_tool_aware_mocked_llm: AsyncClient,
    mock_tool_aware_llm,
) -> None:
    """Failed invocation emits appropriate error events with error_type."""
    from unittest.mock import AsyncMock, patch
    from uuid import uuid4

    # Generate unique request_id for this test
    request_id = uuid4()

    # Patch the LLM to raise an exception
    mock_llm_with_tools = AsyncMock()
    mock_llm_with_tools.ainvoke = AsyncMock(side_effect=RuntimeError("LLM invocation failed"))

    with patch.object(mock_tool_aware_llm, "bind_tools", return_value=mock_llm_with_tools):
        # Create invocation that will fail
        response = await auth_client_with_tool_aware_mocked_llm.post(
            "/api/v1/invocations",
            json={
                "prompt": "This invocation will fail",
                "session_id": "test-audit-trail-session-3",
            },
            headers={"X-Request-Id": str(request_id)},
        )

        assert response.status_code == 202
        invocation_data = response.json()
        invocation_id = invocation_data["id"]

        # Wait for invocation to complete (it should fail)
        async with wait_for_invocation_execution(auth_client_with_tool_aware_mocked_llm, invocation_id) as invocation:
            assert invocation is not None
            # Invocation should have failed
            assert invocation["status"] == InvocationStatus.FAILED

    # Flush all pending AuditEventRecord writes
    await get_outbox_worker().drain()

    # Query audit events by request_id
    stmt = select(AuditEventRecord).where(
        AuditEventRecord.structured_data["request_id"].astext == str(request_id)  # type: ignore[index]
    )
    result = await test_db_session.execute(stmt)
    audit_events = list(result.scalars().all())

    # Verify exact event count: 15 total events for failed invocation
    # Breakdown: invocation lifecycle (2 but failed), agents (4 total, 2 started + 1 completed + 1 failed),
    # context planning (4), context integration (1), tool discovery (2),
    # orchestrate_error (1), request_completed (1)
    assert len(audit_events) == 15, (
        f"Should have exactly 15 audit events for failed invocation, got {len(audit_events)}"
    )

    # Categorize events by action
    events_by_action: dict[str, list[AuditEventRecord]] = {}
    for event in audit_events:
        action = event.event_action
        if action not in events_by_action:
            events_by_action[action] = []
        events_by_action[action].append(event)

    # Verify we have a failed invocation event
    assert "invocation_failed" in events_by_action, "Missing invocation_failed event"
    assert len(events_by_action["invocation_failed"]) == 1, "Should have exactly 1 invocation_failed event"

    # Verify error events have proper structure
    # Filter out events that don't have invocation_id in structured_data
    # (orchestrate/orchestrate_error from @audit decorator, request_completed from HTTP middleware)
    # Expected: agent_failed and invocation_failed events (2 total)
    error_events = [
        e
        for e in audit_events
        if e.structured_data.error_type is not None
        and e.event_action not in ("orchestrate", "orchestrate_error", "request_completed")
    ]
    assert len(error_events) == 2, f"Should have exactly 2 error events, got {len(error_events)}"

    for event in error_events:
        # Verify request_id
        assert event.structured_data.request_id == str(request_id), "Error event should have correct request_id"  # type: ignore[attr-defined]

        # Error events should have error_type and error_message
        assert event.structured_data.error_type is not None, f"Event {event.id} should have error_type"
        assert event.structured_data.error_message is not None, f"Event {event.id} has error_type but no error_message"
        # Error message should follow standard format
        expected_msg = "Look at the Operational Logs for full diagnosis"
        assert event.structured_data.error_message == expected_msg, f"Event {event.id} has non-standard error_message"

        # Verify invocation_id
        assert event.structured_data.invocation_id == str(invocation_id), (  # type: ignore[attr-defined]
            f"Event {event.id} has incorrect invocation_id"
        )


@pytest.mark.asyncio
async def test_audit_event_timestamps_are_sequential(
    test_db_session: AsyncSession,
    auth_client_with_tool_aware_mocked_llm: AsyncClient,
) -> None:
    """Audit events are created in chronological order matching the execution flow."""
    from uuid import uuid4

    # Generate unique request_id for this test
    request_id = uuid4()

    # Create invocation
    response = await auth_client_with_tool_aware_mocked_llm.post(
        "/api/v1/invocations",
        json={
            "prompt": "Test task",
            "session_id": "test-audit-trail-session-4",
        },
        headers={"X-Request-Id": str(request_id)},
    )

    assert response.status_code == 202
    invocation_data = response.json()
    invocation_id = invocation_data["id"]

    # Wait for completion
    async with wait_for_invocation_execution(auth_client_with_tool_aware_mocked_llm, invocation_id) as invocation:
        assert invocation is not None

    # Flush all pending AuditEventRecord writes
    await get_outbox_worker().drain()

    # Query audit events by request_id ordered by created_at
    stmt = (
        select(AuditEventRecord)
        .where(AuditEventRecord.structured_data["request_id"].astext == str(request_id))  # type: ignore[index]
        .order_by(AuditEventRecord.created_at)  # type: ignore[arg-type]
    )
    result = await test_db_session.execute(stmt)
    audit_events = list(result.scalars().all())

    # Verify exact event count: 16 total events (same as first test - simple prompt without tools)
    # Breakdown: invocation lifecycle (2), agents (4), context planning (4),
    # context integration (1), tool discovery (2), llm_call (1), orchestrate (1), request_completed (1)
    assert len(audit_events) == 16, f"Should have exactly 16 audit events, got {len(audit_events)}"

    # Verify all events have request_id and invocation_id
    # (except orchestrate and request_completed which don't have invocation_id in structured_data)
    for event in audit_events:
        assert event.structured_data.request_id == str(request_id), f"Event {event.id} has incorrect request_id"  # type: ignore[attr-defined]
        if event.event_action not in ("orchestrate", "request_completed"):
            assert event.structured_data.invocation_id == str(invocation_id), (  # type: ignore[attr-defined]
                f"Event {event.id} has incorrect invocation_id"
            )

    # Verify expected event sequence:
    # Note: HTTP middleware emits request_completed AFTER background invocation completes,
    # so the sequence is: invocation events → request_completed (not the other way around)
    # 1. invocation_running should be first (background execution starts immediately)
    # 2. invocation_completed should be near the end (before request_completed)
    # 3. request_completed (HTTP) should be last
    event_actions = [e.event_action for e in audit_events]

    assert event_actions[0] == "invocation_running", "First event should be invocation_running"

    assert "invocation_completed" in event_actions, "Missing invocation_completed event"
    completed_index = event_actions.index("invocation_completed")
    # Should be second-to-last (before request_completed)
    assert completed_index == len(audit_events) - 2, "invocation_completed should be second-to-last event"

    assert event_actions[-1] == "request_completed", "Last event should be HTTP request_completed"

    # Verify timestamps are monotonically increasing (or equal for events created in same millisecond)
    for i in range(1, len(audit_events)):
        assert audit_events[i].created_at >= audit_events[i - 1].created_at, (
            f"Event {i} (action={audit_events[i].event_action}) timestamp is before "
            f"event {i - 1} (action={audit_events[i - 1].event_action})"
        )
