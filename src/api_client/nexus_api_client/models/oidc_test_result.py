from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.oidc_test_result_metadata_type_0 import OIDCTestResultMetadataType0


T = TypeVar("T", bound="OIDCTestResult")


@_attrs_define
class OIDCTestResult:
    """Result of an OIDC connection test.

    Attributes:
        success (bool):
        message (str):
        metadata (None | OIDCTestResultMetadataType0 | Unset):
    """

    success: bool
    message: str
    metadata: None | OIDCTestResultMetadataType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.oidc_test_result_metadata_type_0 import OIDCTestResultMetadataType0

        success = self.success

        message = self.message

        metadata: dict[str, Any] | None | Unset
        if isinstance(self.metadata, Unset):
            metadata = UNSET
        elif isinstance(self.metadata, OIDCTestResultMetadataType0):
            metadata = self.metadata.to_dict()
        else:
            metadata = self.metadata

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "success": success,
                "message": message,
            }
        )
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.oidc_test_result_metadata_type_0 import OIDCTestResultMetadataType0

        d = dict(src_dict)
        success = d.pop("success")

        message = d.pop("message")

        def _parse_metadata(data: object) -> None | OIDCTestResultMetadataType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                metadata_type_0 = OIDCTestResultMetadataType0.from_dict(data)

                return metadata_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | OIDCTestResultMetadataType0 | Unset, data)

        metadata = _parse_metadata(d.pop("metadata", UNSET))

        oidc_test_result = cls(
            success=success,
            message=message,
            metadata=metadata,
        )

        oidc_test_result.additional_properties = d
        return oidc_test_result

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
