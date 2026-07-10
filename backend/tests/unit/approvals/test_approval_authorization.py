"""Unit tests for approval authorization logic.

Tests the authorization logic for approvals including:
- GroupMembershipService
- ApprovalService._is_user_authorized_approver
- Authorization checks in decide() and batch_decide()
"""

from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import selectinload
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.approvals.exceptions import ApprovalNotAuthorizedError
from nexus.approvals.models import (
    ActivitySummary,
    ApprovalCreateRequest,
    ApprovalDecisionRequest,
    ApprovalDecisionStatus,
    ApprovalRequest,
    ApprovalRequestStatus,
    BatchApprovalDecision,
    BatchApprovalDecisionStatus,
    BatchApprovalRequest,
    WorkflowContext,
)
from nexus.approvals.services.approval_service import ApprovalService
from nexus.authz.engine import AuthzResult
from nexus.core.models import Group, User
from nexus.core.models.group import user_groups
from tests.helpers.workflow import ExecutionsFactory


@pytest.fixture(autouse=True)
def _mock_evaluator_for_approver_tests(monkeypatch: pytest.MonkeyPatch, request) -> None:
    """Auto-mock authz evaluator authorization for approver list tests.

    This fixture automatically provides a mock authz evaluator that allows all
    approval:decide permissions for tests that check approver list logic.

    Only applies to test classes that need it (not Rego-specific tests).
    """
    # Skip for Rego-specific test class (it has its own mocking)
    if hasattr(request, "instance") and isinstance(request.instance, TestApprovalServiceEvaluatorAuthorization):
        return

    # Skip if not in a test class that uses ApprovalService
    if not hasattr(request, "instance") or not isinstance(
        request.instance,
        (
            TestApprovalServiceIsUserAuthorizedApprover,
            TestApprovalServiceDecideAuthorization,
            TestApprovalServiceBatchDecideAuthorization,
        ),
    ):
        return

    # Create mock authz evaluator using AsyncMock
    from unittest.mock import Mock

    mock_client = Mock()
    mock_client.__bool__ = Mock(return_value=True)  # Truthy check for "if self.evaluator"

    # Mock the authorize function to return allowed

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

    # Patch ApprovalService.__init__ to inject mock_client when evaluator is None
    original_init = ApprovalService.__init__

    def patched_init(self, session, user, evaluator=None) -> None:
        if evaluator is None:
            evaluator = mock_client
        original_init(self, session, user, evaluator)

    monkeypatch.setattr(ApprovalService, "__init__", patched_init)


class TestApprovalAuthorizationBase:
    """Base test class with helper methods for approval authorization tests."""

    async def _get_approval_with_relationships(
        self, session: AsyncSession, approval_id: UUID
    ) -> ApprovalRequest | None:
        """Get approval with eager-loaded relationships to avoid MissingGreenlet errors."""
        result = await session.exec(
            select(ApprovalRequest)
            .where(ApprovalRequest.id == approval_id)
            .options(
                selectinload(ApprovalRequest.decider),  # type: ignore[arg-type]
                selectinload(ApprovalRequest.approver_user_records),  # type: ignore[arg-type]
                selectinload(ApprovalRequest.approver_group_records),  # type: ignore[arg-type]
            )
        )
        return result.first()

    def _create_approval_request(
        self,
        execution_id: UUID,
        approval_node_id: str = "approval_1",
        approver_user_ids: list[UUID] | None = None,
        approver_group_ids: list[UUID] | None = None,
        project_id: UUID | None = None,
    ) -> ApprovalCreateRequest:
        """Create a typed approval request for testing."""
        workflow_context = WorkflowContext(
            workflow_version_id=uuid4(),
            workflow_name="Test Workflow",
            inputs={"environment": "test"},
        )

        next_step_approved = ActivitySummary(
            id="approved_step",
            name="Approved Step",
            type="task",
        )

        return ApprovalCreateRequest(
            execution_id=execution_id,
            approval_node_id=approval_node_id,
            name="Test Approval",
            timeout_at=None,
            next_step_approved=next_step_approved,
            next_step_rejected=None,
            workflow_context=workflow_context,
            approver_user_ids=approver_user_ids,
            approver_group_ids=approver_group_ids,
            project_id=project_id or uuid4(),
        )


class TestApprovalServiceIsUserAuthorizedApprover(TestApprovalAuthorizationBase):
    """Test ApprovalService._is_user_authorized_approver method."""

    @pytest.mark.asyncio
    async def test_no_approvers_configured_allows_any_user(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that when no approvers are configured, any user is authorized."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=None,
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        # Get the approval object with eager-loaded relationships
        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is True

    @pytest.mark.asyncio
    async def test_user_in_approver_users_list(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that user in approver_users list is authorized."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[user.id],
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is True

    @pytest.mark.asyncio
    async def test_user_not_in_approver_users_list(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that user not in approver_users list is not authorized."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        # Use user_2 from fixture (different from user_1)
        other_user = users["user_2"]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[other_user.id],
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is False

    @pytest.mark.asyncio
    async def test_user_in_approver_group(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that user in an approver group is authorized."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        # Create group and add user
        group = Group(name="test-approvers-group")
        test_db_session.add(group)
        await test_db_session.commit()
        await test_db_session.refresh(group)

        await test_db_session.execute(user_groups.insert().values(user_id=user.id, group_id=group.id))
        await test_db_session.commit()

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=None,
            approver_group_ids=[group.id],
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is True

    @pytest.mark.asyncio
    async def test_user_not_in_approver_group(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that user not in any approver group is not authorized."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        # Create group but don't add user
        group = Group(name="test-unapproved-group")
        test_db_session.add(group)
        await test_db_session.commit()

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=None,
            approver_group_ids=[group.id],
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is False

    @pytest.mark.asyncio
    async def ***REMOVED***(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that user authorized if they match either approver_users OR approver_groups."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        # Create a group for testing (user not in it)
        group = Group(name="test-some-group")
        test_db_session.add(group)
        await test_db_session.commit()
        await test_db_session.refresh(group)

        # User is in the approver_user_ids list but not in any group
        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[user.id],
            approver_group_ids=[group.id],
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is True


class TestApprovalServiceDecideAuthorization(TestApprovalAuthorizationBase):
    """Test authorization in ApprovalService.decide method."""

    @pytest.mark.asyncio
    async def test_decide_authorized_user(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that authorized user can decide approval."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[user.id],
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        # User should be able to decide
        decision = ApprovalDecisionRequest(status=ApprovalDecisionStatus.APPROVED, notes="Looks good")
        result = await service.decide(approval_read.id, decision)

        assert result.status == ApprovalRequestStatus.APPROVED
        assert result.decided_by is not None
        assert result.decided_by.id == user.id

    @pytest.mark.asyncio
    async def test_decide_unauthorized_user_raises_exception(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that unauthorized user cannot decide approval."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        # Create approval with different approver (use user_2 from fixture)
        other_user = users["user_2"]
        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[other_user.id],
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval_read = await service.create(request)

        # User should NOT be able to decide
        decision = ApprovalDecisionRequest(status=ApprovalDecisionStatus.APPROVED)

        with pytest.raises(ApprovalNotAuthorizedError) as exc_info:
            await service.decide(approval_read.id, decision)

        assert exc_info.value.approval_id == approval_read.id
        assert exc_info.value.user_id == user.id


class TestApprovalServiceBatchDecideAuthorization(TestApprovalAuthorizationBase):
    """Test authorization in ApprovalService.batch_decide method."""

    @pytest.mark.asyncio
    async def test_batch_decide_mixed_authorization(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test batch decide with mix of authorized and unauthorized approvals."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        # Create one approval user is authorized for
        request1 = self._create_approval_request(
            execution_id=execution.id,
            approval_node_id="approval_1",
            approver_user_ids=[user.id],
            project_id=execution.project_id,
        )

        # Create one approval user is NOT authorized for (use user_2 from fixture)
        other_user = users["user_2"]
        request2 = self._create_approval_request(
            execution_id=execution.id,
            approval_node_id="approval_2",
            approver_user_ids=[other_user.id],
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval1 = await service.create(request1)
        approval2 = await service.create(request2)

        # Try to batch decide both
        batch_request = BatchApprovalRequest(
            decisions=[
                BatchApprovalDecision(
                    approval_id=approval1.id, status=BatchApprovalDecisionStatus.APPROVED, notes="OK"
                ),
                BatchApprovalDecision(
                    approval_id=approval2.id, status=BatchApprovalDecisionStatus.APPROVED, notes="OK"
                ),
            ]
        )

        response = await service.batch_decide(batch_request)

        # First should succeed, second should fail
        assert response.total_success == 1
        assert response.total_failed == 1

        authorized_result = next(r for r in response.results if r.approval_id == approval1.id)
        assert authorized_result.success is True
        assert authorized_result.status == ApprovalRequestStatus.APPROVED

        unauthorized_result = next(r for r in response.results if r.approval_id == approval2.id)
        assert unauthorized_result.success is False
        assert unauthorized_result.error == "Not authorized to decide this approval"

    @pytest.mark.asyncio
    async def test_batch_decide_all_authorized(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test batch decide with all approvals authorized."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        # Create two approvals user is authorized for
        request1 = self._create_approval_request(
            execution_id=execution.id,
            approval_node_id="approval_1",
            approver_user_ids=[user.id],
            project_id=execution.project_id,
        )
        request2 = self._create_approval_request(
            execution_id=execution.id,
            approval_node_id="approval_2",
            approver_user_ids=[user.id],
            project_id=execution.project_id,
        )

        service = ApprovalService(test_db_session, user)
        approval1 = await service.create(request1)
        approval2 = await service.create(request2)

        # Batch decide both
        batch_request = BatchApprovalRequest(
            decisions=[
                BatchApprovalDecision(approval_id=approval1.id, status=BatchApprovalDecisionStatus.APPROVED),
                BatchApprovalDecision(approval_id=approval2.id, status=BatchApprovalDecisionStatus.REJECTED),
            ]
        )

        response = await service.batch_decide(batch_request)

        assert response.total_success == 2
        assert response.total_failed == 0

        result1 = next(r for r in response.results if r.approval_id == approval1.id)
        assert result1.success is True
        assert result1.status == ApprovalRequestStatus.APPROVED

        result2 = next(r for r in response.results if r.approval_id == approval2.id)
        assert result2.success is True
        assert result2.status == ApprovalRequestStatus.REJECTED


class TestApprovalServiceEvaluatorAuthorization(TestApprovalAuthorizationBase):
    """Test authz evaluator authorization flow in ApprovalService._is_user_authorized_approver.

    Tests the critical security check added for project-scoped batch approval.
    """

    @pytest.mark.asyncio
    async def test_evaluator_none_denies_access(
        self, test_db_session: AsyncSession, users: dict[str, User], executions_factory: ExecutionsFactory
    ) -> None:
        """Test that when evaluator is None, authorization is denied (fail closed)."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=None,
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        # Create service WITHOUT evaluator (None)
        service = ApprovalService(test_db_session, user, evaluator=None)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        # Should deny access when authz evaluator is None (fail closed)
        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is False

    @pytest.mark.asyncio
    async def test_opa_denies_access_even_if_in_approver_list(
        self,
        test_db_session: AsyncSession,
        users: dict[str, User],
        executions_factory: ExecutionsFactory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that evaluator denial blocks access even if user is in the approver list."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[user.id],
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        # Mock authz evaluator to deny permission
        from unittest.mock import Mock

        mock_evaluator = Mock()

        async def mock_authorize(*args: object, **kwargs: object) -> AuthzResult:
            return AuthzResult(
                allowed=False,
                denied=True,
                matched_policy="",
                denial_reason="User not authorized",
                denied_by="test",
                effective_policies=[],
            )

        monkeypatch.setattr("nexus.authz.engine.authorize", mock_authorize)

        service = ApprovalService(test_db_session, user, evaluator=mock_evaluator)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        # evaluator denies, so authorization fails despite being in approver list
        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is False

    @pytest.mark.asyncio
    async def ***REMOVED***(
        self,
        test_db_session: AsyncSession,
        users: dict[str, User],
        executions_factory: ExecutionsFactory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that evaluator allow + approver list membership grants access."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[user.id],
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        # Mock authz evaluator to allow permission
        from unittest.mock import Mock

        mock_evaluator = Mock()

        async def mock_authorize(*args: object, **kwargs: object) -> AuthzResult:
            return AuthzResult(
                allowed=True,
                denied=False,
                matched_policy="approval.decide",
                denial_reason="",
                denied_by="",
                effective_policies=[],
            )

        monkeypatch.setattr("nexus.authz.engine.authorize", mock_authorize)

        service = ApprovalService(test_db_session, user, evaluator=mock_evaluator)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        # evaluator allows AND user in approver list = authorized
        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is True

    @pytest.mark.asyncio
    async def ***REMOVED***(
        self,
        test_db_session: AsyncSession,
        users: dict[str, User],
        executions_factory: ExecutionsFactory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that evaluator allow without approver list membership denies access."""
        user = users["user_1"]
        other_user = users["user_2"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=[other_user.id],
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        # Mock authz evaluator to allow permission
        from unittest.mock import Mock

        mock_evaluator = Mock()

        async def mock_authorize(*args: object, **kwargs: object) -> AuthzResult:
            return AuthzResult(
                allowed=True,
                denied=False,
                matched_policy="approval.decide",
                denial_reason="",
                denied_by="",
                effective_policies=[],
            )

        monkeypatch.setattr("nexus.authz.engine.authorize", mock_authorize)

        service = ApprovalService(test_db_session, user, evaluator=mock_evaluator)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        # evaluator allows but user NOT in approver list = not authorized
        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is False

    @pytest.mark.asyncio
    async def ***REMOVED***(
        self,
        test_db_session: AsyncSession,
        users: dict[str, User],
        executions_factory: ExecutionsFactory,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Test that evaluator allow with empty approver list grants access (AC5 fallback)."""
        user = users["user_1"]
        executions = await executions_factory.create_executions(count=1)
        execution = executions[0]

        request = self._create_approval_request(
            execution_id=execution.id,
            approver_user_ids=None,
            approver_group_ids=None,
            project_id=execution.project_id,
        )

        # Mock authz evaluator to allow permission
        from unittest.mock import Mock

        mock_evaluator = Mock()

        async def mock_authorize(*args: object, **kwargs: object) -> AuthzResult:
            return AuthzResult(
                allowed=True,
                denied=False,
                matched_policy="approval.decide",
                denial_reason="",
                denied_by="",
                effective_policies=[],
            )

        monkeypatch.setattr("nexus.authz.engine.authorize", mock_authorize)

        service = ApprovalService(test_db_session, user, evaluator=mock_evaluator)
        approval_read = await service.create(request)

        approval = await self._get_approval_with_relationships(test_db_session, approval_read.id)
        assert approval is not None

        # evaluator allows + empty approver list = authorized (AC5 fallback)
        is_authorized = await service._is_user_authorized_approver(approval)
        assert is_authorized is True
