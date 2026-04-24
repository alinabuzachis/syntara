from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.approval_request_status import ApprovalRequestStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.approval_request_read_labels import ApprovalRequestReadLabels
    from ..models.approval_request_read_next_step_approved import ApprovalRequestReadNextStepApproved
    from ..models.approval_request_read_next_step_rejected_type_0 import ApprovalRequestReadNextStepRejectedType0
    from ..models.approval_request_read_workflow_context import ApprovalRequestReadWorkflowContext
    from ..models.user_reference import UserReference


T = TypeVar("T", bound="ApprovalRequestRead")


@_attrs_define
class ApprovalRequestRead:
    """ApprovalRequest API response model with UserReference for decided_by.


    Extends BaseApprovalRequest with the API-specific decided_by field

    that contains a UserReference object for API responses.

      Attributes:
          execution_id (UUID): Parent execution ID
          approval_node_id (str): Activity ID from workflow definition
          name (str): Human-readable name for the approval request
          next_step_approved (ApprovalRequestReadNextStepApproved): First activity that executes if approved
          id (UUID | Unset): Unique identifier for the resource Example: 550e8400-e29b-41d4-a716-446655440000.
          created_at (datetime.datetime | Unset): Timestamp when resource was created Example: 2025-10-09T12:00:00Z.
          updated_at (datetime.datetime | Unset): Timestamp when resource was last updated Example: 2025-10-09T12:30:00Z.
          labels (ApprovalRequestReadLabels | Unset): Key-value pairs for resource labeling and filtering Example:
              {'environment': 'production', 'region': 'us-east-1', 'team': 'platform'}.
          project_id (None | Unset | UUID): Project this approval belongs to (denormalized from execution)
          status (ApprovalRequestStatus | Unset): Approval request status enumeration.
          timeout_at (datetime.datetime | None | Unset): When this request expires
          next_step_rejected (ApprovalRequestReadNextStepRejectedType0 | None | Unset): First activity that executes if
              rejected
          workflow_context (ApprovalRequestReadWorkflowContext | Unset): Workflow inputs and previous step output
          decided_by (None | Unset | UserReference): User who made the decision
          decided_at (datetime.datetime | None | Unset): When decision was made
          decision_notes (None | str | Unset): Notes provided with decision
    """

    execution_id: UUID
    approval_node_id: str
    name: str
    next_step_approved: ApprovalRequestReadNextStepApproved
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: ApprovalRequestReadLabels | Unset = UNSET
    project_id: None | Unset | UUID = UNSET
    status: ApprovalRequestStatus | Unset = UNSET
    timeout_at: datetime.datetime | None | Unset = UNSET
    next_step_rejected: ApprovalRequestReadNextStepRejectedType0 | None | Unset = UNSET
    workflow_context: ApprovalRequestReadWorkflowContext | Unset = UNSET
    decided_by: None | Unset | UserReference = UNSET
    decided_at: datetime.datetime | None | Unset = UNSET
    decision_notes: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.approval_request_read_next_step_rejected_type_0 import ApprovalRequestReadNextStepRejectedType0
        from ..models.user_reference import UserReference

        execution_id = str(self.execution_id)

        approval_node_id = self.approval_node_id

        name = self.name

        next_step_approved = self.next_step_approved.to_dict()

        id: str | Unset = UNSET
        if not isinstance(self.id, Unset):
            id = str(self.id)

        created_at: str | Unset = UNSET
        if not isinstance(self.created_at, Unset):
            created_at = self.created_at.isoformat()

        updated_at: str | Unset = UNSET
        if not isinstance(self.updated_at, Unset):
            updated_at = self.updated_at.isoformat()

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        project_id: None | str | Unset
        if isinstance(self.project_id, Unset):
            project_id = UNSET
        elif isinstance(self.project_id, UUID):
            project_id = str(self.project_id)
        else:
            project_id = self.project_id

        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        timeout_at: None | str | Unset
        if isinstance(self.timeout_at, Unset):
            timeout_at = UNSET
        elif isinstance(self.timeout_at, datetime.datetime):
            timeout_at = self.timeout_at.isoformat()
        else:
            timeout_at = self.timeout_at

        next_step_rejected: dict[str, Any] | None | Unset
        if isinstance(self.next_step_rejected, Unset):
            next_step_rejected = UNSET
        elif isinstance(self.next_step_rejected, ApprovalRequestReadNextStepRejectedType0):
            next_step_rejected = self.next_step_rejected.to_dict()
        else:
            next_step_rejected = self.next_step_rejected

        workflow_context: dict[str, Any] | Unset = UNSET
        if not isinstance(self.workflow_context, Unset):
            workflow_context = self.workflow_context.to_dict()

        decided_by: dict[str, Any] | None | Unset
        if isinstance(self.decided_by, Unset):
            decided_by = UNSET
        elif isinstance(self.decided_by, UserReference):
            decided_by = self.decided_by.to_dict()
        else:
            decided_by = self.decided_by

        decided_at: None | str | Unset
        if isinstance(self.decided_at, Unset):
            decided_at = UNSET
        elif isinstance(self.decided_at, datetime.datetime):
            decided_at = self.decided_at.isoformat()
        else:
            decided_at = self.decided_at

        decision_notes: None | str | Unset
        if isinstance(self.decision_notes, Unset):
            decision_notes = UNSET
        else:
            decision_notes = self.decision_notes

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "execution_id": execution_id,
                "approval_node_id": approval_node_id,
                "name": name,
                "next_step_approved": next_step_approved,
            }
        )
        if id is not UNSET:
            field_dict["id"] = id
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at
        if labels is not UNSET:
            field_dict["labels"] = labels
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if status is not UNSET:
            field_dict["status"] = status
        if timeout_at is not UNSET:
            field_dict["timeout_at"] = timeout_at
        if next_step_rejected is not UNSET:
            field_dict["next_step_rejected"] = next_step_rejected
        if workflow_context is not UNSET:
            field_dict["workflow_context"] = workflow_context
        if decided_by is not UNSET:
            field_dict["decided_by"] = decided_by
        if decided_at is not UNSET:
            field_dict["decided_at"] = decided_at
        if decision_notes is not UNSET:
            field_dict["decision_notes"] = decision_notes

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.approval_request_read_labels import ApprovalRequestReadLabels
        from ..models.approval_request_read_next_step_approved import ApprovalRequestReadNextStepApproved
        from ..models.approval_request_read_next_step_rejected_type_0 import ApprovalRequestReadNextStepRejectedType0
        from ..models.approval_request_read_workflow_context import ApprovalRequestReadWorkflowContext
        from ..models.user_reference import UserReference

        d = dict(src_dict)
        execution_id = UUID(d.pop("execution_id"))

        approval_node_id = d.pop("approval_node_id")

        name = d.pop("name")

        next_step_approved = ApprovalRequestReadNextStepApproved.from_dict(d.pop("next_step_approved"))

        _id = d.pop("id", UNSET)
        id: UUID | Unset
        if isinstance(_id, Unset):
            id = UNSET
        else:
            id = UUID(_id)

        _created_at = d.pop("created_at", UNSET)
        created_at: datetime.datetime | Unset
        if isinstance(_created_at, Unset):
            created_at = UNSET
        else:
            created_at = isoparse(_created_at)

        _updated_at = d.pop("updated_at", UNSET)
        updated_at: datetime.datetime | Unset
        if isinstance(_updated_at, Unset):
            updated_at = UNSET
        else:
            updated_at = isoparse(_updated_at)

        _labels = d.pop("labels", UNSET)
        labels: ApprovalRequestReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = ApprovalRequestReadLabels.from_dict(_labels)

        def _parse_project_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                project_id_type_0 = UUID(data)

                return project_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        project_id = _parse_project_id(d.pop("project_id", UNSET))

        _status = d.pop("status", UNSET)
        status: ApprovalRequestStatus | Unset
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = ApprovalRequestStatus(_status)

        def _parse_timeout_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                timeout_at_type_0 = isoparse(data)

                return timeout_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        timeout_at = _parse_timeout_at(d.pop("timeout_at", UNSET))

        def _parse_next_step_rejected(data: object) -> ApprovalRequestReadNextStepRejectedType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                next_step_rejected_type_0 = ApprovalRequestReadNextStepRejectedType0.from_dict(data)

                return next_step_rejected_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(ApprovalRequestReadNextStepRejectedType0 | None | Unset, data)

        next_step_rejected = _parse_next_step_rejected(d.pop("next_step_rejected", UNSET))

        _workflow_context = d.pop("workflow_context", UNSET)
        workflow_context: ApprovalRequestReadWorkflowContext | Unset
        if isinstance(_workflow_context, Unset):
            workflow_context = UNSET
        else:
            workflow_context = ApprovalRequestReadWorkflowContext.from_dict(_workflow_context)

        def _parse_decided_by(data: object) -> None | Unset | UserReference:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                decided_by_type_0 = UserReference.from_dict(data)

                return decided_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UserReference, data)

        decided_by = _parse_decided_by(d.pop("decided_by", UNSET))

        def _parse_decided_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                decided_at_type_0 = isoparse(data)

                return decided_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        decided_at = _parse_decided_at(d.pop("decided_at", UNSET))

        def _parse_decision_notes(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        decision_notes = _parse_decision_notes(d.pop("decision_notes", UNSET))

        approval_request_read = cls(
            execution_id=execution_id,
            approval_node_id=approval_node_id,
            name=name,
            next_step_approved=next_step_approved,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            project_id=project_id,
            status=status,
            timeout_at=timeout_at,
            next_step_rejected=next_step_rejected,
            workflow_context=workflow_context,
            decided_by=decided_by,
            decided_at=decided_at,
            decision_notes=decision_notes,
        )

        return approval_request_read
