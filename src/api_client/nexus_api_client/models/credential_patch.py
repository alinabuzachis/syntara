from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.credential_patch_inputs_type_0 import CredentialPatchInputsType0
    from ..models.credential_patch_labels_type_0 import CredentialPatchLabelsType0


T = TypeVar("T", bound="CredentialPatch")


@_attrs_define
class CredentialPatch:
    """Schema for partially updating a credential. $encrypted$ preserves existing values.

    Attributes:
        description (None | str | Unset):
        enabled (bool | None | Unset):
        inputs (CredentialPatchInputsType0 | None | Unset):
        labels (CredentialPatchLabelsType0 | None | Unset):
        name (None | str | Unset):
    """

    description: None | str | Unset = UNSET
    enabled: bool | None | Unset = UNSET
    inputs: CredentialPatchInputsType0 | None | Unset = UNSET
    labels: CredentialPatchLabelsType0 | None | Unset = UNSET
    name: None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.credential_patch_inputs_type_0 import CredentialPatchInputsType0
        from ..models.credential_patch_labels_type_0 import CredentialPatchLabelsType0

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        enabled: bool | None | Unset
        if isinstance(self.enabled, Unset):
            enabled = UNSET
        else:
            enabled = self.enabled

        inputs: dict[str, Any] | None | Unset
        if isinstance(self.inputs, Unset):
            inputs = UNSET
        elif isinstance(self.inputs, CredentialPatchInputsType0):
            inputs = self.inputs.to_dict()
        else:
            inputs = self.inputs

        labels: dict[str, Any] | None | Unset
        if isinstance(self.labels, Unset):
            labels = UNSET
        elif isinstance(self.labels, CredentialPatchLabelsType0):
            labels = self.labels.to_dict()
        else:
            labels = self.labels

        name: None | str | Unset
        if isinstance(self.name, Unset):
            name = UNSET
        else:
            name = self.name

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if description is not UNSET:
            field_dict["description"] = description
        if enabled is not UNSET:
            field_dict["enabled"] = enabled
        if inputs is not UNSET:
            field_dict["inputs"] = inputs
        if labels is not UNSET:
            field_dict["labels"] = labels
        if name is not UNSET:
            field_dict["name"] = name

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.credential_patch_inputs_type_0 import CredentialPatchInputsType0
        from ..models.credential_patch_labels_type_0 import CredentialPatchLabelsType0

        d = dict(src_dict)

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        def _parse_enabled(data: object) -> bool | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(bool | None | Unset, data)

        enabled = _parse_enabled(d.pop("enabled", UNSET))

        def _parse_inputs(data: object) -> CredentialPatchInputsType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                inputs_type_0 = CredentialPatchInputsType0.from_dict(data)

                return inputs_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(CredentialPatchInputsType0 | None | Unset, data)

        inputs = _parse_inputs(d.pop("inputs", UNSET))

        def _parse_labels(data: object) -> CredentialPatchLabelsType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                labels_type_0 = CredentialPatchLabelsType0.from_dict(data)

                return labels_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(CredentialPatchLabelsType0 | None | Unset, data)

        labels = _parse_labels(d.pop("labels", UNSET))

        def _parse_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        name = _parse_name(d.pop("name", UNSET))

        credential_patch = cls(
            description=description,
            enabled=enabled,
            inputs=inputs,
            labels=labels,
            name=name,
        )

        credential_patch.additional_properties = d
        return credential_patch

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
