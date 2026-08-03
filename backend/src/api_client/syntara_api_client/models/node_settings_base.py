from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="NodeSettingsBase")


@_attrs_define
class NodeSettingsBase:
    """Base node settings — no user-configurable fields."""

    def to_dict(self) -> dict[str, Any]:
        field_dict: dict[str, Any] = {}

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        node_settings_base = cls()

        return node_settings_base
