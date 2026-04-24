"""Integration tests for GET /api/v1/audit endpoint."""

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from tests.helpers.audit import AuditEventsFactory
from tests.helpers.error_data import assert_error_data
from tests.integration.api.conftest import make_auditor

AUDIT_URL = "/api/v1/audit"


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture(autouse=True)
def disable_audit_emission(monkeypatch: pytest.MonkeyPatch) -> None:
    """Silence audit event emission for every test in this module.

    The ``AuditMiddleware`` emits a ``request_completed`` event for every API
    call (including the GET /api/v1/audit call under test), which would
    pollute assertions on the list response.  Patching ``_do_emit_audit_event``
    short-circuits all emission paths (middleware, decorators, context
    managers) without touching the middleware stack itself.  Factory-inserted
    events reach the DB via the session directly, so query results contain
    only the rows explicitly created by each test.

    All public emission paths (emit_audit_event) eventually call
    _do_emit_audit_event, so patching it is sufficient to prevent all
    database writes and log emissions from the audit system.
    """
    monkeypatch.setattr("nexus.audit.emitter._do_emit_audit_event", lambda _event: None)


# ============================================================================
# Basic listing
# ============================================================================


@pytest.mark.asyncio
async def test_list_audit_events_success(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test successful listing of audit events."""
    await audit_events_factory.create_events(count=3)

    response = await auth_client_as_admin.get(AUDIT_URL)

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["resources"], list)
    assert len(data["resources"]) == 3
    assert data["total"] is None


@pytest.mark.asyncio
async def test_list_audit_events_empty(auth_client_as_admin: AsyncClient) -> None:
    """Test listing returns an empty result set when no events exist."""
    response = await auth_client_as_admin.get(f"{AUDIT_URL}?include_total=true")

    assert response.status_code == 200
    data = response.json()
    assert data["resources"] == []
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_list_audit_events_response_schema(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
    test_user: User,
) -> None:
    """Test response contains expected pagination and resource fields."""
    await audit_events_factory.create_event(
        event_category="security_event",
        event_severity="warning",
        event_action="login_failed",
        actor_id=test_user.id,
        actor_type="user",
        actor_username=test_user.username,
        source_component="auth_service",
        event_message="Invalid credentials",
    )

    response = await auth_client_as_admin.get(AUDIT_URL)

    assert response.status_code == 200
    data = response.json()

    assert data["next"] is None
    assert data["prev"] is None

    event = data["resources"][0]
    for field in (
        "id",
        "created_at",
        "event_category",
        "event_severity",
        "event_action",
        "actor_id",
        "actor_type",
        "actor_username",
        "source_component",
        "event_message",
    ):
        assert field in event
    assert event["event_category"] == "security_event"
    assert event["event_severity"] == "warning"
    assert event["event_action"] == "login_failed"
    assert event["actor_id"] == str(test_user.id)
    assert event["actor_type"] == "user"
    assert event["actor_username"] == test_user.username
    assert event["source_component"] == "auth_service"
    assert event["event_message"] == "Invalid credentials"


@pytest.mark.asyncio
async def test_list_audit_events_with_include_total(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test listing audit events with total count."""
    await audit_events_factory.create_events(count=5)

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?include_total=true")

    assert response.status_code == 200
    assert response.json()["total"] == 5


@pytest.mark.asyncio
async def test_list_audit_events_without_include_total(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test total is null when include_total is not set."""
    await audit_events_factory.create_events(count=2)

    response = await auth_client_as_admin.get(AUDIT_URL)

    assert response.status_code == 200
    assert response.json()["total"] is None


# ============================================================================
# Filtering
# ============================================================================


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_event_category(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by event_category returns only matching events."""
    await audit_events_factory.create_event(event_category="user_action")
    await audit_events_factory.create_event(event_category="system_operation")
    await audit_events_factory.create_event(event_category="user_action")

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?event_category=user_action")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    assert all(r["event_category"] == "user_action" for r in data["resources"])


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_event_severity(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by event_severity returns only matching events."""
    await audit_events_factory.create_event(event_severity="info")
    await audit_events_factory.create_event(event_severity="warning")
    await audit_events_factory.create_event(event_severity="error")

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?event_severity=error")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 1
    assert data["resources"][0]["event_severity"] == "error"


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_event_status(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by event_status returns only matching events."""
    await audit_events_factory.create_event(event_status="success")
    await audit_events_factory.create_event(event_status="error")
    await audit_events_factory.create_event(event_status="success")

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?event_status=success")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    assert all(r["event_status"] == "success" for r in data["resources"])


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_actor_id(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by actor_id returns only events for that actor."""
    target_actor = uuid4()
    other_actor = uuid4()
    await audit_events_factory.create_event(actor_id=target_actor, actor_type="user")
    await audit_events_factory.create_event(actor_id=other_actor, actor_type="user")
    await audit_events_factory.create_event(actor_id=target_actor, actor_type="user")

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?actor_id={target_actor}")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    assert all(r["actor_id"] == str(target_actor) for r in data["resources"])


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_actor_type(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by actor_type returns only matching actor types."""
    await audit_events_factory.create_event(actor_type="user")
    await audit_events_factory.create_event(actor_type="system")
    await audit_events_factory.create_event(actor_type="service")

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?actor_type=service")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 1
    assert data["resources"][0]["actor_type"] == "service"


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_workflow_id(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by workflow_id returns only events for that workflow."""
    target_workflow = uuid4()
    other_workflow = uuid4()
    await audit_events_factory.create_event(workflow_id=target_workflow)
    await audit_events_factory.create_event(workflow_id=other_workflow)

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?workflow_id={target_workflow}")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 1
    assert data["resources"][0]["workflow_id"] == str(target_workflow)


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_activity_id(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by activity_id returns only events for that activity."""
    await audit_events_factory.create_event(activity_id="activity_one")
    await audit_events_factory.create_event(activity_id="activity_two")
    await audit_events_factory.create_event(activity_id="activity_one")

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?activity_id=activity_one")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    assert all(r["activity_id"] == "activity_one" for r in data["resources"])


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_execution_id(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by execution_id returns only events for that execution."""
    target_execution = uuid4()
    other_execution = uuid4()
    await audit_events_factory.create_event(execution_id=target_execution)
    await audit_events_factory.create_event(execution_id=other_execution)
    await audit_events_factory.create_event(execution_id=target_execution)

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?execution_id={target_execution}")

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
    assert all(r["execution_id"] == str(target_execution) for r in data["resources"])


@pytest.mark.asyncio
async def test_list_audit_events_filter_by_created_at_range(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test filtering by inclusive ``created_at`` range via bracket operators."""
    base = datetime(2025, 6, 1, tzinfo=UTC)
    for i in range(5):
        await audit_events_factory.create_event(
            event_action=f"action_{i}",
            created_at=base + timedelta(days=i),
        )

    window_from = base + timedelta(days=1)
    window_to = base + timedelta(days=3)
    response = await auth_client_as_admin.get(
        AUDIT_URL,
        params={"created_at[gte]": window_from.isoformat(), "created_at[lte]": window_to.isoformat()},
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert len(data["resources"]) == 3
    returned = sorted(datetime.fromisoformat(r["created_at"]) for r in data["resources"])
    assert window_from <= returned[0]
    assert returned[-1] <= window_to


# ============================================================================
# Sorting
# ============================================================================


@pytest.mark.asyncio
async def test_list_audit_events_default_sort_is_created_at_desc(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test that results default to sort by created_at descending."""
    base = datetime(2025, 1, 1, tzinfo=UTC)
    for i in range(3):
        await audit_events_factory.create_event(
            event_action=f"action_{i}",
            created_at=base + timedelta(hours=i),
        )

    response = await auth_client_as_admin.get(AUDIT_URL)

    assert response.status_code == 200
    timestamps = [r["created_at"] for r in response.json()["resources"]]
    assert timestamps == sorted(timestamps, reverse=True)


@pytest.mark.asyncio
async def test_list_audit_events_sort_by_created_at_ascending(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test explicit ascending sort by created_at."""
    base = datetime(2025, 1, 1, tzinfo=UTC)
    for i in range(3):
        await audit_events_factory.create_event(
            event_action=f"action_{i}",
            created_at=base + timedelta(hours=i),
        )

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?sort=created_at")

    assert response.status_code == 200
    timestamps = [r["created_at"] for r in response.json()["resources"]]
    assert timestamps == sorted(timestamps)


@pytest.mark.asyncio
async def test_list_audit_events_sort_by_event_category(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test sort by event_category ascending."""
    for category in ("system_operation", "user_action", "security_event"):
        await audit_events_factory.create_event(event_category=category)

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?sort=event_category")

    assert response.status_code == 200
    categories = [r["event_category"] for r in response.json()["resources"]]
    assert categories == sorted(categories)


@pytest.mark.asyncio
async def test_list_audit_events_sort_by_event_severity(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test sort by event_severity descending."""
    for severity in ("info", "warning", "error", "critical"):
        await audit_events_factory.create_event(event_severity=severity)

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?sort=-event_severity")

    assert response.status_code == 200
    severities = [r["event_severity"] for r in response.json()["resources"]]
    assert severities == sorted(severities, reverse=True)


@pytest.mark.asyncio
async def test_list_audit_events_sort_by_event_status(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test sort by event_status ascending."""
    for status in ("success", "error", "success"):
        await audit_events_factory.create_event(event_status=status)

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?sort=event_status")

    assert response.status_code == 200
    statuses = [r["event_status"] for r in response.json()["resources"]]
    assert statuses == sorted(statuses)


@pytest.mark.asyncio
async def test_list_audit_events_sort_by_actor_type(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test sort by actor_type ascending."""
    for actor_type in ("user", "system", "service"):
        await audit_events_factory.create_event(actor_type=actor_type)

    response = await auth_client_as_admin.get(f"{AUDIT_URL}?sort=actor_type")

    assert response.status_code == 200
    actor_types = [r["actor_type"] for r in response.json()["resources"]]
    assert actor_types == sorted(actor_types)


# ============================================================================
# Pagination (combined with filtering + sorting)
# ============================================================================


@pytest.mark.asyncio
async def test_list_audit_events_paginate_filtered_and_sorted(
    auth_client_as_admin: AsyncClient,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test cursor pagination over filtered + sorted results.

    Seeds 10 ``user_action`` + 5 ``system_operation`` events with strictly
    increasing ``created_at`` values, then pages through the filtered set in
    ascending ``created_at`` order using cursor-based pagination.
    """
    base = datetime(2025, 3, 1, tzinfo=UTC)
    for i in range(10):
        await audit_events_factory.create_event(
            event_category="user_action",
            event_action=f"target_{i}",
            created_at=base + timedelta(minutes=i),
        )
    for i in range(5):
        await audit_events_factory.create_event(
            event_category="system_operation",
            event_action=f"other_{i}",
            created_at=base + timedelta(hours=1, minutes=i),
        )

    base_params = {
        "event_category": "user_action",
        "sort": "created_at",
        "limit": "4",
        "include_total": "true",
    }

    # --- First page -------------------------------------------------------
    response = await auth_client_as_admin.get(AUDIT_URL, params=base_params)
    assert response.status_code == 200, response.text
    page1 = response.json()
    assert page1["total"] == 10
    assert len(page1["resources"]) == 4
    assert all(r["event_category"] == "user_action" for r in page1["resources"])
    assert page1["next"] is not None
    assert page1["prev"] is None

    # --- Second page ------------------------------------------------------
    response = await auth_client_as_admin.get(AUDIT_URL, params={**base_params, "cursor": page1["next"]})
    assert response.status_code == 200, response.text
    page2 = response.json()
    assert len(page2["resources"]) == 4
    assert all(r["event_category"] == "user_action" for r in page2["resources"])
    assert page2["next"] is not None
    assert page2["prev"] is not None

    # --- Third page (final, partial) --------------------------------------
    response = await auth_client_as_admin.get(AUDIT_URL, params={**base_params, "cursor": page2["next"]})
    assert response.status_code == 200, response.text
    page3 = response.json()
    assert len(page3["resources"]) == 2
    assert page3["next"] is None
    assert page3["prev"] is not None

    # Combined resources: no duplicates, ascending created_at across pages.
    all_ids = [r["id"] for p in (page1, page2, page3) for r in p["resources"]]
    assert len(all_ids) == len(set(all_ids)) == 10
    all_timestamps = [r["created_at"] for p in (page1, page2, page3) for r in p["resources"]]
    assert all_timestamps == sorted(all_timestamps)

    # --- Navigate backwards via prev cursor -------------------------------
    response = await auth_client_as_admin.get(AUDIT_URL, params={**base_params, "cursor": page3["prev"]})
    assert response.status_code == 200, response.text
    page2_back = response.json()
    assert [r["id"] for r in page2_back["resources"]] == [r["id"] for r in page2["resources"]]

    response = await auth_client_as_admin.get(AUDIT_URL, params={**base_params, "cursor": page2["prev"]})
    assert response.status_code == 200, response.text
    page1_back = response.json()
    assert [r["id"] for r in page1_back["resources"]] == [r["id"] for r in page1["resources"]]


# ============================================================================
# Validation and authentication
# ============================================================================


@pytest.mark.asyncio
async def test_list_audit_events_invalid_actor_type(auth_client_as_admin: AsyncClient) -> None:
    """Test that an invalid actor_type value returns 422."""
    response = await auth_client_as_admin.get(f"{AUDIT_URL}?actor_type=invalid")

    assert response.status_code == 422
    assert_error_data(
        response,
        error_type="https://api.nexus.com/errors/validation-error",
        title="Request Validation Error",
        detail="Validation failed: query -> actor_type: Input should be 'user', 'system' or 'service'",
        code="REQUEST_VALIDATION_ERROR",
        retryable=False,
    )


@pytest.mark.asyncio
async def test_list_audit_events_invalid_cursor(auth_client_as_admin: AsyncClient) -> None:
    """Test that a malformed cursor returns a structured 422 error."""
    # "Z2FyYmFnZQ==" is valid base64 for the ASCII string "garbage", which is
    # not valid JSON — exercising the cursor-decode error path end-to-end.
    response = await auth_client_as_admin.get(f"{AUDIT_URL}?cursor=Z2FyYmFnZQ==")

    assert response.status_code == 422
    assert_error_data(
        response,
        error_type="https://api.nexus.com/errors/validation-error",
        title="Validation Error",
        detail="Invalid input value",
        code="VALIDATION_ERROR",
        retryable=False,
    )


@pytest.mark.asyncio
async def test_list_audit_events_unauthenticated(base_client: AsyncClient) -> None:
    """Test listing audit events requires authentication."""
    response = await base_client.get(AUDIT_URL)

    assert response.status_code == 401
    assert_error_data(
        response,
        error_type="https://api.nexus.com/errors/unauthorized",
        title="Unauthorized",
        detail="Authentication required",
        code="AUTHENTICATION_REQUIRED",
        retryable=False,
    )


@pytest.mark.asyncio
async def test_list_audit_events_forbidden_for_non_admin(auth_client: AsyncClient) -> None:
    """Test that an authenticated non-admin, non-auditor user gets 403."""
    response = await auth_client.get(AUDIT_URL)

    assert response.status_code == 403
    assert_error_data(
        response,
        error_type="https://api.nexus.com/errors/forbidden",
        title="Authorization Denied",
        detail="Not authorized to perform read on audit",
        code="AUTHORIZATION_DENIED",
        retryable=False,
    )


@pytest.mark.asyncio
async def test_list_audit_events_allowed_for_auditor(
    auth_client: AsyncClient,
    test_db_session: AsyncSession,
    test_user: User,
    audit_events_factory: AuditEventsFactory,
) -> None:
    """Test that a user with the auditor role can list audit events."""
    await make_auditor(test_db_session, test_user)

    await audit_events_factory.create_events(count=2)

    response = await auth_client.get(AUDIT_URL)

    assert response.status_code == 200
    data = response.json()
    assert len(data["resources"]) == 2
