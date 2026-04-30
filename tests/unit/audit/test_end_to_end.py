"""End-to-end audit event lifecycle tests: @audit -> DB -> AuditEventService."""

# mypy: disable-error-code="attr-defined"

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any, Literal

import pytest
import pytest_asyncio

import nexus.audit.services.writer as writer_module
from nexus.audit.context_managers import actor_context
from nexus.audit.decorators import audit
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
from nexus.audit.models.audit_event import EventCategory
from nexus.audit.models.audit_event_record import AuditEventRecord
from nexus.audit.models.schemas import AuditEventListResponse
from nexus.audit.models.structured_data import AuditContextData
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


@audit(EventCategory.USER_ACTION, event_action="no_capture_action")
def _tracked_no_capture(value: int) -> int:
    return value * 2


@audit(
    EventCategory.USER_ACTION,
    event_action="capture_args_action",
    capture_args=True,
)
def _tracked_capture_args(alpha: str, beta: int) -> int:
    return len(alpha) + beta


@audit(
    EventCategory.API_EXECUTION,
    event_action="capture_all_action",
    capture_args=True,
    capture_result=True,
)
def _tracked_capture_all(name: str, count: int) -> dict[str, Any]:
    return {"name": name, "count": count, "summary": f"{name}x{count}"}


@audit(
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


class TestAuditEndToEnd:
    """End-to-end audit event lifecycle tests."""

    def setup_method(self) -> None:
        AuditEventDispatcher.reset()
        AuditEventDispatcher.register({FunctionExecutionEvent: FunctionExecutionHandler()})

    def teardown_method(self) -> None:
        AuditEventDispatcher.reset()

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
    async def test_audit_end_to_end(
        self,
        call: Callable[[], Any],
        mode: RunMode,
        expected: dict[str, Any],
        audit_writer: AuditEventWriter,
        test_db_session: AsyncSession,
        test_user: User,
    ) -> None:
        """@audit -> writer -> DB -> AuditEventService, with typed structured_data."""
        with actor_context(actor=test_user):
            if mode == "error":
                with pytest.raises(ValueError):
                    call()
            else:
                call()

        await audit_writer.drain()

        service = AuditEventService(test_db_session, test_user)
        response = await service.list_resources(
            model=AuditEventRecord,
            response_type=AuditEventListResponse,
            limit=200,
        )

        # Filter to the event we just created (there may be pre-existing events)
        matching = [r for r in response.resources if r.event_action == expected["event_action"]]
        assert len(matching) == 1
        read = matching[0]

        # Scalar envelope fields survive the round-trip.
        assert read.event_action == expected["event_action"]
        assert read.event_category == expected["event_category"]
        assert read.event_status == expected["event_status"]
        assert read.event_severity == expected["event_severity"]
        assert read.source_component == __name__

        # Actor fields are extracted from context and survive the round-trip.
        assert read.actor_id == test_user.id
        assert read.actor_type == "user"
        assert read.actor_username == test_user.username

        # structured_data is discriminated back to AuditContextData with the expected content.
        assert isinstance(read.structured_data, AuditContextData)
        sd = read.structured_data
        assert getattr(sd, "function_args", None) == expected["function_args"]
        assert getattr(sd, "function_result", None) == expected["function_result"]
        assert sd.error_type == expected["error_type"]
        assert sd.error_message == expected["error_message"]
