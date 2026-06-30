from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.invocation_create_request_contextdata import InvocationCreateRequestContextdata


T = TypeVar("T", bound="InvocationCreateRequest")


@_attrs_define
class InvocationCreateRequest:
    """Request schema for creating a new invocation.

    Supports multiple field name formats:
    - snake_case (API contract): session_id, context_data
    - camelCase (backward compatibility): sessionId, contextData

    Note: created_by is automatically set from authenticated user context.

        Attributes:
            prompt (str): Natural language request describing desired automation task
            session_id (str): Session identifier for grouping related invocations
            project_id (UUID): Project to associate this invocation with
            context_data (InvocationCreateRequestContextdata | Unset): Optional additional context for the request. Use
                'file_ids' (array of UUID strings) to reference uploaded files.
    """

    prompt: str
    session_id: str
    project_id: UUID
    context_data: InvocationCreateRequestContextdata | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        prompt = self.prompt

        session_id = self.session_id

        project_id = str(self.project_id)

        context_data: dict[str, Any] | Unset = UNSET
        if not isinstance(self.context_data, Unset):
            context_data = self.context_data.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "prompt": prompt,
                "sessionId": session_id,
                "projectId": project_id,
            }
        )
        if context_data is not UNSET:
            field_dict["contextData"] = context_data

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.invocation_create_request_contextdata import InvocationCreateRequestContextdata

        d = dict(src_dict)
        prompt = d.pop("prompt")

        session_id = d.pop("sessionId")

        project_id = UUID(d.pop("projectId"))

        _context_data = d.pop("contextData", UNSET)
        context_data: InvocationCreateRequestContextdata | Unset
        if isinstance(_context_data, Unset):
            context_data = UNSET
        else:
            context_data = InvocationCreateRequestContextdata.from_dict(_context_data)

        invocation_create_request = cls(
            prompt=prompt,
            session_id=session_id,
            project_id=project_id,
            context_data=context_data,
        )

        invocation_create_request.additional_properties = d
        return invocation_create_request

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
