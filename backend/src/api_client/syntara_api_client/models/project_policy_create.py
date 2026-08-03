from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.policy_statement_schema import PolicyStatementSchema
    from ..models.project_policy_create_labels import ProjectPolicyCreateLabels


T = TypeVar("T", bound="ProjectPolicyCreate")


@_attrs_define
class ProjectPolicyCreate:
    """Request body for creating a project-scoped policy (project_id comes from URL path).

    Attributes:
        name (str):
        statements (list[PolicyStatementSchema]):
        description (None | str | Unset):
        labels (ProjectPolicyCreateLabels | Unset):
    """

    name: str
    statements: list[PolicyStatementSchema]
    description: None | str | Unset = UNSET
    labels: ProjectPolicyCreateLabels | Unset = UNSET
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

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.policy_statement_schema import PolicyStatementSchema
        from ..models.project_policy_create_labels import ProjectPolicyCreateLabels

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
        labels: ProjectPolicyCreateLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = ProjectPolicyCreateLabels.from_dict(_labels)

        project_policy_create = cls(
            name=name,
            statements=statements,
            description=description,
            labels=labels,
        )

        project_policy_create.additional_properties = d
        return project_policy_create

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
