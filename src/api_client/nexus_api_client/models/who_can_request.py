from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.who_can_request_resource_labels import WhoCanRequestResourceLabels
    from ..models.who_can_request_resource_metadata import WhoCanRequestResourceMetadata


T = TypeVar("T", bound="WhoCanRequest")


@_attrs_define
class WhoCanRequest:
    """Request body for the Who can? endpoint.

    Attributes:
        action (str):
        resource_type (str):
        resource_id (str | Unset):  Default: ''.
        resource_labels (WhoCanRequestResourceLabels | Unset):
        resource_metadata (WhoCanRequestResourceMetadata | Unset):
        resource_project (str | Unset):  Default: ''.
        limit (int | Unset): Maximum number of results per page Default: 20.
        cursor (None | Unset | UUID):
    """

    action: str
    resource_type: str
    resource_id: str | Unset = ""
    resource_labels: WhoCanRequestResourceLabels | Unset = UNSET
    resource_metadata: WhoCanRequestResourceMetadata | Unset = UNSET
    resource_project: str | Unset = ""
    limit: int | Unset = 20
    cursor: None | Unset | UUID = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        action = self.action

        resource_type = self.resource_type

        resource_id = self.resource_id

        resource_labels: dict[str, Any] | Unset = UNSET
        if not isinstance(self.resource_labels, Unset):
            resource_labels = self.resource_labels.to_dict()

        resource_metadata: dict[str, Any] | Unset = UNSET
        if not isinstance(self.resource_metadata, Unset):
            resource_metadata = self.resource_metadata.to_dict()

        resource_project = self.resource_project

        limit = self.limit

        cursor: None | str | Unset
        if isinstance(self.cursor, Unset):
            cursor = UNSET
        elif isinstance(self.cursor, UUID):
            cursor = str(self.cursor)
        else:
            cursor = self.cursor

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "action": action,
                "resource_type": resource_type,
            }
        )
        if resource_id is not UNSET:
            field_dict["resource_id"] = resource_id
        if resource_labels is not UNSET:
            field_dict["resource_labels"] = resource_labels
        if resource_metadata is not UNSET:
            field_dict["resource_metadata"] = resource_metadata
        if resource_project is not UNSET:
            field_dict["resource_project"] = resource_project
        if limit is not UNSET:
            field_dict["limit"] = limit
        if cursor is not UNSET:
            field_dict["cursor"] = cursor

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.who_can_request_resource_labels import WhoCanRequestResourceLabels
        from ..models.who_can_request_resource_metadata import WhoCanRequestResourceMetadata

        d = dict(src_dict)
        action = d.pop("action")

        resource_type = d.pop("resource_type")

        resource_id = d.pop("resource_id", UNSET)

        _resource_labels = d.pop("resource_labels", UNSET)
        resource_labels: WhoCanRequestResourceLabels | Unset
        if isinstance(_resource_labels, Unset):
            resource_labels = UNSET
        else:
            resource_labels = WhoCanRequestResourceLabels.from_dict(_resource_labels)

        _resource_metadata = d.pop("resource_metadata", UNSET)
        resource_metadata: WhoCanRequestResourceMetadata | Unset
        if isinstance(_resource_metadata, Unset):
            resource_metadata = UNSET
        else:
            resource_metadata = WhoCanRequestResourceMetadata.from_dict(_resource_metadata)

        resource_project = d.pop("resource_project", UNSET)

        limit = d.pop("limit", UNSET)

        def _parse_cursor(data: object) -> None | Unset | UUID:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                cursor_type_0 = UUID(data)

                return cursor_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | Unset | UUID, data)

        cursor = _parse_cursor(d.pop("cursor", UNSET))

        who_can_request = cls(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_labels=resource_labels,
            resource_metadata=resource_metadata,
            resource_project=resource_project,
            limit=limit,
            cursor=cursor,
        )

        who_can_request.additional_properties = d
        return who_can_request

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
