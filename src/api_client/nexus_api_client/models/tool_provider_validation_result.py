from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="ToolProviderValidationResult")


@_attrs_define
class ToolProviderValidationResult:
    """Result of validating a connection to a tool provider.

    Attributes:
        valid: Whether the connection validation was successful
        provider_type: The type of provider that was validated
        validated_at: Timestamp when validation was performed
        error: Optional error message if validation failed

        Attributes:
            valid (bool):
            provider_type (str):
            validated_at (datetime.datetime):
            error (None | str | Unset):
    """

    valid: bool
    provider_type: str
    validated_at: datetime.datetime
    error: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        valid = self.valid

        provider_type = self.provider_type

        validated_at = self.validated_at.isoformat()

        error: None | str | Unset
        if isinstance(self.error, Unset):
            error = UNSET
        else:
            error = self.error

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "valid": valid,
                "provider_type": provider_type,
                "validated_at": validated_at,
            }
        )
        if error is not UNSET:
            field_dict["error"] = error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        valid = d.pop("valid")

        provider_type = d.pop("provider_type")

        validated_at = isoparse(d.pop("validated_at"))

        def _parse_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        error = _parse_error(d.pop("error", UNSET))

        tool_provider_validation_result = cls(
            valid=valid,
            provider_type=provider_type,
            validated_at=validated_at,
            error=error,
        )

        return tool_provider_validation_result
