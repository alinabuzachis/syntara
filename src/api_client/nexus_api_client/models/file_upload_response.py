from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.file_upload_info import FileUploadInfo


T = TypeVar("T", bound="FileUploadResponse")


@_attrs_define
class FileUploadResponse:
    """Response model for POST /api/v1/files endpoint.

    Attributes:
        file_ids (list[str]): List of file IDs for later reference
        files (list[FileUploadInfo]): Metadata for each uploaded file
    """

    file_ids: list[str]
    files: list[FileUploadInfo]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        file_ids = self.file_ids

        files = []
        for files_item_data in self.files:
            files_item = files_item_data.to_dict()
            files.append(files_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "file_ids": file_ids,
                "files": files,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.file_upload_info import FileUploadInfo

        d = dict(src_dict)
        file_ids = cast(list[str], d.pop("file_ids"))

        files = []
        _files = d.pop("files")
        for files_item_data in _files:
            files_item = FileUploadInfo.from_dict(files_item_data)

            files.append(files_item)

        file_upload_response = cls(
            file_ids=file_ids,
            files=files,
        )

        file_upload_response.additional_properties = d
        return file_upload_response

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
