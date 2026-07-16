from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.integration_refresh_status import IntegrationRefreshStatus
from ..models.integration_scope import IntegrationScope
from ..models.integration_status import IntegrationStatus
from ..models.integration_type import IntegrationType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.aap_configuration import AAPConfiguration
    from ..models.integration_read_labels import IntegrationReadLabels
    from ..models.llm_provider_configuration import LLMProviderConfiguration
    from ..models.mcp_server_configuration_input import MCPServerConfigurationInput


T = TypeVar("T", bound="IntegrationRead")


@_attrs_define
class IntegrationRead:
    """Schema for integration API responses.

    Attributes:
        created_by (None | str | UUID): Username or UUID of the creator Example: 770e8400-e29b-41d4-a716-446655440000.
        name (str): Human-readable name for the resource Example: Authentication Service.
        integration_type (IntegrationType): Type of external integration.
        configuration (AAPConfiguration | LLMProviderConfiguration | MCPServerConfigurationInput): Integration-specific
            configuration
        id (UUID | Unset): Unique identifier for the resource Example: 550e8400-e29b-41d4-a716-446655440000.
        created_at (datetime.datetime | Unset): Timestamp when resource was created Example: 2025-10-09T12:00:00Z.
        updated_at (datetime.datetime | Unset): Timestamp when resource was last updated Example: 2025-10-09T12:30:00Z.
        labels (IntegrationReadLabels | Unset): Key-value pairs for resource labeling and filtering Example:
            {'environment': 'production', 'region': 'us-east-1', 'team': 'platform'}.
        updated_by (None | str | Unset | UUID): Username or UUID of the last modifier Example:
            880e8400-e29b-41d4-a716-446655440000.
        deleted_at (datetime.datetime | None | Unset): Timestamp when resource was soft deleted Example:
            2025-10-09T14:00:00Z.
        deleted_by (None | Unset | UUID): User who performed the soft delete Example:
            660e8400-e29b-41d4-a716-446655440000.
        description (None | str | Unset): Detailed description of the resource Example: Handles user authentication and
            authorization workflows.
        enabled (bool | Unset):  Default: True.
        validation_status (IntegrationStatus | Unset): Validation status of an integration.
        scope (IntegrationScope | Unset): Visibility scope of an integration.
        last_validated_at (datetime.datetime | None | Unset):
        management_credential_id (None | Unset | UUID):
        validation_error (None | str | Unset):
        refresh_status (IntegrationRefreshStatus | None | Unset):
        last_refreshed_at (datetime.datetime | None | Unset):
        refresh_error (None | str | Unset):
        total_tool_count (int | Unset): Total number of tools linked to this integration Default: 0.
        enabled_tool_count (int | Unset): Number of enabled tools linked to this integration Default: 0.
        total_model_count (int | Unset): Total number of models linked to this integration Default: 0.
        enabled_model_count (int | Unset): Number of enabled models linked to this integration Default: 0.
    """

    created_by: None | str | UUID
    name: str
    integration_type: IntegrationType
    configuration: AAPConfiguration | LLMProviderConfiguration | MCPServerConfigurationInput
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: IntegrationReadLabels | Unset = UNSET
    updated_by: None | str | Unset | UUID = UNSET
    deleted_at: datetime.datetime | None | Unset = UNSET
    deleted_by: None | Unset | UUID = UNSET
    description: None | str | Unset = UNSET
    enabled: bool | Unset = True
    validation_status: IntegrationStatus | Unset = UNSET
    scope: IntegrationScope | Unset = UNSET
    last_validated_at: datetime.datetime | None | Unset = UNSET
    management_credential_id: None | Unset | UUID = UNSET
    validation_error: None | str | Unset = UNSET
    refresh_status: IntegrationRefreshStatus | None | Unset = UNSET
    last_refreshed_at: datetime.datetime | None | Unset = UNSET
    refresh_error: None | str | Unset = UNSET
    total_tool_count: int | Unset = 0
    enabled_tool_count: int | Unset = 0
    total_model_count: int | Unset = 0
    enabled_model_count: int | Unset = 0

    def to_dict(self) -> dict[str, Any]:
        from ..models.llm_provider_configuration import LLMProviderConfiguration
        from ..models.mcp_server_configuration_input import MCPServerConfigurationInput

        created_by: None | str
        if isinstance(self.created_by, UUID):
            created_by = str(self.created_by)
        else:
            created_by = self.created_by

        name = self.name

        integration_type = self.integration_type.value

        configuration: dict[str, Any]
        if isinstance(self.configuration, MCPServerConfigurationInput):
            configuration = self.configuration.to_dict()
        elif isinstance(self.configuration, LLMProviderConfiguration):
            configuration = self.configuration.to_dict()
        else:
            configuration = self.configuration.to_dict()

        id: str | Unset = UNSET
        if not isinstance(self.id, Unset):
            id = str(self.id)

        created_at: str | Unset = UNSET
        if not isinstance(self.created_at, Unset):
            created_at = self.created_at.isoformat()

        updated_at: str | Unset = UNSET
        if not isinstance(self.updated_at, Unset):
            updated_at = self.updated_at.isoformat()

        labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.labels, Unset):
            labels = self.labels.to_dict()

        updated_by: None | str | Unset
        if isinstance(self.updated_by, Unset):
            updated_by = UNSET
        elif isinstance(self.updated_by, UUID):
            updated_by = str(self.updated_by)
        else:
            updated_by = self.updated_by

        deleted_at: None | str | Unset
        if isinstance(self.deleted_at, Unset):
            deleted_at = UNSET
        elif isinstance(self.deleted_at, datetime.datetime):
            deleted_at = self.deleted_at.isoformat()
        else:
            deleted_at = self.deleted_at

        deleted_by: None | str | Unset
        if isinstance(self.deleted_by, Unset):
            deleted_by = UNSET
        elif isinstance(self.deleted_by, UUID):
            deleted_by = str(self.deleted_by)
        else:
            deleted_by = self.deleted_by

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        enabled = self.enabled

        validation_status: str | Unset = UNSET
        if not isinstance(self.validation_status, Unset):
            validation_status = self.validation_status.value

        scope: str | Unset = UNSET
        if not isinstance(self.scope, Unset):
            scope = self.scope.value

        last_validated_at: None | str | Unset
        if isinstance(self.last_validated_at, Unset):
            last_validated_at = UNSET
        elif isinstance(self.last_validated_at, datetime.datetime):
            last_validated_at = self.last_validated_at.isoformat()
        else:
            last_validated_at = self.last_validated_at

        management_credential_id: None | str | Unset
        if isinstance(self.management_credential_id, Unset):
            management_credential_id = UNSET
        elif isinstance(self.management_credential_id, UUID):
            management_credential_id = str(self.management_credential_id)
        else:
            management_credential_id = self.management_credential_id

        validation_error: None | str | Unset
        if isinstance(self.validation_error, Unset):
            validation_error = UNSET
        else:
            validation_error = self.validation_error

        refresh_status: None | str | Unset
        if isinstance(self.refresh_status, Unset):
            refresh_status = UNSET
        elif isinstance(self.refresh_status, IntegrationRefreshStatus):
            refresh_status = self.refresh_status.value
        else:
            refresh_status = self.refresh_status

        last_refreshed_at: None | str | Unset
        if isinstance(self.last_refreshed_at, Unset):
            last_refreshed_at = UNSET
        elif isinstance(self.last_refreshed_at, datetime.datetime):
            last_refreshed_at = self.last_refreshed_at.isoformat()
        else:
            last_refreshed_at = self.last_refreshed_at

        refresh_error: None | str | Unset
        if isinstance(self.refresh_error, Unset):
            refresh_error = UNSET
        else:
            refresh_error = self.refresh_error

        total_tool_count = self.total_tool_count

        enabled_tool_count = self.enabled_tool_count

        total_model_count = self.total_model_count

        enabled_model_count = self.enabled_model_count

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "created_by": created_by,
                "name": name,
                "integration_type": integration_type,
                "configuration": configuration,
            }
        )
        if id is not UNSET:
            field_dict["id"] = id
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at
        if labels is not UNSET:
            field_dict["labels"] = labels
        if updated_by is not UNSET:
            field_dict["updated_by"] = updated_by
        if deleted_at is not UNSET:
            field_dict["deleted_at"] = deleted_at
        if deleted_by is not UNSET:
            field_dict["deleted_by"] = deleted_by
        if description is not UNSET:
            field_dict["description"] = description
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if validation_status is not UNSET:
            field_dict["validation_status"] = validation_status
        if scope is not UNSET:
            field_dict["scope"] = scope
        if last_validated_at is not UNSET:
            field_dict["last_validated_at"] = last_validated_at
        if management_credential_id is not UNSET:
            field_dict["management_credential_id"] = management_credential_id
        if validation_error is not UNSET:
            field_dict["validation_error"] = validation_error
        if refresh_status is not UNSET:
            field_dict["refresh_status"] = refresh_status
        if last_refreshed_at is not UNSET:
            field_dict["last_refreshed_at"] = last_refreshed_at
        if refresh_error is not UNSET:
            field_dict["refresh_error"] = refresh_error
        if total_tool_count is not UNSET:
            field_dict["total_tool_count"] = total_tool_count
        if enabled_tool_count is not UNSET:
            field_dict["enabled_tool_count"] = enabled_tool_count
        if total_model_count is not UNSET:
            field_dict["total_model_count"] = total_model_count
        if enabled_model_count is not UNSET:
            field_dict["enabled_model_count"] = enabled_model_count

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.aap_configuration import AAPConfiguration
        from ..models.integration_read_labels import IntegrationReadLabels
        from ..models.llm_provider_configuration import LLMProviderConfiguration
        from ..models.mcp_server_configuration_input import MCPServerConfigurationInput

        d = dict(src_dict)

        def _parse_created_by(data: object) -> None | str | UUID:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_by_type_1 = UUID(data)

                return created_by_type_1
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | str | UUID, data)

        created_by = _parse_created_by(d.pop("created_by"))

        name = d.pop("name")

        integration_type = IntegrationType(d.pop("integration_type"))

        def _parse_configuration(
            data: object,
        ) -> AAPConfiguration | LLMProviderConfiguration | MCPServerConfigurationInput:
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                configuration_type_0 = MCPServerConfigurationInput.from_dict(data)

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
            configuration_type_2 = AAPConfiguration.from_dict(data)

            return configuration_type_2

        configuration = _parse_configuration(d.pop("configuration"))

        _id = d.pop("id", UNSET)
        id: UUID | Unset
        if isinstance(_id, Unset):
            id = UNSET
        else:
            id = UUID(_id)

        _created_at = d.pop("created_at", UNSET)
        created_at: datetime.datetime | Unset
        if isinstance(_created_at, Unset):
            created_at = UNSET
        else:
            created_at = isoparse(_created_at)

        _updated_at = d.pop("updated_at", UNSET)
        updated_at: datetime.datetime | Unset
        if isinstance(_updated_at, Unset):
            updated_at = UNSET
        else:
            updated_at = isoparse(_updated_at)

        _labels = d.pop("labels", UNSET)
        labels: IntegrationReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = IntegrationReadLabels.from_dict(_labels)

        def _parse_updated_by(data: object) -> None | str | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_by_type_1 = UUID(data)

                return updated_by_type_1
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | str | Unset | UUID, data)

        updated_by = _parse_updated_by(d.pop("updated_by", UNSET))

        def _parse_deleted_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                deleted_at_type_0 = isoparse(data)

                return deleted_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        deleted_at = _parse_deleted_at(d.pop("deleted_at", UNSET))

        def _parse_deleted_by(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                deleted_by_type_0 = UUID(data)

                return deleted_by_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        deleted_by = _parse_deleted_by(d.pop("deleted_by", UNSET))

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        enabled = d.pop("enabled", UNSET)

        _validation_status = d.pop("validation_status", UNSET)
        validation_status: IntegrationStatus | Unset
        if isinstance(_validation_status, Unset):
            validation_status = UNSET
        else:
            validation_status = IntegrationStatus(_validation_status)

        _scope = d.pop("scope", UNSET)
        scope: IntegrationScope | Unset
        if isinstance(_scope, Unset):
            scope = UNSET
        else:
            scope = IntegrationScope(_scope)

        def _parse_last_validated_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_validated_at_type_0 = isoparse(data)

                return last_validated_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        last_validated_at = _parse_last_validated_at(d.pop("last_validated_at", UNSET))

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

        def _parse_validation_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        validation_error = _parse_validation_error(d.pop("validation_error", UNSET))

        def _parse_refresh_status(data: object) -> IntegrationRefreshStatus | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                refresh_status_type_0 = IntegrationRefreshStatus(data)

                return refresh_status_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(IntegrationRefreshStatus | None | Unset, data)

        refresh_status = _parse_refresh_status(d.pop("refresh_status", UNSET))

        def _parse_last_refreshed_at(data: object) -> datetime.datetime | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_refreshed_at_type_0 = isoparse(data)

                return last_refreshed_at_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(datetime.datetime | None | Unset, data)

        last_refreshed_at = _parse_last_refreshed_at(d.pop("last_refreshed_at", UNSET))

        def _parse_refresh_error(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        refresh_error = _parse_refresh_error(d.pop("refresh_error", UNSET))

        total_tool_count = d.pop("total_tool_count", UNSET)

        enabled_tool_count = d.pop("enabled_tool_count", UNSET)

        total_model_count = d.pop("total_model_count", UNSET)

        enabled_model_count = d.pop("enabled_model_count", UNSET)

        integration_read = cls(
            created_by=created_by,
            name=name,
            integration_type=integration_type,
            configuration=configuration,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
            updated_by=updated_by,
            deleted_at=deleted_at,
            deleted_by=deleted_by,
            description=description,
            enabled=enabled,
            validation_status=validation_status,
            scope=scope,
            last_validated_at=last_validated_at,
            management_credential_id=management_credential_id,
            validation_error=validation_error,
            refresh_status=refresh_status,
            last_refreshed_at=last_refreshed_at,
            refresh_error=refresh_error,
            total_tool_count=total_tool_count,
            enabled_tool_count=enabled_tool_count,
            total_model_count=total_model_count,
            enabled_model_count=enabled_model_count,
        )

        return integration_read
