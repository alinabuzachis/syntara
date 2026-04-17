"""End-to-end audit event lifecycle tests: @track_event -> DB -> AuditEventService."""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any, Literal

import pytest
import pytest_asyncio

import nexus.audit.services.writer as writer_module
from nexus.audit import track_event
from nexus.audit.models import (
    EventCategory,
    FunctionData,
)
from nexus.audit.services.audit_event_service import AuditEventService
from nexus.audit.services.writer import AuditEventWriter

if TYPE_CHECKING:
    from collections.abc import AsyncGenerator, Callable

    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.core.models import User

RunMode = Literal["success", "error"]

# ------------------------------------------------------------------ #
# Decorated functions — decorator config is static, so one per scenario.
# ------------------------------------------------------------------ #


@track_event(EventCategory.USER_ACTION, event_action="no_capture_action")
def _tracked_no_capture(value: int) -> int:
    return value * 2


@track_event(
    EventCategory.USER_ACTION,
    event_action="capture_args_action",
    capture_args=True,
)
def _tracked_capture_args(alpha: str, beta: int) -> int:
    return len(alpha) + beta


@track_event(
    EventCategory.API_EXECUTION,
    event_action="capture_all_action",
    capture_args=True,
    capture_result=True,
)
def _tracked_capture_all(name: str, count: int) -> dict[str, Any]:
    return {"name": name, "count": count, "summary": f"{name}x{count}"}


@track_event(
    EventCategory.SYSTEM_OPERATION,
    event_action="failing_action",
    capture_args=True,
)
def _tracked_raises(reason: str) -> None:
    msg = f"failure: {reason}"
    raise ValueError(msg)


# ------------------------------------------------------------------ #
# Fixtures
# ------------------------------------------------------------------ #


@pytest_asyncio.fixture
async def audit_writer(test_db_session: AsyncSession) -> AsyncGenerator[AuditEventWriter, None]:
    """Install a real AuditEventWriter that writes through ``test_db_session``.

    The writer normally owns its session lifecycle (``async with factory() as
    session``), but here we hand it a factory that yields the test's shared
    session without closing it, so the service's subsequent reads see the
    writer's committed rows on the same session.
    """

    @asynccontextmanager
    async def shared_session() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    previous = writer_module._writer
    writer = AuditEventWriter(shared_session)  # type: ignore[arg-type]
    writer_module._writer = writer
    try:
        yield writer
    finally:
        try:
            await writer.drain()
        except Exception:
            pass
        writer_module._writer = previous


# ------------------------------------------------------------------ #
# Test
# ------------------------------------------------------------------ #


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("call", "mode", "expected"),
    [
        pytest.param(
            lambda: _tracked_no_capture(7),
            "success",
            {
                "event_action": "no_capture_action",
                "event_category": "user_action",
                "event_status": "success",
                "event_severity": "info",
                "function_args": {},
                "function_result": None,
                "error_type": None,
                "error_message": None,
            },
            id="no_capture",
        ),
        pytest.param(
            lambda: _tracked_capture_args(alpha="hello", beta=3),
            "success",
            {
                "event_action": "capture_args_action",
                "event_category": "user_action",
                "event_status": "success",
                "event_severity": "info",
                "function_args": {"alpha": "hello", "beta": 3},
                "function_result": None,
                "error_type": None,
                "error_message": None,
            },
            id="capture_args",
        ),
        pytest.param(
            lambda: _tracked_capture_all("widget", 4),
            "success",
            {
                "event_action": "capture_all_action",
                "event_category": "api_execution",
                "event_status": "success",
                "event_severity": "info",
                "function_args": {"name": "widget", "count": 4},
                "function_result": {"name": "widget", "count": 4, "summary": "widgetx4"},
                "error_type": None,
                "error_message": None,
            },
            id="capture_args_and_result",
        ),
        pytest.param(
            lambda: _tracked_raises("boom"),
            "error",
            {
                "event_action": "failing_action_error",
                "event_category": "system_operation",
                "event_status": "error",
                "event_severity": "error",  # escalated from info on exception
                "function_args": {"reason": "boom"},
                "function_result": None,
                "error_type": "ValueError",
                "error_message": "Look at the Operational Logs for full diagnosis",
            },
            id="error_path",
        ),
    ],
)
async def test_track_event_end_to_end(
    call: Callable[[], Any],
    mode: RunMode,
    expected: dict[str, Any],
    audit_writer: AuditEventWriter,
    test_db_session: AsyncSession,
    test_user: User,
) -> None:
    """@track_event -> writer -> DB -> AuditEventService, with typed structured_data."""
    if mode == "error":
        with pytest.raises(ValueError):
            call()
    else:
        call()

    await audit_writer.drain()

    service = AuditEventService(test_db_session, test_user)
    response = await service.list_audit_events()

    assert len(response.resources) == 1
    read = response.resources[0]

    # Scalar envelope fields survive the round-trip.
    assert read.event_action == expected["event_action"]
    assert read.event_category == expected["event_category"]
    assert read.event_status == expected["event_status"]
    assert read.event_severity == expected["event_severity"]
    assert read.source_component == __name__

    # structured_data is discriminated back to FunctionData with the expected content.
    assert isinstance(read.structured_data, FunctionData)
    sd = read.structured_data
    assert sd.function_args == expected["function_args"]
    assert sd.function_result == expected["function_result"]
    assert sd.error_type == expected["error_type"]
    assert sd.error_message == expected["error_message"]
