from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.invocation_status import InvocationStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.invocation_checkpoint_data_type_0 import InvocationCheckpointDataType0
    from ..models.invocation_context_data import InvocationContextData
    from ..models.invocation_labels import InvocationLabels
    from ..models.invocation_result_type_0 import InvocationResultType0


T = TypeVar("T", bound="Invocation")


@_attrs_define
class Invocation:
    """SQLModel for async workflow invocations.

    Attributes:
        id: Primary key UUID (inherited from BaseResource)
        created_at: Timestamp when invocation was created
            (inherited from BaseResource)
        updated_at: Timestamp of last update (inherited from BaseResource)
        created_by: UUID of user who created the invocation
            (inherited from UserOwnedResource)
        updated_by: UUID of user who last updated the invocation
            (inherited from UserOwnedResource)
        labels: Optional key-value metadata (inherited from BaseResource)
        prompt: Natural language user request
        session_id: Session identifier for multi-tenant isolation
        status: Current invocation status (running, paused, cancelled, completed, failed)
        started_at: Timestamp when workflow execution started
        completed_at: Timestamp when workflow completed
        context_data: Additional context for the request
        result: Workflow result data
        error_message: Error message if invocation failed
        checkpoint_data: Checkpoint data for pause/resume

        Attributes:
            created_by (UUID): User who created the resource
            prompt (str): Natural language user request
            session_id (str): Session identifier for multi-tenant isolation
            id (UUID | Unset): Unique identifier for the resource
            created_at (datetime.datetime | Unset): Timestamp when resource was created
            updated_at (datetime.datetime | Unset): Timestamp when resource was last updated
            labels (InvocationLabels | Unset): Key-value pairs for resource labeling and filtering
            updated_by (None | Unset | UUID): User who last updated the resource
            status (InvocationStatus | Unset): Status enum for invocation lifecycle.
            started_at (datetime.datetime | None | Unset): Timestamp when workflow execution started
            completed_at (datetime.datetime | None | Unset): Timestamp when workflow completed
            context_data (InvocationContextData | Unset): Additional context for the request, including file_ids array if
                files uploaded
            result (InvocationResultType0 | None | Unset): Workflow result data
            checkpoint_data (InvocationCheckpointDataType0 | None | Unset): Checkpoint data for pause/resume
            error_message (None | str | Unset): Error message if invocation failed
    """

    created_by: UUID
    prompt: str
    session_id: str
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: InvocationLabels | Unset = UNSET
    updated_by: None | Unset | UUID = UNSET
    status: InvocationStatus | Unset = UNSET
    started_at: datetime.datetime | None | Unset = UNSET
    completed_at: datetime.datetime | None | Unset = UNSET
    context_data: InvocationContextData | Unset = UNSET
    result: InvocationResultType0 | None | Unset = UNSET
    checkpoint_data: InvocationCheckpointDataType0 | None | Unset = UNSET
    error_message: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.invocation_checkpoint_data_type_0 import InvocationCheckpointDataType0
        from ..models.invocation_result_type_0 import InvocationResultType0

        created_by = str(self.created_by)

        prompt = self.prompt

        session_id = self.session_id

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

        updated_by: None | str | Unset
        if isinstance(self.updated_by, Unset):
            updated_by = UNSET
        elif isinstance(self.updated_by, UUID):
            updated_by = str(self.updated_by)
        else:
            updated_by = self.updated_by

        status: str | Unset = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        started_at: None | str | Unset
        if isinstance(self.started_at, Unset):
            started_at = UNSET
        elif isinstance(self.started_at, datetime.datetime):
            started_at = self.started_at.isoformat()
        else:
            started_at = self.started_at

        completed_at: None | str | Unset
        if isinstance(self.completed_at, Unset):
            completed_at = UNSET
        elif isinstance(self.completed_at, datetime.datetime):
            completed_at = self.completed_at.isoformat()
        else:
            completed_at = self.completed_at

        context_data: dict[str, Any] | Unset = UNSET
        if not isinstance(self.context_data, Unset):
            context_data = self.context_data.to_dict()

        result: dict[str, Any] | None | Unset
        if isinstance(self.result, Unset):
            result = UNSET
        elif isinstance(self.result, InvocationResultType0):
            result = self.result.to_dict()
        else:
            result = self.result

        checkpoint_data: dict[str, Any] | None | Unset
        if isinstance(self.checkpoint_data, Unset):
            checkpoint_data = UNSET
        elif isinstance(self.checkpoint_data, InvocationCheckpointDataType0):
            checkpoint_data = self.checkpoint_data.to_dict()
        else:
            checkpoint_data = self.checkpoint_data

        error_message: None | str | Unset
        if isinstance(self.error_message, Unset):
            error_message = UNSET
        else:
            error_message = self.error_message

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "created_by": created_by,
                "prompt": prompt,
                "session_id": session_id,
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
        if updated_by is not UNSET:
            field_dict["updated_by"] = updated_by
        if status is not UNSET:
            field_dict["status"] = status
        if started_at is not UNSET:
            field_dict["started_at"] = started_at
        if completed_at is not UNSET:
            field_dict["completed_at"] = completed_at
        if context_data is not UNSET:
            field_dict["context_data"] = context_data
        if result is not UNSET:
            field_dict["result"] = result
        if checkpoint_data is not UNSET:
            field_dict["checkpoint_data"] = checkpoint_data
        if error_message is not UNSET:
            field_dict["error_message"] = error_message

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.invocation_checkpoint_data_type_0 import InvocationCheckpointDataType0
        from ..models.invocation_context_data import InvocationContextData
        from ..models.invocation_labels import InvocationLabels
        from ..models.invocation_result_type_0 import InvocationResultType0

        d = dict(src_dict)
        created_by = UUID(d.pop("created_by"))

        prompt = d.pop("prompt")

        session_id = d.pop("session_id")

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
        labels: InvocationLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = InvocationLabels.from_dict(_labels)

        def _parse_updated_by(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_by_type_0 = UUID(data)

                return updated_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        updated_by = _parse_updated_by(d.pop("updated_by", UNSET))

        _status = d.pop("status", UNSET)
        status: InvocationStatus | Unset
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = InvocationStatus(_status)

        def _parse_started_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                started_at_type_0 = isoparse(data)

                return started_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        started_at = _parse_started_at(d.pop("started_at", UNSET))

        def _parse_completed_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                completed_at_type_0 = isoparse(data)

                return completed_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        completed_at = _parse_completed_at(d.pop("completed_at", UNSET))

        _context_data = d.pop("context_data", UNSET)
        context_data: InvocationContextData | Unset
        if isinstance(_context_data, Unset):
            context_data = UNSET
        else:
            context_data = InvocationContextData.from_dict(_context_data)

        def _parse_result(data: object) -> InvocationResultType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                result_type_0 = InvocationResultType0.from_dict(data)

                return result_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(InvocationResultType0 | None | Unset, data)

        result = _parse_result(d.pop("result", UNSET))

        def _parse_checkpoint_data(data: object) -> InvocationCheckpointDataType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                checkpoint_data_type_0 = InvocationCheckpointDataType0.from_dict(data)

                return checkpoint_data_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(InvocationCheckpointDataType0 | None | Unset, data)

        checkpoint_data = _parse_checkpoint_data(d.pop("checkpoint_data", UNSET))

        def _parse_error_message(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error_message = _parse_error_message(d.pop("error_message", UNSET))

        invocation = cls(
            created_by=created_by,
            prompt=prompt,
            session_id=session_id,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            updated_by=updated_by,
            status=status,
            started_at=started_at,
            completed_at=completed_at,
            context_data=context_data,
            result=result,
            checkpoint_data=checkpoint_data,
            error_message=error_message,
        )

        return invocation
