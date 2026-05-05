from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.execution_status import ExecutionStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.activity_data import ActivityData
    from ..models.current_activity import CurrentActivity
    from ..models.execution_read_input_data import ExecutionReadInputData
    from ..models.execution_read_labels import ExecutionReadLabels
    from ..models.execution_read_workflow_definition_type_0 import ExecutionReadWorkflowDefinitionType0


T = TypeVar("T", bound="ExecutionRead")


@_attrs_define
class ExecutionRead:
    """Schema for execution response (GET /executions/{id}).

    Includes all fields from the database table model.

        Attributes:
            completed_at (datetime.datetime | None):
            created_at (datetime.datetime):
            created_by (UUID):
            error_details (None | str):
            id (UUID):
            input_data (ExecutionReadInputData):
            status (ExecutionStatus): Current state of a workflow execution lifecycle.
            temporal_workflow_id (str):
            updated_at (datetime.datetime):
            updated_by (None | UUID):
            workflow_id (UUID):
            workflow_version_id (UUID):
            activities (list[ActivityData] | None | Unset): List of activities with their current status. Only included when
                requested via ?include=activities query parameter.
            current_activities (list[CurrentActivity] | Unset): Currently executing activities
            deleted_at (datetime.datetime | None | Unset):
            deleted_by (None | Unset | UUID):
            labels (ExecutionReadLabels | Unset):
            project_id (None | Unset | UUID):
            trigger_node_id (None | str | Unset):
            workflow_definition (ExecutionReadWorkflowDefinitionType0 | None | Unset): Workflow definition from the executed
                version. Only included when requested via ?include=workflow_definition query parameter.
    """

    completed_at: datetime.datetime | None
    created_at: datetime.datetime
    created_by: UUID
    error_details: None | str
    id: UUID
    input_data: ExecutionReadInputData
    status: ExecutionStatus
    temporal_workflow_id: str
    updated_at: datetime.datetime
    updated_by: None | UUID
    workflow_id: UUID
    workflow_version_id: UUID
    activities: list[ActivityData] | None | Unset = UNSET
    current_activities: list[CurrentActivity] | Unset = UNSET
    deleted_at: datetime.datetime | None | Unset = UNSET
    deleted_by: None | Unset | UUID = UNSET
    labels: ExecutionReadLabels | Unset = UNSET
    project_id: None | Unset | UUID = UNSET
    trigger_node_id: None | str | Unset = UNSET
    workflow_definition: ExecutionReadWorkflowDefinitionType0 | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.execution_read_workflow_definition_type_0 import ExecutionReadWorkflowDefinitionType0

        completed_at: None | str
        if isinstance(self.completed_at, datetime.datetime):
            completed_at = self.completed_at.isoformat()
        else:
            completed_at = self.completed_at

        created_at = self.created_at.isoformat()

        created_by = str(self.created_by)

        error_details: None | str
        error_details = self.error_details

        id = str(self.id)

        input_data = self.input_data.to_dict()

        status = self.status.value

        temporal_workflow_id = self.temporal_workflow_id

        updated_at = self.updated_at.isoformat()

        updated_by: None | str
        if isinstance(self.updated_by, UUID):
            updated_by = str(self.updated_by)
        else:
            updated_by = self.updated_by

        workflow_id = str(self.workflow_id)

        workflow_version_id = str(self.workflow_version_id)

        activities: list[dict[str, Any]] | None | Unset
        if isinstance(self.activities, Unset):
            activities = UNSET
        elif isinstance(self.activities, list):
            activities = []
            for activities_type_0_item_data in self.activities:
                activities_type_0_item = activities_type_0_item_data.to_dict()
                activities.append(activities_type_0_item)

        else:
            activities = self.activities

        current_activities: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.current_activities, Unset):
            current_activities = []
            for current_activities_item_data in self.current_activities:
                current_activities_item = current_activities_item_data.to_dict()
                current_activities.append(current_activities_item)

        deleted_at: None | str | Unset
        if isinstance(self.deleted_at, Unset):
            deleted_at = UNSET
        elif isinstance(self.deleted_at, datetime.datetime):
            deleted_at = self.deleted_at.isoformat()
        else:
            deleted_at = self.deleted_at

        deleted_by: None | str | Unset
        if isinstance(self.deleted_by, Unset):
            deleted_by = UNSET
        elif isinstance(self.deleted_by, UUID):
            deleted_by = str(self.deleted_by)
        else:
            deleted_by = self.deleted_by

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

        trigger_node_id: None | str | Unset
        if isinstance(self.trigger_node_id, Unset):
            trigger_node_id = UNSET
        else:
            trigger_node_id = self.trigger_node_id

        workflow_definition: dict[str, Any] | None | Unset
        if isinstance(self.workflow_definition, Unset):
            workflow_definition = UNSET
        elif isinstance(self.workflow_definition, ExecutionReadWorkflowDefinitionType0):
            workflow_definition = self.workflow_definition.to_dict()
        else:
            workflow_definition = self.workflow_definition

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "completed_at": completed_at,
                "created_at": created_at,
                "created_by": created_by,
                "error_details": error_details,
                "id": id,
                "input_data": input_data,
                "status": status,
                "temporal_workflow_id": temporal_workflow_id,
                "updated_at": updated_at,
                "updated_by": updated_by,
                "workflow_id": workflow_id,
                "workflow_version_id": workflow_version_id,
            }
        )
        if activities is not UNSET:
            field_dict["activities"] = activities
        if current_activities is not UNSET:
            field_dict["current_activities"] = current_activities
        if deleted_at is not UNSET:
            field_dict["deleted_at"] = deleted_at
        if deleted_by is not UNSET:
            field_dict["deleted_by"] = deleted_by
        if labels is not UNSET:
            field_dict["labels"] = labels
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if trigger_node_id is not UNSET:
            field_dict["trigger_node_id"] = trigger_node_id
        if workflow_definition is not UNSET:
            field_dict["workflow_definition"] = workflow_definition

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.activity_data import ActivityData
        from ..models.current_activity import CurrentActivity
        from ..models.execution_read_input_data import ExecutionReadInputData
        from ..models.execution_read_labels import ExecutionReadLabels
        from ..models.execution_read_workflow_definition_type_0 import ExecutionReadWorkflowDefinitionType0

        d = dict(src_dict)

        def _parse_completed_at(data: object) -> datetime.datetime | None:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                completed_at_type_0 = isoparse(data)

                return completed_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None, data)

        completed_at = _parse_completed_at(d.pop("completed_at"))

        created_at = isoparse(d.pop("created_at"))

        created_by = UUID(d.pop("created_by"))

        def _parse_error_details(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        error_details = _parse_error_details(d.pop("error_details"))

        id = UUID(d.pop("id"))

        input_data = ExecutionReadInputData.from_dict(d.pop("input_data"))

        status = ExecutionStatus(d.pop("status"))

        temporal_workflow_id = d.pop("temporal_workflow_id")

        updated_at = isoparse(d.pop("updated_at"))

        def _parse_updated_by(data: object) -> None | UUID:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_by_type_0 = UUID(data)

                return updated_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UUID, data)

        updated_by = _parse_updated_by(d.pop("updated_by"))

        workflow_id = UUID(d.pop("workflow_id"))

        workflow_version_id = UUID(d.pop("workflow_version_id"))

        def _parse_activities(data: object) -> list[ActivityData] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                activities_type_0 = []
                _activities_type_0 = data
                for activities_type_0_item_data in _activities_type_0:
                    activities_type_0_item = ActivityData.from_dict(activities_type_0_item_data)

                    activities_type_0.append(activities_type_0_item)

                return activities_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[ActivityData] | None | Unset, data)

        activities = _parse_activities(d.pop("activities", UNSET))

        _current_activities = d.pop("current_activities", UNSET)
        current_activities: list[CurrentActivity] | Unset = UNSET
        if _current_activities is not UNSET:
            current_activities = []
            for current_activities_item_data in _current_activities:
                current_activities_item = CurrentActivity.from_dict(current_activities_item_data)

                current_activities.append(current_activities_item)

        def _parse_deleted_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                deleted_at_type_0 = isoparse(data)

                return deleted_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        deleted_at = _parse_deleted_at(d.pop("deleted_at", UNSET))

        def _parse_deleted_by(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                deleted_by_type_0 = UUID(data)

                return deleted_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        deleted_by = _parse_deleted_by(d.pop("deleted_by", UNSET))

        _labels = d.pop("labels", UNSET)
        labels: ExecutionReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = ExecutionReadLabels.from_dict(_labels)

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

        def _parse_trigger_node_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        trigger_node_id = _parse_trigger_node_id(d.pop("trigger_node_id", UNSET))

        def _parse_workflow_definition(data: object) -> ExecutionReadWorkflowDefinitionType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                workflow_definition_type_0 = ExecutionReadWorkflowDefinitionType0.from_dict(data)

                return workflow_definition_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(ExecutionReadWorkflowDefinitionType0 | None | Unset, data)

        workflow_definition = _parse_workflow_definition(d.pop("workflow_definition", UNSET))

        execution_read = cls(
            completed_at=completed_at,
            created_at=created_at,
            created_by=created_by,
            error_details=error_details,
            id=id,
            input_data=input_data,
            status=status,
            temporal_workflow_id=temporal_workflow_id,
            updated_at=updated_at,
            updated_by=updated_by,
            workflow_id=workflow_id,
            workflow_version_id=workflow_version_id,
            activities=activities,
            current_activities=current_activities,
            deleted_at=deleted_at,
            deleted_by=deleted_by,
            labels=labels,
            project_id=project_id,
            trigger_node_id=trigger_node_id,
            workflow_definition=workflow_definition,
        )

        execution_read.additional_properties = d
        return execution_read

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
