from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define

from ..models.tool_status import ToolStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="ToolUpdate")


@_attrs_define
class ToolUpdate:
    """Model for updating tool configuration.

    Attributes:
        enabled (bool | None | Unset): Whether the tool is enabled
        status (None | ToolStatus | Unset): Current status of the tool
        refresh_error (None | str | Unset): Error message from last refresh attempt
    """

    enabled: bool | None | Unset = UNSET
    status: None | ToolStatus | Unset = UNSET
    refresh_error: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        enabled: bool | None | Unset
        if isinstance(self.enabled, Unset):
            enabled = UNSET
        else:
            enabled = self.enabled

        status: None | str | Unset
        if isinstance(self.status, Unset):
            status = UNSET
        elif isinstance(self.status, ToolStatus):
            status = self.status.value
        else:
            status = self.status

        refresh_error: None | str | Unset
        if isinstance(self.refresh_error, Unset):
            refresh_error = UNSET
        else:
            refresh_error = self.refresh_error

        field_dict: dict[str, Any] = {}

        field_dict.update({})
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if status is not UNSET:
            field_dict["status"] = status
        if refresh_error is not UNSET:
            field_dict["refresh_error"] = refresh_error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)

        def _parse_enabled(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        enabled = _parse_enabled(d.pop("enabled", UNSET))

        def _parse_status(data: object) -> None | ToolStatus | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                status_type_0 = ToolStatus(data)

                return status_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | ToolStatus | Unset, data)

        status = _parse_status(d.pop("status", UNSET))

        def _parse_refresh_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        refresh_error = _parse_refresh_error(d.pop("refresh_error", UNSET))

        tool_update = cls(
            enabled=enabled,
            status=status,
            refresh_error=refresh_error,
        )

        return tool_update
