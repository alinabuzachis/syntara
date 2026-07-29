from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.invocation_status import InvocationStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.invocation_trace_read_agent_trace_type_0 import InvocationTraceReadAgentTraceType0


T = TypeVar("T", bound="InvocationTraceRead")


@_attrs_define
class InvocationTraceRead:
    """Read schema for agent execution trace.

    Attributes:
        invocation_id (UUID): Invocation UUID
        status (InvocationStatus): Status enum for invocation lifecycle.
        agent_trace (InvocationTraceReadAgentTraceType0 | None | Unset): Agent execution trace with model, tokens,
            duration, and steps
    """

    invocation_id: UUID
    status: InvocationStatus
    agent_trace: InvocationTraceReadAgentTraceType0 | None | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.invocation_trace_read_agent_trace_type_0 import InvocationTraceReadAgentTraceType0

        invocation_id = str(self.invocation_id)

        status = self.status.value

        agent_trace: dict[str, Any] | None | Unset
        if isinstance(self.agent_trace, Unset):
            agent_trace = UNSET
        elif isinstance(self.agent_trace, InvocationTraceReadAgentTraceType0):
            agent_trace = self.agent_trace.to_dict()
        else:
            agent_trace = self.agent_trace

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "invocation_id": invocation_id,
                "status": status,
            }
        )
        if agent_trace is not UNSET:
            field_dict["agent_trace"] = agent_trace

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.invocation_trace_read_agent_trace_type_0 import InvocationTraceReadAgentTraceType0

        d = dict(src_dict)
        invocation_id = UUID(d.pop("invocation_id"))

        status = InvocationStatus(d.pop("status"))

        def _parse_agent_trace(data: object) -> InvocationTraceReadAgentTraceType0 | None | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                agent_trace_type_0 = InvocationTraceReadAgentTraceType0.from_dict(data)

                return agent_trace_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(InvocationTraceReadAgentTraceType0 | None | Unset, data)

        agent_trace = _parse_agent_trace(d.pop("agent_trace", UNSET))

        invocation_trace_read = cls(
            invocation_id=invocation_id,
            status=status,
            agent_trace=agent_trace,
        )

        invocation_trace_read.additional_properties = d
        return invocation_trace_read

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
