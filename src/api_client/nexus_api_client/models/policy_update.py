from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.policy_statement_schema import PolicyStatementSchema
    from ..models.policy_update_labels_type_0 import PolicyUpdateLabelsType0


T = TypeVar("T", bound="PolicyUpdate")


@_attrs_define
class PolicyUpdate:
    """Request body for updating a policy (partial).

    Attributes:
        name (None | str | Unset):
        description (None | str | Unset):
        statements (list[PolicyStatementSchema] | None | Unset):
        labels (None | PolicyUpdateLabelsType0 | Unset):
    """

    name: None | str | Unset = UNSET
    description: None | str | Unset = UNSET
    statements: list[PolicyStatementSchema] | None | Unset = UNSET
    labels: None | PolicyUpdateLabelsType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.policy_update_labels_type_0 import PolicyUpdateLabelsType0

        name: None | str | Unset
        if isinstance(self.name, Unset):
            name = UNSET
        else:
            name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        statements: list[dict[str, Any]] | None | Unset
        if isinstance(self.statements, Unset):
            statements = UNSET
        elif isinstance(self.statements, list):
            statements = []
            for statements_type_0_item_data in self.statements:
                statements_type_0_item = statements_type_0_item_data.to_dict()
                statements.append(statements_type_0_item)

        else:
            statements = self.statements

        labels: dict[str, Any] | None | Unset
        if isinstance(self.labels, Unset):
            labels = UNSET
        elif isinstance(self.labels, PolicyUpdateLabelsType0):
            labels = self.labels.to_dict()
        else:
            labels = self.labels

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if statements is not UNSET:
            field_dict["statements"] = statements
        if labels is not UNSET:
            field_dict["labels"] = labels

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.policy_statement_schema import PolicyStatementSchema
        from ..models.policy_update_labels_type_0 import PolicyUpdateLabelsType0

        d = dict(src_dict)

        def _parse_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        name = _parse_name(d.pop("name", UNSET))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        def _parse_statements(data: object) -> list[PolicyStatementSchema] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                statements_type_0 = []
                _statements_type_0 = data
                for statements_type_0_item_data in _statements_type_0:
                    statements_type_0_item = PolicyStatementSchema.from_dict(statements_type_0_item_data)

                    statements_type_0.append(statements_type_0_item)

                return statements_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[PolicyStatementSchema] | None | Unset, data)

        statements = _parse_statements(d.pop("statements", UNSET))

        def _parse_labels(data: object) -> None | PolicyUpdateLabelsType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                labels_type_0 = PolicyUpdateLabelsType0.from_dict(data)

                return labels_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | PolicyUpdateLabelsType0 | Unset, data)

        labels = _parse_labels(d.pop("labels", UNSET))

        policy_update = cls(
            name=name,
            description=description,
            statements=statements,
            labels=labels,
        )

        policy_update.additional_properties = d
        return policy_update

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
