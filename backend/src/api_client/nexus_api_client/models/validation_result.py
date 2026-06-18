from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.validation_finding import ValidationFinding


T = TypeVar("T", bound="ValidationResult")


@_attrs_define
class ValidationResult:
    """Structured validation result with flat findings list and computed counts.

    Attributes:
        is_valid: True when error_count == 0
        error_count: Count of error-severity findings
        warning_count: Count of warning-severity findings
        findings: All findings, errors first

        Attributes:
            is_valid (bool):
            error_count (int):
            warning_count (int):
            findings (list[ValidationFinding] | Unset):
    """

    is_valid: bool
    error_count: int
    warning_count: int
    findings: list[ValidationFinding] | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        is_valid = self.is_valid

        error_count = self.error_count

        warning_count = self.warning_count

        findings: list[dict[str, Any]] | Unset = UNSET
        if not isinstance(self.findings, Unset):
            findings = []
            for findings_item_data in self.findings:
                findings_item = findings_item_data.to_dict()
                findings.append(findings_item)

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "is_valid": is_valid,
                "error_count": error_count,
                "warning_count": warning_count,
            }
        )
        if findings is not UNSET:
            field_dict["findings"] = findings

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.validation_finding import ValidationFinding

        d = dict(src_dict)
        is_valid = d.pop("is_valid")

        error_count = d.pop("error_count")

        warning_count = d.pop("warning_count")

        _findings = d.pop("findings", UNSET)
        findings: list[ValidationFinding] | Unset = UNSET
        if _findings is not UNSET:
            findings = []
            for findings_item_data in _findings:
                findings_item = ValidationFinding.from_dict(findings_item_data)

                findings.append(findings_item)

        validation_result = cls(
            is_valid=is_valid,
            error_count=error_count,
            warning_count=warning_count,
            findings=findings,
        )

        return validation_result
