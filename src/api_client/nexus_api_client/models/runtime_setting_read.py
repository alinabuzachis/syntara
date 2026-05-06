from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.setting_value_type import SettingValueType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.runtime_setting_read_labels import RuntimeSettingReadLabels
    from ..models.runtime_setting_read_validation_schema_type_0 import RuntimeSettingReadValidationSchemaType0


T = TypeVar("T", bound="RuntimeSettingRead")


@_attrs_define
class RuntimeSettingRead:
    """Read schema for a single runtime setting.

    Attributes:
        key (str):
        name (str):
        description (None | str):
        helper_text (None | str):
        category (str):
        group (None | str):
        value (Any):
        default_value (Any):
        effective_value (Any):
        value_type (SettingValueType): Expected value type for a runtime setting, used for UI rendering and validation.
        requires_restart (bool):
        cache_ttl_seconds (int | None):
        validation_schema (None | RuntimeSettingReadValidationSchemaType0):
        version (int):
        id (UUID | Unset): Unique identifier for the resource Example: 550e8400-e29b-41d4-a716-446655440000.
        created_at (datetime.datetime | Unset): Timestamp when resource was created Example: 2025-10-09T12:00:00Z.
        updated_at (datetime.datetime | Unset): Timestamp when resource was last updated Example: 2025-10-09T12:30:00Z.
        labels (RuntimeSettingReadLabels | Unset): Key-value pairs for resource labeling and filtering Example:
            {'environment': 'production', 'region': 'us-east-1', 'team': 'platform'}.
    """

    key: str
    name: str
    description: None | str
    helper_text: None | str
    category: str
    group: None | str
    value: Any
    default_value: Any
    effective_value: Any
    value_type: SettingValueType
    requires_restart: bool
    cache_ttl_seconds: int | None
    validation_schema: None | RuntimeSettingReadValidationSchemaType0
    version: int
    id: UUID | Unset = UNSET
    created_at: datetime.datetime | Unset = UNSET
    updated_at: datetime.datetime | Unset = UNSET
    labels: RuntimeSettingReadLabels | Unset = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.runtime_setting_read_validation_schema_type_0 import RuntimeSettingReadValidationSchemaType0

        key = self.key

        name = self.name

        description: None | str
        description = self.description

        helper_text: None | str
        helper_text = self.helper_text

        category = self.category

        group: None | str
        group = self.group

        value = self.value

        default_value = self.default_value

        effective_value = self.effective_value

        value_type = self.value_type.value

        requires_restart = self.requires_restart

        cache_ttl_seconds: int | None
        cache_ttl_seconds = self.cache_ttl_seconds

        validation_schema: dict[str, Any] | None
        if isinstance(self.validation_schema, RuntimeSettingReadValidationSchemaType0):
            validation_schema = self.validation_schema.to_dict()
        else:
            validation_schema = self.validation_schema

        version = self.version

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

        field_dict: dict[str, Any] = {}

        field_dict.update(
            {
                "key": key,
                "name": name,
                "description": description,
                "helper_text": helper_text,
                "category": category,
                "group": group,
                "value": value,
                "default_value": default_value,
                "effective_value": effective_value,
                "value_type": value_type,
                "requires_restart": requires_restart,
                "cache_ttl_seconds": cache_ttl_seconds,
                "validation_schema": validation_schema,
                "version": version,
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

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.runtime_setting_read_labels import RuntimeSettingReadLabels
        from ..models.runtime_setting_read_validation_schema_type_0 import RuntimeSettingReadValidationSchemaType0

        d = dict(src_dict)
        key = d.pop("key")

        name = d.pop("name")

        def _parse_description(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        description = _parse_description(d.pop("description"))

        def _parse_helper_text(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        helper_text = _parse_helper_text(d.pop("helper_text"))

        category = d.pop("category")

        def _parse_group(data: object) -> None | str:
            if data is None:
                return data
            return cast(None | str, data)

        group = _parse_group(d.pop("group"))

        value = d.pop("value")

        default_value = d.pop("default_value")

        effective_value = d.pop("effective_value")

        value_type = SettingValueType(d.pop("value_type"))

        requires_restart = d.pop("requires_restart")

        def _parse_cache_ttl_seconds(data: object) -> int | None:
            if data is None:
                return data
            return cast(int | None, data)

        cache_ttl_seconds = _parse_cache_ttl_seconds(d.pop("cache_ttl_seconds"))

        def _parse_validation_schema(data: object) -> None | RuntimeSettingReadValidationSchemaType0:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                validation_schema_type_0 = RuntimeSettingReadValidationSchemaType0.from_dict(data)

                return validation_schema_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | RuntimeSettingReadValidationSchemaType0, data)

        validation_schema = _parse_validation_schema(d.pop("validation_schema"))

        version = d.pop("version")

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
        labels: RuntimeSettingReadLabels | Unset
        if isinstance(_labels, Unset):
            labels = UNSET
        else:
            labels = RuntimeSettingReadLabels.from_dict(_labels)

        runtime_setting_read = cls(
            key=key,
            name=name,
            description=description,
            helper_text=helper_text,
            category=category,
            group=group,
            value=value,
            default_value=default_value,
            effective_value=effective_value,
            value_type=value_type,
            requires_restart=requires_restart,
            cache_ttl_seconds=cache_ttl_seconds,
            validation_schema=validation_schema,
            version=version,
            id=id,
            created_at=created_at,
            updated_at=updated_at,
            labels=labels,
        )

        return runtime_setting_read
