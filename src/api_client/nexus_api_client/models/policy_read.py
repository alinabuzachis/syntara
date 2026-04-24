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
    from ..models.policy_read_labels import PolicyReadLabels
    from ..models.policy_read_statements_item import PolicyReadStatementsItem


T = TypeVar("T", bound="PolicyRead")


@_attrs_define
class PolicyRead:
    """Response body for a policy.

    Attributes:
        id (UUID):
        name (str):
        is_system_scoped (bool): True when the policy is not scoped to a specific project.
        description (None | str | Unset):
        statements (list[PolicyReadStatementsItem] | Unset):
        is_builtin (bool | Unset):  Default: False.
        is_project_eligible (bool | Unset):  Default: False.
        project_id (None | Unset | UUID):
        scope (str | Unset):  Default: 'any'.
        labels (PolicyReadLabels | Unset):
        created_at (datetime.datetime | None | Unset):
        updated_at (datetime.datetime | None | Unset):
    """

    id: UUID
    name: str
    is_system_scoped: bool
    description: None | str | Unset = UNSET
    statements: list[PolicyReadStatementsItem] | Unset = UNSET
    is_builtin: bool | Unset = False
    is_project_eligible: bool | Unset = False
    project_id: None | Unset | UUID = UNSET
    scope: str | Unset = "any"
    labels: PolicyReadLabels | Unset = UNSET
    created_at: datetime.datetime | None | Unset = UNSET
    updated_at: datetime.datetime | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = str(self.id)

        name = self.name

        is_system_scoped = self.is_system_scoped

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        statements: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.statements, Unset):
            statements = []
            for statements_item_data in self.statements:
                statements_item = statements_item_data.to_dict()
                statements.append(statements_item)

        is_builtin = self.is_builtin

        is_project_eligible = self.is_project_eligible

        project_id: None | str | Unset
        if isinstance(self.project_id, Unset):
            project_id = UNSET
        elif isinstance(self.project_id, UUID):
            project_id = str(self.project_id)
        else:
            project_id = self.project_id

        scope = self.scope

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        created_at: None | str | Unset
        if isinstance(self.created_at, Unset):
            created_at = UNSET
        elif isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: None | str | Unset
        if isinstance(self.updated_at, Unset):
            updated_at = UNSET
        elif isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
                "is_system_scoped": is_system_scoped,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if statements is not UNSET:
            field_dict["statements"] = statements
        if is_builtin is not UNSET:
            field_dict["is_builtin"] = is_builtin
        if is_project_eligible is not UNSET:
            field_dict["is_project_eligible"] = is_project_eligible
        if project_id is not UNSET:
            field_dict["project_id"] = project_id
        if scope is not UNSET:
            field_dict["scope"] = scope
        if labels is not UNSET:
            field_dict["labels"] = labels
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.policy_read_labels import PolicyReadLabels
        from ..models.policy_read_statements_item import PolicyReadStatementsItem

        d = dict(src_dict)
        id = UUID(d.pop("id"))

        name = d.pop("name")

        is_system_scoped = d.pop("is_system_scoped")

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        _statements = d.pop("statements", UNSET)
        statements: list[PolicyReadStatementsItem] | Unset = UNSET
        if _statements is not UNSET:
            statements = []
            for statements_item_data in _statements:
                statements_item = PolicyReadStatementsItem.from_dict(statements_item_data)

                statements.append(statements_item)

        is_builtin = d.pop("is_builtin", UNSET)

        is_project_eligible = d.pop("is_project_eligible", UNSET)

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

        scope = d.pop("scope", UNSET)

        _labels = d.pop("labels", UNSET)
        labels: PolicyReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = PolicyReadLabels.from_dict(_labels)

        def _parse_created_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_0 = isoparse(data)

                return created_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        created_at = _parse_created_at(d.pop("created_at", UNSET))

        def _parse_updated_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_0 = isoparse(data)

                return updated_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        updated_at = _parse_updated_at(d.pop("updated_at", UNSET))

        policy_read = cls(
            id=id,
            name=name,
            is_system_scoped=is_system_scoped,
            description=description,
            statements=statements,
            is_builtin=is_builtin,
            is_project_eligible=is_project_eligible,
            project_id=project_id,
            scope=scope,
            labels=labels,
            created_at=created_at,
            updated_at=updated_at,
        )

        policy_read.additional_properties = d
        return policy_read

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
