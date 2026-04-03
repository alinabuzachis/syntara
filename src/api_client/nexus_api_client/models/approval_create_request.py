from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.activity_summary import ActivitySummary
    from ..models.workflow_context import WorkflowContext


T = TypeVar("T", bound="ApprovalCreateRequest")


@_attrs_define
class ApprovalCreateRequest:
    """Request payload for creating an approval request.

    This is an internal schema used by the Workflows component.

        Attributes:
            execution_id (UUID): Parent workflow execution ID
            approval_node_id (str): Activity ID from workflow definition
            name (str): Display name for the approval request
            workflow_context (WorkflowContext): Workflow Context for approvers.

                Essential context for approvers to make a decision.
                Contains workflow identification, inputs, and the output from the immediately
                preceding activity.
            timeout_at (datetime.datetime | None | Unset): When this request expires (null = no timeout)
            next_step_approved (ActivitySummary | None | Unset): First activity that executes if approved
            next_step_rejected (ActivitySummary | None | Unset): First activity that executes if rejected
    """

    execution_id: UUID
    approval_node_id: str
    name: str
    workflow_context: WorkflowContext
    timeout_at: datetime.datetime | None | Unset = UNSET
    next_step_approved: ActivitySummary | None | Unset = UNSET
    next_step_rejected: ActivitySummary | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.activity_summary import ActivitySummary

        execution_id = str(self.execution_id)

        approval_node_id = self.approval_node_id

        name = self.name

        workflow_context = self.workflow_context.to_dict()

        timeout_at: None | str | Unset
        if isinstance(self.timeout_at, Unset):
            timeout_at = UNSET
        elif isinstance(self.timeout_at, datetime.datetime):
            timeout_at = self.timeout_at.isoformat()
        else:
            timeout_at = self.timeout_at

        next_step_approved: dict[str, Any] | None | Unset
        if isinstance(self.next_step_approved, Unset):
            next_step_approved = UNSET
        elif isinstance(self.next_step_approved, ActivitySummary):
            next_step_approved = self.next_step_approved.to_dict()
        else:
            next_step_approved = self.next_step_approved

        next_step_rejected: dict[str, Any] | None | Unset
        if isinstance(self.next_step_rejected, Unset):
            next_step_rejected = UNSET
        elif isinstance(self.next_step_rejected, ActivitySummary):
            next_step_rejected = self.next_step_rejected.to_dict()
        else:
            next_step_rejected = self.next_step_rejected

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "execution_id": execution_id,
                "approval_node_id": approval_node_id,
                "name": name,
                "workflow_context": workflow_context,
            }
        )
        if timeout_at is not UNSET:
            field_dict["timeout_at"] = timeout_at
        if next_step_approved is not UNSET:
            field_dict["next_step_approved"] = next_step_approved
        if next_step_rejected is not UNSET:
            field_dict["next_step_rejected"] = next_step_rejected

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.activity_summary import ActivitySummary
        from ..models.workflow_context import WorkflowContext

        d = dict(src_dict)
        execution_id = UUID(d.pop("execution_id"))

        approval_node_id = d.pop("approval_node_id")

        name = d.pop("name")

        workflow_context = WorkflowContext.from_dict(d.pop("workflow_context"))

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

        def _parse_next_step_approved(data: object) -> ActivitySummary | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                next_step_approved_type_0 = ActivitySummary.from_dict(data)

                return next_step_approved_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(ActivitySummary | None | Unset, data)

        next_step_approved = _parse_next_step_approved(d.pop("next_step_approved", UNSET))

        def _parse_next_step_rejected(data: object) -> ActivitySummary | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                next_step_rejected_type_0 = ActivitySummary.from_dict(data)

                return next_step_rejected_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(ActivitySummary | None | Unset, data)

        next_step_rejected = _parse_next_step_rejected(d.pop("next_step_rejected", UNSET))

        approval_create_request = cls(
            execution_id=execution_id,
            approval_node_id=approval_node_id,
            name=name,
            workflow_context=workflow_context,
            timeout_at=timeout_at,
            next_step_approved=next_step_approved,
            next_step_rejected=next_step_rejected,
        )

        approval_create_request.additional_properties = d
        return approval_create_request

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
