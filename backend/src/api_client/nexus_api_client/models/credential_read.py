from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.credential_read_inputs import CredentialReadInputs
    from ..models.credential_read_labels import CredentialReadLabels
    from ..models.user_reference import UserReference


T = TypeVar("T", bound="CredentialRead")


@_attrs_define
class CredentialRead:
    """Schema for credential API responses. Secret fields masked as $encrypted$.

    Attributes:
        created_by (None | UserReference): User who created the credential Example:
            770e8400-e29b-41d4-a716-446655440000.
        name (str): Human-readable name for the resource Example: Authentication Service.
        credential_type_id (UUID):
        project_id (UUID):
        id (UUID | Unset): Unique identifier for the resource Example: 550e8400-e29b-41d4-a716-446655440000.
        created_at (datetime.datetime | Unset): Timestamp when resource was created Example: 2025-10-09T12:00:00Z.
        updated_at (datetime.datetime | Unset): Timestamp when resource was last updated Example: 2025-10-09T12:30:00Z.
        labels (CredentialReadLabels | Unset): Key-value pairs for resource labeling and filtering Example:
            {'environment': 'production', 'region': 'us-east-1', 'team': 'platform'}.
        updated_by (None | Unset | UserReference): User who last modified the credential Example:
            880e8400-e29b-41d4-a716-446655440000.
        description (None | str | Unset): Detailed description of the resource Example: Handles user authentication and
            authorization workflows.
        enabled (bool | Unset):  Default: True.
        inputs (CredentialReadInputs | Unset):
        workflow_count (int | Unset): Number of workflows referencing this credential Default: 0.
    """

    created_by: None | UserReference
    name: str
    credential_type_id: UUID
    project_id: UUID
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: CredentialReadLabels | Unset = UNSET
    updated_by: None | Unset | UserReference = UNSET
    description: None | str | Unset = UNSET
    enabled: bool | Unset = True
    inputs: CredentialReadInputs | Unset = UNSET
    workflow_count: int | Unset = 0

    def to_dict(self) -> dict[str, Any]:
        from ..models.user_reference import UserReference

        created_by: dict[str, Any] | None
        if isinstance(self.created_by, UserReference):
            created_by = self.created_by.to_dict()
        else:
            created_by = self.created_by

        name = self.name

        credential_type_id = str(self.credential_type_id)

        project_id = str(self.project_id)

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

        updated_by: dict[str, Any] | None | Unset
        if isinstance(self.updated_by, Unset):
            updated_by = UNSET
        elif isinstance(self.updated_by, UserReference):
            updated_by = self.updated_by.to_dict()
        else:
            updated_by = self.updated_by

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        enabled = self.enabled

        inputs: dict[str, Any] | Unset = UNSET
        if not isinstance(self.inputs, Unset):
            inputs = self.inputs.to_dict()

        workflow_count = self.workflow_count

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "created_by": created_by,
                "name": name,
                "credential_type_id": credential_type_id,
                "project_id": project_id,
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
        if description is not UNSET:
            field_dict["description"] = description
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if inputs is not UNSET:
            field_dict["inputs"] = inputs
        if workflow_count is not UNSET:
            field_dict["workflow_count"] = workflow_count

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.credential_read_inputs import CredentialReadInputs
        from ..models.credential_read_labels import CredentialReadLabels
        from ..models.user_reference import UserReference

        d = dict(src_dict)

        def _parse_created_by(data: object) -> None | UserReference:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                created_by_type_0 = UserReference.from_dict(data)

                return created_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | UserReference, data)

        created_by = _parse_created_by(d.pop("created_by"))

        name = d.pop("name")

        credential_type_id = UUID(d.pop("credential_type_id"))

        project_id = UUID(d.pop("project_id"))

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
        labels: CredentialReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = CredentialReadLabels.from_dict(_labels)

        def _parse_updated_by(data: object) -> None | Unset | UserReference:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                updated_by_type_0 = UserReference.from_dict(data)

                return updated_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UserReference, data)

        updated_by = _parse_updated_by(d.pop("updated_by", UNSET))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        enabled = d.pop("enabled", UNSET)

        _inputs = d.pop("inputs", UNSET)
        inputs: CredentialReadInputs | Unset
        if isinstance(_inputs, Unset):
            inputs = UNSET
        else:
            inputs = CredentialReadInputs.from_dict(_inputs)

        workflow_count = d.pop("workflow_count", UNSET)

        credential_read = cls(
            created_by=created_by,
            name=name,
            credential_type_id=credential_type_id,
            project_id=project_id,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            updated_by=updated_by,
            description=description,
            enabled=enabled,
            inputs=inputs,
            workflow_count=workflow_count,
        )

        return credential_read
