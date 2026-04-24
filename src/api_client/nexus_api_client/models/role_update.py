from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.role_update_labels_type_0 import RoleUpdateLabelsType0


T = TypeVar("T", bound="RoleUpdate")


@_attrs_define
class RoleUpdate:
    """Request body for updating a role (partial).

    Attributes:
        name (None | str | Unset):
        description (None | str | Unset):
        policies (list[str] | None | Unset):
        labels (None | RoleUpdateLabelsType0 | Unset):
    """

    name: None | str | Unset = UNSET
    description: None | str | Unset = UNSET
    policies: list[str] | None | Unset = UNSET
    labels: None | RoleUpdateLabelsType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.role_update_labels_type_0 import RoleUpdateLabelsType0

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

        policies: list[str] | None | Unset
        if isinstance(self.policies, Unset):
            policies = UNSET
        elif isinstance(self.policies, list):
            policies = self.policies

        else:
            policies = self.policies

        labels: dict[str, Any] | None | Unset
        if isinstance(self.labels, Unset):
            labels = UNSET
        elif isinstance(self.labels, RoleUpdateLabelsType0):
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
        if policies is not UNSET:
            field_dict["policies"] = policies
        if labels is not UNSET:
            field_dict["labels"] = labels

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.role_update_labels_type_0 import RoleUpdateLabelsType0

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

        def _parse_policies(data: object) -> list[str] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                policies_type_0 = cast(list[str], data)

                return policies_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[str] | None | Unset, data)

        policies = _parse_policies(d.pop("policies", UNSET))

        def _parse_labels(data: object) -> None | RoleUpdateLabelsType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                labels_type_0 = RoleUpdateLabelsType0.from_dict(data)

                return labels_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | RoleUpdateLabelsType0 | Unset, data)

        labels = _parse_labels(d.pop("labels", UNSET))

        role_update = cls(
            name=name,
            description=description,
            policies=policies,
            labels=labels,
        )

        role_update.additional_properties = d
        return role_update

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
