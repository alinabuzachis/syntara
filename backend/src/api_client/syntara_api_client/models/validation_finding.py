from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..models.validation_category import ValidationCategory
from ..models.validation_severity import ValidationSeverity
from ..types import UNSET, Unset

T = TypeVar("T", bound="ValidationFinding")


@_attrs_define
class ValidationFinding:
    """A single structured validation finding.

    Attributes:
        severity: error or warning
        category: Machine-readable classification
        message: Human-readable description
        node_id: Related node ID, null for workflow-level issues
        field_path: Path within node config (e.g., ``config.url``)

        Attributes:
            severity (ValidationSeverity): Severity level for a validation finding.
            category (ValidationCategory): Machine-readable classification for a validation finding.
            message (str):
            node_id (None | str | Unset):
            field_path (None | str | Unset):
    """

    severity: ValidationSeverity
    category: ValidationCategory
    message: str
    node_id: None | str | Unset = UNSET
    field_path: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        severity = self.severity.value

        category = self.category.value

        message = self.message

        node_id: None | str | Unset
        if isinstance(self.node_id, Unset):
            node_id = UNSET
        else:
            node_id = self.node_id

        field_path: None | str | Unset
        if isinstance(self.field_path, Unset):
            field_path = UNSET
        else:
            field_path = self.field_path

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "severity": severity,
                "category": category,
                "message": message,
            }
        )
        if node_id is not UNSET:
            field_dict["node_id"] = node_id
        if field_path is not UNSET:
            field_dict["field_path"] = field_path

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        severity = ValidationSeverity(d.pop("severity"))

        category = ValidationCategory(d.pop("category"))

        message = d.pop("message")

        def _parse_node_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        node_id = _parse_node_id(d.pop("node_id", UNSET))

        def _parse_field_path(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        field_path = _parse_field_path(d.pop("field_path", UNSET))

        validation_finding = cls(
            severity=severity,
            category=category,
            message=message,
            node_id=node_id,
            field_path=field_path,
        )

        return validation_finding
