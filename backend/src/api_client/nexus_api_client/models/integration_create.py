from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.integration_scope import IntegrationScope
from ..models.integration_type import IntegrationType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.aap_gateway_configuration import AAPGatewayConfiguration
    from ..models.integration_create_labels import IntegrationCreateLabels
    from ..models.llm_provider_configuration import LLMProviderConfiguration
    from ..models.mcp_server_configuration import MCPServerConfiguration


T = TypeVar("T", bound="IntegrationCreate")


@_attrs_define
class IntegrationCreate:
    """Schema for creating a new integration.

    Attributes:
        name (str): Human-readable name for the integration
        integration_type (IntegrationType): Type of external integration.
        configuration (AAPGatewayConfiguration | LLMProviderConfiguration | MCPServerConfiguration): Integration-
            specific configuration
        description (None | str | Unset): Detailed description of the integration
        management_credential_id (None | Unset | UUID): Optional credential for admin operations
        enabled (bool | Unset): Whether the integration is active Default: True.
        scope (IntegrationScope | Unset): Visibility scope of an integration.
        labels (IntegrationCreateLabels | Unset): Key-value labels
    """

    name: str
    integration_type: IntegrationType
    configuration: AAPGatewayConfiguration | LLMProviderConfiguration | MCPServerConfiguration
    description: None | str | Unset = UNSET
    management_credential_id: None | Unset | UUID = UNSET
    enabled: bool | Unset = True
    scope: IntegrationScope | Unset = UNSET
    labels: IntegrationCreateLabels | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.llm_provider_configuration import LLMProviderConfiguration
        from ..models.mcp_server_configuration import MCPServerConfiguration

        name = self.name

        integration_type = self.integration_type.value

        configuration: dict[str, Any]
        if isinstance(self.configuration, MCPServerConfiguration):
            configuration = self.configuration.to_dict()
        elif isinstance(self.configuration, LLMProviderConfiguration):
            configuration = self.configuration.to_dict()
        else:
            configuration = self.configuration.to_dict()

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        management_credential_id: None | str | Unset
        if isinstance(self.management_credential_id, Unset):
            management_credential_id = UNSET
        elif isinstance(self.management_credential_id, UUID):
            management_credential_id = str(self.management_credential_id)
        else:
            management_credential_id = self.management_credential_id

        enabled = self.enabled

        scope: str | Unset = UNSET
        if not isinstance(self.scope, Unset):
            scope = self.scope.value

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "name": name,
                "integration_type": integration_type,
                "configuration": configuration,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if management_credential_id is not UNSET:
            field_dict["management_credential_id"] = management_credential_id
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if scope is not UNSET:
            field_dict["scope"] = scope
        if labels is not UNSET:
            field_dict["labels"] = labels

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.aap_gateway_configuration import AAPGatewayConfiguration
        from ..models.integration_create_labels import IntegrationCreateLabels
        from ..models.llm_provider_configuration import LLMProviderConfiguration
        from ..models.mcp_server_configuration import MCPServerConfiguration

        d = dict(src_dict)
        name = d.pop("name")

        integration_type = IntegrationType(d.pop("integration_type"))

        def _parse_configuration(
            data: object,
        ) -> AAPGatewayConfiguration | LLMProviderConfiguration | MCPServerConfiguration:
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                configuration_type_0 = MCPServerConfiguration.from_dict(data)

                return configuration_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                configuration_type_1 = LLMProviderConfiguration.from_dict(data)

                return configuration_type_1
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            if not isinstance(data, dict):
                raise TypeError()
            configuration_type_2 = AAPGatewayConfiguration.from_dict(data)

            return configuration_type_2

        configuration = _parse_configuration(d.pop("configuration"))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        def _parse_management_credential_id(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                management_credential_id_type_0 = UUID(data)

                return management_credential_id_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        management_credential_id = _parse_management_credential_id(d.pop("management_credential_id", UNSET))

        enabled = d.pop("enabled", UNSET)

        _scope = d.pop("scope", UNSET)
        scope: IntegrationScope | Unset
        if isinstance(_scope, Unset):
            scope = UNSET
        else:
            scope = IntegrationScope(_scope)

        _labels = d.pop("labels", UNSET)
        labels: IntegrationCreateLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = IntegrationCreateLabels.from_dict(_labels)

        integration_create = cls(
            name=name,
            integration_type=integration_type,
            configuration=configuration,
            description=description,
            management_credential_id=management_credential_id,
            enabled=enabled,
            scope=scope,
            labels=labels,
        )

        integration_create.additional_properties = d
        return integration_create

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
