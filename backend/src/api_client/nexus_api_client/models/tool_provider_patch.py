from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define

from ..models.provider_status import ProviderStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.mcp_configuration import MCPConfiguration


T = TypeVar("T", bound="ToolProviderPatch")


@_attrs_define
class ToolProviderPatch:
    """ToolProviderPatch model for partially updating tool providers.

    All fields are optional to support.
    This model is used for API PATCH requests when updating existing tool providers.

    Attributes:
        name: Optional human-readable name (1-255 chars)
        description: Optional detailed description (max 2000 chars)
        configuration: Optional provider-specific configuration
        enabled: Optional enable/disable flag
        status: Optional provider status
        validation_error: Optional error message from validation attempts

        Attributes:
            name (None | str | Unset): Human-readable name for the provider
            description (None | str | Unset): Detailed description of the provider
            configuration (MCPConfiguration | None | Unset): Provider-specific configuration
            enabled (bool | None | Unset): Enable/disable the provider
            status (None | ProviderStatus | Unset): Current status of the provider
            validation_error (None | str | Unset): Error message from last validation attempt
    """

    name: None | str | Unset = UNSET
    description: None | str | Unset = UNSET
    configuration: MCPConfiguration | None | Unset = UNSET
    enabled: bool | None | Unset = UNSET
    status: None | ProviderStatus | Unset = UNSET
    validation_error: None | str | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.mcp_configuration import MCPConfiguration

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

        configuration: dict[str, Any] | None | Unset
        if isinstance(self.configuration, Unset):
            configuration = UNSET
        elif isinstance(self.configuration, MCPConfiguration):
            configuration = self.configuration.to_dict()
        else:
            configuration = self.configuration

        enabled: bool | None | Unset
        if isinstance(self.enabled, Unset):
            enabled = UNSET
        else:
            enabled = self.enabled

        status: None | str | Unset
        if isinstance(self.status, Unset):
            status = UNSET
        elif isinstance(self.status, ProviderStatus):
            status = self.status.value
        else:
            status = self.status

        validation_error: None | str | Unset
        if isinstance(self.validation_error, Unset):
            validation_error = UNSET
        else:
            validation_error = self.validation_error

        field_dict: dict[str, Any] = {}

        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if description is not UNSET:
            field_dict["description"] = description
        if configuration is not UNSET:
            field_dict["configuration"] = configuration
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if status is not UNSET:
            field_dict["status"] = status
        if validation_error is not UNSET:
            field_dict["validation_error"] = validation_error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.mcp_configuration import MCPConfiguration

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

        def _parse_configuration(data: object) -> MCPConfiguration | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                configuration_type_0 = MCPConfiguration.from_dict(data)

                return configuration_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(MCPConfiguration | None | Unset, data)

        configuration = _parse_configuration(d.pop("configuration", UNSET))

        def _parse_enabled(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        enabled = _parse_enabled(d.pop("enabled", UNSET))

        def _parse_status(data: object) -> None | ProviderStatus | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                status_type_0 = ProviderStatus(data)

                return status_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | ProviderStatus | Unset, data)

        status = _parse_status(d.pop("status", UNSET))

        def _parse_validation_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        validation_error = _parse_validation_error(d.pop("validation_error", UNSET))

        tool_provider_patch = cls(
            name=name,
            description=description,
            configuration=configuration,
            enabled=enabled,
            status=status,
            validation_error=validation_error,
        )

        return tool_provider_patch
