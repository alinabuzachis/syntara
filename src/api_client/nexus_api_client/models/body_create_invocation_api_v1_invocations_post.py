from __future__ import annotations

import json
from collections.abc import Mapping
from io import BytesIO
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from .. import types
from ..types import UNSET, File, FileTypes, Unset

if TYPE_CHECKING:
    from ..models.invocation_create_request import InvocationCreateRequest


T = TypeVar("T", bound="BodyCreateInvocationApiV1InvocationsPost")


@_attrs_define
class BodyCreateInvocationApiV1InvocationsPost:
    """
    Attributes:
        request_body (InvocationCreateRequest | None | Unset):
        prompt (None | str | Unset):
        session_id (None | str | Unset):
        context_data (None | str | Unset):
        files (list[File] | None | Unset):
    """

    request_body: InvocationCreateRequest | None | Unset = UNSET
    prompt: None | str | Unset = UNSET
    session_id: None | str | Unset = UNSET
    context_data: None | str | Unset = UNSET
    files: list[File] | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.invocation_create_request import InvocationCreateRequest

        request_body: dict[str, Any] | None | Unset
        if isinstance(self.request_body, Unset):
            request_body = UNSET
        elif isinstance(self.request_body, InvocationCreateRequest):
            request_body = self.request_body.to_dict()
        else:
            request_body = self.request_body

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
        field_dict.update({})
        if request_body is not UNSET:
            field_dict["request_body"] = request_body
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
        from ..models.invocation_create_request import InvocationCreateRequest

        files: types.RequestFiles = []

        if not isinstance(self.request_body, Unset):
            if isinstance(self.request_body, InvocationCreateRequest):
                files.append(
                    ("request_body", (None, json.dumps(self.request_body.to_dict()).encode(), "application/json"))
                )
            else:
                files.append(("request_body", (None, str(self.request_body).encode(), "text/plain")))

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
        from ..models.invocation_create_request import InvocationCreateRequest

        d = dict(src_dict)

        def _parse_request_body(data: object) -> InvocationCreateRequest | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                request_body_type_0 = InvocationCreateRequest.from_dict(data)

                return request_body_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(InvocationCreateRequest | None | Unset, data)

        request_body = _parse_request_body(d.pop("request_body", UNSET))

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

        body_create_invocation_api_v1_invocations_post = cls(
            request_body=request_body,
            prompt=prompt,
            session_id=session_id,
            context_data=context_data,
            files=files,
        )

        body_create_invocation_api_v1_invocations_post.additional_properties = d
        return body_create_invocation_api_v1_invocations_post

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
