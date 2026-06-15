from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.workflow_validation_result import WorkflowValidationResult


T = TypeVar("T", bound="WorkflowValidationProblemDetail")


@_attrs_define
class WorkflowValidationProblemDetail:
    """RFC 9457 Problem Details with a validation_result extension.

    Attributes:
        type: URI reference identifying the problem type
        title: Short, human-readable summary of the problem
        detail: Human-readable explanation specific to this occurrence
        code: Machine-readable error code
        retryable: Whether this error can be retried
        instance: Optional URI reference identifying the specific occurrence
        validation_result: Structured validation errors and warnings

        Attributes:
            type_ (str):
            title (str):
            detail (str):
            code (str):
            retryable (bool):
            validation_result (WorkflowValidationResult): Result of validating a workflow definition.

                Attributes:
                    valid: True when no errors were found (warnings don't block)
                    errors: Issues that prevent the workflow from being enabled
                    warnings: Informational issues that don't block enabling
            instance (None | str | Unset):
    """

    type_: str
    title: str
    detail: str
    code: str
    retryable: bool
    validation_result: WorkflowValidationResult
    instance: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_

        title = self.title

        detail = self.detail

        code = self.code

        retryable = self.retryable

        validation_result = self.validation_result.to_dict()

        instance: None | str | Unset
        if isinstance(self.instance, Unset):
            instance = UNSET
        else:
            instance = self.instance

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "type": type_,
                "title": title,
                "detail": detail,
                "code": code,
                "retryable": retryable,
                "validation_result": validation_result,
            }
        )
        if instance is not UNSET:
            field_dict["instance"] = instance

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.workflow_validation_result import WorkflowValidationResult

        d = dict(src_dict)
        type_ = d.pop("type")

        title = d.pop("title")

        detail = d.pop("detail")

        code = d.pop("code")

        retryable = d.pop("retryable")

        validation_result = WorkflowValidationResult.from_dict(d.pop("validation_result"))

        def _parse_instance(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        instance = _parse_instance(d.pop("instance", UNSET))

        workflow_validation_problem_detail = cls(
            type_=type_,
            title=title,
            detail=detail,
            code=code,
            retryable=retryable,
            validation_result=validation_result,
            instance=instance,
        )

        return workflow_validation_problem_detail
