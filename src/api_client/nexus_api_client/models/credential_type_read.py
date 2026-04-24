from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.credential_type_read_injectors import CredentialTypeReadInjectors
    from ..models.credential_type_read_inputs import CredentialTypeReadInputs
    from ..models.credential_type_read_labels import CredentialTypeReadLabels


T = TypeVar("T", bound="CredentialTypeRead")


@_attrs_define
class CredentialTypeRead:
    """Read schema for credential type API responses.

    Attributes:
        name (str):
        id (UUID | Unset): Unique identifier for the resource Example: 550e8400-e29b-41d4-a716-446655440000.
        created_at (datetime.datetime | Unset): Timestamp when resource was created Example: 2025-10-09T12:00:00Z.
        updated_at (datetime.datetime | Unset): Timestamp when resource was last updated Example: 2025-10-09T12:30:00Z.
        labels (CredentialTypeReadLabels | Unset): Key-value pairs for resource labeling and filtering Example:
            {'environment': 'production', 'region': 'us-east-1', 'team': 'platform'}.
        description (None | str | Unset):
        credential_count (int | Unset): Number of credentials using this type Default: 0.
        injectors (CredentialTypeReadInjectors | Unset):
        inputs (CredentialTypeReadInputs | Unset):
        managed (bool | Unset):  Default: False.
    """

    name: str
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: CredentialTypeReadLabels | Unset = UNSET
    description: None | str | Unset = UNSET
    credential_count: int | Unset = 0
    injectors: CredentialTypeReadInjectors | Unset = UNSET
    inputs: CredentialTypeReadInputs | Unset = UNSET
    managed: bool | Unset = False

    def to_dict(self) -> dict[str, Any]:
        name = self.name

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

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        credential_count = self.credential_count

        injectors: dict[str, Any] | Unset = UNSET
        if not isinstance(self.injectors, Unset):
            injectors = self.injectors.to_dict()

        inputs: dict[str, Any] | Unset = UNSET
        if not isinstance(self.inputs, Unset):
            inputs = self.inputs.to_dict()

        managed = self.managed

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "name": name,
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
        if description is not UNSET:
            field_dict["description"] = description
        if credential_count is not UNSET:
            field_dict["credential_count"] = credential_count
        if injectors is not UNSET:
            field_dict["injectors"] = injectors
        if inputs is not UNSET:
            field_dict["inputs"] = inputs
        if managed is not UNSET:
            field_dict["managed"] = managed

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.credential_type_read_injectors import CredentialTypeReadInjectors
        from ..models.credential_type_read_inputs import CredentialTypeReadInputs
        from ..models.credential_type_read_labels import CredentialTypeReadLabels

        d = dict(src_dict)
        name = d.pop("name")

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
        labels: CredentialTypeReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = CredentialTypeReadLabels.from_dict(_labels)

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        credential_count = d.pop("credential_count", UNSET)

        _injectors = d.pop("injectors", UNSET)
        injectors: CredentialTypeReadInjectors | Unset
        if isinstance(_injectors, Unset):
            injectors = UNSET
        else:
            injectors = CredentialTypeReadInjectors.from_dict(_injectors)

        _inputs = d.pop("inputs", UNSET)
        inputs: CredentialTypeReadInputs | Unset
        if isinstance(_inputs, Unset):
            inputs = UNSET
        else:
            inputs = CredentialTypeReadInputs.from_dict(_inputs)

        managed = d.pop("managed", UNSET)

        credential_type_read = cls(
            name=name,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            description=description,
            credential_count=credential_count,
            injectors=injectors,
            inputs=inputs,
            managed=managed,
        )

        return credential_type_read
