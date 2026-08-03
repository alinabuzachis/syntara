from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.policy_create_labels import PolicyCreateLabels
    from ..models.policy_statement_schema import PolicyStatementSchema


T = TypeVar("T", bound="PolicyCreate")


@_attrs_define
class PolicyCreate:
    """Request body for creating a policy.

    Attributes:
        name (str):
        statements (list[PolicyStatementSchema]):
        description (None | str | Unset):
        labels (PolicyCreateLabels | Unset):
        project_id (None | Unset | UUID):
    """

    name: str
    statements: list[PolicyStatementSchema]
    description: None | str | Unset = UNSET
    labels: PolicyCreateLabels | Unset = UNSET
    project_id: None | Unset | UUID = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        statements = []
        for statements_item_data in self.statements:
            statements_item = statements_item_data.to_dict()
            statements.append(statements_item)

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

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

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
                "statements": statements,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if labels is not UNSET:
            field_dict["labels"] = labels
        if project_id is not UNSET:
            field_dict["project_id"] = project_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.policy_create_labels import PolicyCreateLabels
        from ..models.policy_statement_schema import PolicyStatementSchema

        d = dict(src_dict)
        name = d.pop("name")

        statements = []
        _statements = d.pop("statements")
        for statements_item_data in _statements:
            statements_item = PolicyStatementSchema.from_dict(statements_item_data)

            statements.append(statements_item)

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        _labels = d.pop("labels", UNSET)
        labels: PolicyCreateLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = PolicyCreateLabels.from_dict(_labels)

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

        policy_create = cls(
            name=name,
            statements=statements,
            description=description,
            labels=labels,
            project_id=project_id,
        )

        policy_create.additional_properties = d
        return policy_create

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
