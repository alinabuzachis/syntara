from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="PermissionEntry")


@_attrs_define
class PermissionEntry:
    """A single permission from a policy statement.

    Attributes:
        policy_name (str):
        effect (str):
        actions (list[str]):
        scope (str):
        project (str | Unset): Project scope (empty for system-level) Default: ''.
    """

    policy_name: str
    effect: str
    actions: list[str]
    scope: str
    project: str | Unset = ""
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        policy_name = self.policy_name

        effect = self.effect

        actions = self.actions

        scope = self.scope

        project = self.project

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "policy_name": policy_name,
                "effect": effect,
                "actions": actions,
                "scope": scope,
            }
        )
        if project is not UNSET:
            field_dict["project"] = project

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        policy_name = d.pop("policy_name")

        effect = d.pop("effect")

        actions = cast(list[str], d.pop("actions"))

        scope = d.pop("scope")

        project = d.pop("project", UNSET)

        permission_entry = cls(
            policy_name=policy_name,
            effect=effect,
            actions=actions,
            scope=scope,
            project=project,
        )

        permission_entry.additional_properties = d
        return permission_entry

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
