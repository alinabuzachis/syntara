from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.can_i_request_resource_labels import CanIRequestResourceLabels
    from ..models.can_i_request_resource_metadata import CanIRequestResourceMetadata


T = TypeVar("T", bound="CanIRequest")


@_attrs_define
class CanIRequest:
    """Request body for the Can I? authorization check.

    Attributes:
        action (str): The action to check (e.g., "read", "create", "delete")
        resource_type (str): The type of resource (e.g., "workflow", "project")
        resource_id (str | Unset): Optional specific resource ID Default: ''.
        resource_labels (CanIRequestResourceLabels | Unset): Labels on the target resource
        resource_metadata (CanIRequestResourceMetadata | Unset): Additional metadata about the target resource
        resource_project (str | Unset): Project scope of the resource Default: ''.
    """

    action: str
    resource_type: str
    resource_id: str | Unset = ""
    resource_labels: CanIRequestResourceLabels | Unset = UNSET
    resource_metadata: CanIRequestResourceMetadata | Unset = UNSET
    resource_project: str | Unset = ""
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

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.can_i_request_resource_labels import CanIRequestResourceLabels
        from ..models.can_i_request_resource_metadata import CanIRequestResourceMetadata

        d = dict(src_dict)
        action = d.pop("action")

        resource_type = d.pop("resource_type")

        resource_id = d.pop("resource_id", UNSET)

        _resource_labels = d.pop("resource_labels", UNSET)
        resource_labels: CanIRequestResourceLabels | Unset
        if isinstance(_resource_labels, Unset):
            resource_labels = UNSET
        else:
            resource_labels = CanIRequestResourceLabels.from_dict(_resource_labels)

        _resource_metadata = d.pop("resource_metadata", UNSET)
        resource_metadata: CanIRequestResourceMetadata | Unset
        if isinstance(_resource_metadata, Unset):
            resource_metadata = UNSET
        else:
            resource_metadata = CanIRequestResourceMetadata.from_dict(_resource_metadata)

        resource_project = d.pop("resource_project", UNSET)

        can_i_request = cls(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            resource_labels=resource_labels,
            resource_metadata=resource_metadata,
            resource_project=resource_project,
        )

        can_i_request.additional_properties = d
        return can_i_request

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
