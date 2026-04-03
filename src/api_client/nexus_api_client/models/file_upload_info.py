from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="FileUploadInfo")


@_attrs_define
class FileUploadInfo:
    """Response model for individual file upload information.

    Security Note:
        file_path is intentionally excluded from this model to prevent
        exposing internal filesystem paths in API responses.

        Attributes:
            file_id (str): Unique file identifier (UUID)
            filename (str): Original filename
            size_bytes (int): File size in bytes
            mime_type (str): Detected MIME type
            status (str): Processing status (pending_conversion)
    """

    file_id: str
    filename: str
    size_bytes: int
    mime_type: str
    status: str
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        file_id = self.file_id

        filename = self.filename

        size_bytes = self.size_bytes

        mime_type = self.mime_type

        status = self.status

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "file_id": file_id,
                "filename": filename,
                "size_bytes": size_bytes,
                "mime_type": mime_type,
                "status": status,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        file_id = d.pop("file_id")

        filename = d.pop("filename")

        size_bytes = d.pop("size_bytes")

        mime_type = d.pop("mime_type")

        status = d.pop("status")

        file_upload_info = cls(
            file_id=file_id,
            filename=filename,
            size_bytes=size_bytes,
            mime_type=mime_type,
            status=status,
        )

        file_upload_info.additional_properties = d
        return file_upload_info

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
