from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.workflow_version_read import WorkflowVersionRead


T = TypeVar("T", bound="WorkflowVersionListResponse")


@_attrs_define
class WorkflowVersionListResponse:
    """Schema for workflow version list response.

    Attributes:
        versions (list[WorkflowVersionRead]):
    """

    versions: list[WorkflowVersionRead]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        versions = []
        for versions_item_data in self.versions:
            versions_item = versions_item_data.to_dict()
            versions.append(versions_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "versions": versions,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.workflow_version_read import WorkflowVersionRead

        d = dict(src_dict)
        versions = []
        _versions = d.pop("versions")
        for versions_item_data in _versions:
            versions_item = WorkflowVersionRead.from_dict(versions_item_data)

            versions.append(versions_item)

        workflow_version_list_response = cls(
            versions=versions,
        )

        workflow_version_list_response.additional_properties = d
        return workflow_version_list_response

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
