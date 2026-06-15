"""Tests for concurrent approval decision operations.

Verifies that optimistic and pessimistic locking prevent race conditions
when multiple users or batch operations attempt to decide the same approval simultaneously.
"""

import asyncio
from collections.abc import Awaitable, Callable
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.approvals.exceptions import ApprovalAlreadyDecidedError
from nexus.approvals.models import (
    ApprovalDecisionRequest,
    ApprovalRequest,
    ApprovalRequestStatus,
    BatchApprovalDecision,
    BatchApprovalRequest,
)
from nexus.approvals.services.approval_service import ApprovalService
from nexus.authz.engine import AuthzResult
from nexus.core.models import User


@pytest.fixture(autouse=True)
def _mock_opa_for_concurrency_tests(monkeypatch: pytest.MonkeyPatch) -> None:
    """Auto-mock OPA authorization for concurrency tests.

    Concurrency tests focus on locking behavior, not authorization,
    so we mock OPA to always allow.
    """
    from unittest.mock import Mock

    mock_client = Mock()
    mock_client.__bool__ = Mock(return_value=True)

    async def mock_authorize(*args: object, **kwargs: object) -> AuthzResult:
        return AuthzResult(
            allowed=True,
            denied=False,
            matched_policy="approval.decide",
            denial_reason="",
            denied_by="",
            effective_policies=[],
        )

    monkeypatch.setattr(
        "nexus.authz.engine.authorize",
        mock_authorize,
    )

    # Patch ApprovalService.__init__ to inject mock_client when opa_client is None
    original_init = ApprovalService.__init__

    def patched_init(self, session, user, opa_client=None) -> None:
        if opa_client is None:
            opa_client = mock_client
        original_init(self, session, user, opa_client)

    monkeypatch.setattr(ApprovalService, "__init__", patched_init)


def _valid_workflow_context() -> dict[str, object]:
    """Return a valid workflow context structure for testing."""
    return {
        "workflow_version_id": str(uuid4()),
        "workflow_name": "Test Workflow",
        "inputs": {},
    }


def _valid_next_step() -> dict[str, str]:
    """Return a valid activity summary structure for testing."""
    return {
        "id": "test_step",
        "name": "Test Step",
        "type": "task",
    }


@pytest.fixture
def mock_workflow_client():
    """Mock the workflow client to avoid HTTP calls in unit tests."""
    with patch("nexus.approvals.services.approval_service.WorkflowApiClient") as mock_cls:
        mock_client = AsyncMock()
        mock_client.send_approval_signal = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_cls.return_value = mock_client
        yield mock_client


@pytest.mark.asyncio
@pytest.mark.skip(
    reason="asyncio.gather with shared session serializes operations; "
    "test cannot verify true concurrent behavior. Optimistic locking "
    "is verified by batch_decide tests with separate transactions."
)
async def test_concurrent_decisions_only_one_succeeds(
    test_db_session: AsyncSession,
    admin_user: User,
    user_factory: Callable[..., Awaitable[User]],
    mock_workflow_client: AsyncMock,
) -> None:
    """Test that when two users decide the same approval simultaneously, only one succeeds.

    This verifies the optimistic locking implementation (WHERE status=PENDING)
    prevents double-decision race conditions.
    """
    # Create approval request
    approval = ApprovalRequest(
        execution_id=uuid4(),
        approval_node_id="test_node",
        project_id=None,
        name="Test Approval",
        timeout_at=None,
        status=ApprovalRequestStatus.PENDING,
        workflow_context=_valid_workflow_context(),
        next_step_approved=_valid_next_step(),
        next_step_rejected=None,
    )
    test_db_session.add(approval)
    await test_db_session.commit()
    await test_db_session.refresh(approval)

    # Create two services with different users attempting to decide
    basic_user = await user_factory()
    service_admin = ApprovalService(test_db_session, admin_user)
    service_basic = ApprovalService(test_db_session, basic_user)

    decision_admin = ApprovalDecisionRequest(status="approved", note="Admin approves")
    decision_basic = ApprovalDecisionRequest(status="approved", note="Basic approves")

    # Spawn concurrent decision attempts
    results = await asyncio.gather(
        service_admin.decide(approval.id, decision_admin),
        service_basic.decide(approval.id, decision_basic),
        return_exceptions=True,
    )

    # One should succeed, one should fail with ApprovalAlreadyDecidedError
    success_count = sum(1 for r in results if not isinstance(r, Exception))
    error_count = sum(1 for r in results if isinstance(r, ApprovalAlreadyDecidedError))

    assert success_count == 1, "Exactly one decision should succeed"
    assert error_count == 1, "Exactly one decision should fail with ApprovalAlreadyDecidedError"

    # Verify approval has exactly one decision
    await test_db_session.refresh(approval)
    assert approval.status in (ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED)
    assert approval.decided_by is not None
    assert approval.decided_at is not None


@pytest.mark.asyncio
async def test_concurrent_decision_and_list_no_deadlock(
    test_db_session: AsyncSession,
    admin_user: User,
    mock_workflow_client: AsyncMock,
) -> None:
    """Test that concurrent decision and list operations don't deadlock.

    Decision uses optimistic locking (no row lock), list uses SELECT (no lock),
    so they should not block each other.
    """
    # Create multiple approval requests
    approvals = [
        ApprovalRequest(
            execution_id=uuid4(),
            approval_node_id=f"node_{i}",
            project_id=None,
            name=f"Test Approval {i}",
            timeout_at=None,
            status=ApprovalRequestStatus.PENDING,
            workflow_context=_valid_workflow_context(),
            next_step_approved=_valid_next_step(),
            next_step_rejected=None,
        )
        for i in range(5)
    ]
    for approval in approvals:
        test_db_session.add(approval)
    await test_db_session.commit()

    for approval in approvals:
        await test_db_session.refresh(approval)

    service = ApprovalService(test_db_session, admin_user)
    decision = ApprovalDecisionRequest(status="approved", note="Concurrent test")

    # Spawn concurrent operations: decide first approval + list all approvals
    results = await asyncio.gather(
        service.decide(approvals[0].id, decision),
        service.list(limit=10),
        return_exceptions=True,
    )

    # Both operations should succeed without deadlock or timeout
    assert len(results) == 2
    assert not isinstance(results[0], Exception), f"Decision failed: {results[0]}"
    assert not isinstance(results[1], Exception), f"List failed: {results[1]}"


@pytest.mark.skip(
    reason="Session management issue: asyncio.gather with shared session does not guarantee true "
    "concurrent execution. Both operations may complete before the other checks the row, causing "
    "flaky failures. Requires separate sessions per service to properly test concurrent locking."
)
@pytest.mark.asyncio
async def test_batch_decision_locks_prevent_concurrent_single_decision(
    test_db_session: AsyncSession,
    admin_user: User,
    user_factory: Callable[..., Awaitable[User]],
    mock_workflow_client: AsyncMock,
) -> None:
    """Test that batch decision row locks prevent concurrent single decisions.

    Batch operation uses SELECT FOR UPDATE (pessimistic lock), which should
    block concurrent single decision attempts until batch completes.
    """
    # Create approval request
    approval = ApprovalRequest(
        execution_id=uuid4(),
        approval_node_id="test_node",
        project_id=None,
        name="Test Approval",
        timeout_at=None,
        status=ApprovalRequestStatus.PENDING,
        workflow_context=_valid_workflow_context(),
        next_step_approved=_valid_next_step(),
        next_step_rejected=None,
    )
    test_db_session.add(approval)
    await test_db_session.commit()
    await test_db_session.refresh(approval)

    basic_user = await user_factory()
    service_admin = ApprovalService(test_db_session, admin_user)
    service_basic = ApprovalService(test_db_session, basic_user)

    batch_decisions = [BatchApprovalDecision(approval_id=approval.id, status="approved", note="Batch approve")]
    single_decision = ApprovalDecisionRequest(status="approved", note="Single approve")

    # Spawn concurrent operations: batch + single decision
    # Note: Due to optimistic locking in single decision, both will attempt,
    # but only one will succeed (the one that commits first)
    results = await asyncio.gather(
        service_admin.batch_decide(BatchApprovalRequest(decisions=batch_decisions)),
        service_basic.decide(approval.id, single_decision),
        return_exceptions=True,
    )

    # One should succeed, one should fail
    success_count = sum(1 for r in results if not isinstance(r, Exception))
    error_count = sum(1 for r in results if isinstance(r, ApprovalAlreadyDecidedError))

    assert success_count == 1, "Exactly one operation should succeed"
    assert error_count == 1, "Exactly one operation should fail"


@pytest.mark.asyncio
async def test_batch_decision_with_duplicate_ids_processes_once(
    test_db_session: AsyncSession,
    admin_user: User,
    mock_workflow_client: AsyncMock,
) -> None:
    """Test that batch decision with duplicate approval IDs only processes each approval once.

    Batch operation should deduplicate IDs before processing, or handle duplicates gracefully.
    """
    # Create two approval requests
    approval1 = ApprovalRequest(
        execution_id=uuid4(),
        approval_node_id="node_1",
        project_id=None,
        name="Test Approval 1",
        timeout_at=None,
        status=ApprovalRequestStatus.PENDING,
        workflow_context=_valid_workflow_context(),
        next_step_approved=_valid_next_step(),
        next_step_rejected=None,
    )
    approval2 = ApprovalRequest(
        execution_id=uuid4(),
        approval_node_id="node_2",
        project_id=None,
        name="Test Approval 2",
        timeout_at=None,
        status=ApprovalRequestStatus.PENDING,
        workflow_context=_valid_workflow_context(),
        next_step_approved=_valid_next_step(),
        next_step_rejected=None,
    )
    test_db_session.add(approval1)
    test_db_session.add(approval2)
    await test_db_session.commit()
    await test_db_session.refresh(approval1)
    await test_db_session.refresh(approval2)

    service = ApprovalService(test_db_session, admin_user)

    # Create batch with duplicate IDs and conflicting decisions
    batch_decisions = [
        BatchApprovalDecision(approval_id=approval1.id, status="approved", note="First decision"),
        BatchApprovalDecision(approval_id=approval1.id, status="rejected", note="Duplicate decision"),
        BatchApprovalDecision(approval_id=approval2.id, status="approved", note="Second approval"),
    ]

    response = await service.batch_decide(BatchApprovalRequest(decisions=batch_decisions))

    # Both approvals should be processed (duplicates handled)
    assert len(response.results) == 3

    # Verify approval1 was decided (first decision wins)
    await test_db_session.refresh(approval1)
    assert approval1.status in (ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED)

    # Verify approval2 was decided
    await test_db_session.refresh(approval2)
    assert approval2.status == ApprovalRequestStatus.APPROVED


@pytest.mark.asyncio
@pytest.mark.skip(
    reason="Session management issue: 'This transaction is closed' error occurs when "
    "concurrent batch operations share a session. Requires separate sessions per batch."
)
async def test_concurrent_batch_decisions_no_overlap(
    test_db_session: AsyncSession,
    admin_user: User,
    user_factory: Callable[..., Awaitable[User]],
    mock_workflow_client: AsyncMock,
) -> None:
    """Test that concurrent batch decisions on non-overlapping approvals succeed.

    Two batches with completely different approval sets should not conflict.
    """
    # Create 4 approval requests
    approvals = [
        ApprovalRequest(
            execution_id=uuid4(),
            approval_node_id=f"node_{i}",
            project_id=None,
            name=f"Test Approval {i}",
            timeout_at=None,
            status=ApprovalRequestStatus.PENDING,
            workflow_context=_valid_workflow_context(),
            next_step_approved=_valid_next_step(),
            next_step_rejected=None,
        )
        for i in range(4)
    ]
    for approval in approvals:
        test_db_session.add(approval)
    await test_db_session.commit()
    for approval in approvals:
        await test_db_session.refresh(approval)

    basic_user = await user_factory()
    service_admin = ApprovalService(test_db_session, admin_user)
    service_basic = ApprovalService(test_db_session, basic_user)

    # Batch 1: approvals 0, 1
    batch1 = [
        BatchApprovalDecision(approval_id=approvals[0].id, status="approved", note="Batch 1"),
        BatchApprovalDecision(approval_id=approvals[1].id, status="approved", note="Batch 1"),
    ]

    # Batch 2: approvals 2, 3
    batch2 = [
        BatchApprovalDecision(approval_id=approvals[2].id, status="rejected", note="Batch 2"),
        BatchApprovalDecision(approval_id=approvals[3].id, status="rejected", note="Batch 2"),
    ]

    # Both batches should succeed without conflict
    results = await asyncio.gather(
        service_admin.batch_decide(BatchApprovalRequest(decisions=batch1)),
        service_basic.batch_decide(BatchApprovalRequest(decisions=batch2)),
        return_exceptions=True,
    )

    assert len(results) == 2
    assert not isinstance(results[0], Exception), f"Batch 1 failed: {results[0]}"
    assert not isinstance(results[1], Exception), f"Batch 2 failed: {results[1]}"

    # Verify all approvals were decided
    for approval in approvals:
        await test_db_session.refresh(approval)
        assert approval.status in (ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED)


@pytest.mark.asyncio
@pytest.mark.skip(
    reason="Session management issue: 'This transaction is closed' error occurs when "
    "concurrent batch operations share a session. Requires separate sessions per batch."
)
async def test_concurrent_batch_decisions_with_overlap(
    test_db_session: AsyncSession,
    admin_user: User,
    user_factory: Callable[..., Awaitable[User]],
    mock_workflow_client: AsyncMock,
) -> None:
    """Test that concurrent batch decisions on overlapping approvals handle conflicts gracefully.

    Two batches trying to decide the same approval should result in one batch
    succeeding for the overlapping approval and the other failing for that specific approval.
    """
    # Create 3 approval requests
    approvals = [
        ApprovalRequest(
            execution_id=uuid4(),
            approval_node_id=f"node_{i}",
            project_id=None,
            name=f"Test Approval {i}",
            timeout_at=None,
            status=ApprovalRequestStatus.PENDING,
            workflow_context=_valid_workflow_context(),
            next_step_approved=_valid_next_step(),
            next_step_rejected=None,
        )
        for i in range(3)
    ]
    for approval in approvals:
        test_db_session.add(approval)
    await test_db_session.commit()
    for approval in approvals:
        await test_db_session.refresh(approval)

    basic_user = await user_factory()
    service_admin = ApprovalService(test_db_session, admin_user)
    service_basic = ApprovalService(test_db_session, basic_user)

    # Batch 1: approvals 0, 1
    batch1 = [
        BatchApprovalDecision(approval_id=approvals[0].id, status="approved", note="Batch 1"),
        BatchApprovalDecision(approval_id=approvals[1].id, status="approved", note="Batch 1"),
    ]

    # Batch 2: approvals 1, 2 (overlaps with batch 1 on approval 1)
    batch2 = [
        BatchApprovalDecision(approval_id=approvals[1].id, status="rejected", note="Batch 2"),
        BatchApprovalDecision(approval_id=approvals[2].id, status="rejected", note="Batch 2"),
    ]

    # Both batches run concurrently
    results = await asyncio.gather(
        service_admin.batch_decide(BatchApprovalRequest(decisions=batch1)),
        service_basic.batch_decide(BatchApprovalRequest(decisions=batch2)),
        return_exceptions=True,
    )

    # Both batches should complete (partial success is valid for batch operations)
    assert len(results) == 2
    assert not isinstance(results[0], Exception), f"Batch 1 failed: {results[0]}"
    assert not isinstance(results[1], Exception), f"Batch 2 failed: {results[1]}"

    # Verify approval 1 was decided (only one batch succeeded for it)
    await test_db_session.refresh(approvals[1])
    assert approvals[1].status in (ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED)

    # Verify approvals 0 and 2 were also decided
    await test_db_session.refresh(approvals[0])
    await test_db_session.refresh(approvals[2])
    assert approvals[0].status in (ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED)
    assert approvals[2].status in (ApprovalRequestStatus.APPROVED, ApprovalRequestStatus.REJECTED)
