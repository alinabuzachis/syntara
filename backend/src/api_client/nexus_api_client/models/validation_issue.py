from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="ValidationIssue")


@_attrs_define
class ValidationIssue:
    """A single validation issue found in a workflow definition.

    Attributes:
        message: Human-readable description of the issue
        node_id: ID of the node/trigger related to this issue, if applicable

        Attributes:
            message (str):
            node_id (None | str | Unset):
    """

    message: str
    node_id: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        message = self.message

        node_id: None | str | Unset
        if isinstance(self.node_id, Unset):
            node_id = UNSET
        else:
            node_id = self.node_id

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "message": message,
            }
        )
        if node_id is not UNSET:
            field_dict["node_id"] = node_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        message = d.pop("message")

        def _parse_node_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        node_id = _parse_node_id(d.pop("node_id", UNSET))

        validation_issue = cls(
            message=message,
            node_id=node_id,
        )

        return validation_issue
