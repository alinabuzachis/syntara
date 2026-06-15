from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.validation_issue import ValidationIssue


T = TypeVar("T", bound="WorkflowValidationResult")


@_attrs_define
class WorkflowValidationResult:
    """Result of validating a workflow definition.

    Attributes:
        valid: True when no errors were found (warnings don't block)
        errors: Issues that prevent the workflow from being enabled
        warnings: Informational issues that don't block enabling

        Attributes:
            valid (bool):
            errors (list[ValidationIssue] | Unset):
            warnings (list[ValidationIssue] | Unset):
    """

    valid: bool
    errors: list[ValidationIssue] | Unset = UNSET
    warnings: list[ValidationIssue] | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        valid = self.valid

        errors: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.errors, Unset):
            errors = []
            for errors_item_data in self.errors:
                errors_item = errors_item_data.to_dict()
                errors.append(errors_item)

        warnings: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.warnings, Unset):
            warnings = []
            for warnings_item_data in self.warnings:
                warnings_item = warnings_item_data.to_dict()
                warnings.append(warnings_item)

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "valid": valid,
            }
        )
        if errors is not UNSET:
            field_dict["errors"] = errors
        if warnings is not UNSET:
            field_dict["warnings"] = warnings

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.validation_issue import ValidationIssue

        d = dict(src_dict)
        valid = d.pop("valid")

        _errors = d.pop("errors", UNSET)
        errors: list[ValidationIssue] | Unset = UNSET
        if _errors is not UNSET:
            errors = []
            for errors_item_data in _errors:
                errors_item = ValidationIssue.from_dict(errors_item_data)

                errors.append(errors_item)

        _warnings = d.pop("warnings", UNSET)
        warnings: list[ValidationIssue] | Unset = UNSET
        if _warnings is not UNSET:
            warnings = []
            for warnings_item_data in _warnings:
                warnings_item = ValidationIssue.from_dict(warnings_item_data)

                warnings.append(warnings_item)

        workflow_validation_result = cls(
            valid=valid,
            errors=errors,
            warnings=warnings,
        )

        return workflow_validation_result
