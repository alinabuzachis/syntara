from __future__ import annotations

from collections.abc import Mapping
from io import BytesIO
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from .. import types
from ..types import UNSET, File, FileTypes, Unset

T = TypeVar("T", bound="InvocationRequestWithFile")


@_attrs_define
class InvocationRequestWithFile:
    """Multipart form body for POST /invocations/chat (file upload path).

    Attributes:
        project_id (str):
        prompt (None | str | Unset):
        session_id (None | str | Unset):
        context_data (None | str | Unset):
        files (list[File] | None | Unset):
    """

    project_id: str
    prompt: None | str | Unset = UNSET
    session_id: None | str | Unset = UNSET
    context_data: None | str | Unset = UNSET
    files: list[File] | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        project_id = self.project_id

        prompt: None | str | Unset
        if isinstance(self.prompt, Unset):
            prompt = UNSET
        else:
            prompt = self.prompt

        session_id: None | str | Unset
        if isinstance(self.session_id, Unset):
            session_id = UNSET
        else:
            session_id = self.session_id

        context_data: None | str | Unset
        if isinstance(self.context_data, Unset):
            context_data = UNSET
        else:
            context_data = self.context_data

        files: list[FileTypes] | None | Unset
        if isinstance(self.files, Unset):
            files = UNSET
        elif isinstance(self.files, list):
            files = []
            for files_type_0_item_data in self.files:
                files_type_0_item = files_type_0_item_data.to_tuple()

                files.append(files_type_0_item)

        else:
            files = self.files

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "project_id": project_id,
            }
        )
        if prompt is not UNSET:
            field_dict["prompt"] = prompt
        if session_id is not UNSET:
            field_dict["session_id"] = session_id
        if context_data is not UNSET:
            field_dict["context_data"] = context_data
        if files is not UNSET:
            field_dict["files"] = files

        return field_dict

    def to_multipart(self) -> types.RequestFiles:
        files: types.RequestFiles = []

        files.append(("project_id", (None, str(self.project_id).encode(), "text/plain")))

        if not isinstance(self.prompt, Unset):
            if isinstance(self.prompt, str):
                files.append(("prompt", (None, str(self.prompt).encode(), "text/plain")))
            else:
                files.append(("prompt", (None, str(self.prompt).encode(), "text/plain")))

        if not isinstance(self.session_id, Unset):
            if isinstance(self.session_id, str):
                files.append(("session_id", (None, str(self.session_id).encode(), "text/plain")))
            else:
                files.append(("session_id", (None, str(self.session_id).encode(), "text/plain")))

        if not isinstance(self.context_data, Unset):
            if isinstance(self.context_data, str):
                files.append(("context_data", (None, str(self.context_data).encode(), "text/plain")))
            else:
                files.append(("context_data", (None, str(self.context_data).encode(), "text/plain")))

        if not isinstance(self.files, Unset):
            if isinstance(self.files, list):
                for files_type_0_item_element in self.files:
                    files.append(("files", files_type_0_item_element.to_tuple()))
            else:
                files.append(("files", (None, str(self.files).encode(), "text/plain")))

        for prop_name, prop in self.additional_properties.items():
            files.append((prop_name, (None, str(prop).encode(), "text/plain")))

        return files

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        project_id = d.pop("project_id")

        def _parse_prompt(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        prompt = _parse_prompt(d.pop("prompt", UNSET))

        def _parse_session_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        session_id = _parse_session_id(d.pop("session_id", UNSET))

        def _parse_context_data(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        context_data = _parse_context_data(d.pop("context_data", UNSET))

        def _parse_files(data: object) -> list[File] | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, list):
                    raise TypeError()
                files_type_0 = []
                _files_type_0 = data
                for files_type_0_item_data in _files_type_0:
                    files_type_0_item = File(payload=BytesIO(files_type_0_item_data))

                    files_type_0.append(files_type_0_item)

                return files_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(list[File] | None | Unset, data)

        files = _parse_files(d.pop("files", UNSET))

        invocation_request_with_file = cls(
            project_id=project_id,
            prompt=prompt,
            session_id=session_id,
            context_data=context_data,
            files=files,
        )

        invocation_request_with_file.additional_properties = d
        return invocation_request_with_file

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
