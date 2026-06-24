from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.agentic_executor_parameters_response_schema_type_0 import AgenticExecutorParametersResponseSchemaType0


T = TypeVar("T", bound="AgenticExecutorParameters")


@_attrs_define
class AgenticExecutorParameters:
    """Parameters for agentic executor.

    Attributes:
        prompt (str): Prompt template for the agent
        agent (None | str | Unset):
        model (None | str | Unset):
        credential_id (None | str | Unset): Nexus credential UUID for LLM provider authentication
        file_ids (list[str] | Unset): File IDs for agent context
        response_schema (AgenticExecutorParametersResponseSchemaType0 | None | str | Unset): JSON Schema for structured
            output. When defined, agent output conforms to this schema.
    """

    prompt: str
    agent: None | str | Unset = UNSET
    model: None | str | Unset = UNSET
    credential_id: None | str | Unset = UNSET
    file_ids: list[str] | Unset = UNSET
    response_schema: AgenticExecutorParametersResponseSchemaType0 | None | str | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.agentic_executor_parameters_response_schema_type_0 import (
            AgenticExecutorParametersResponseSchemaType0,
        )

        prompt = self.prompt

        agent: None | str | Unset
        if isinstance(self.agent, Unset):
            agent = UNSET
        else:
            agent = self.agent

        model: None | str | Unset
        if isinstance(self.model, Unset):
            model = UNSET
        else:
            model = self.model

        credential_id: None | str | Unset
        if isinstance(self.credential_id, Unset):
            credential_id = UNSET
        else:
            credential_id = self.credential_id

        file_ids: list[str] | Unset = UNSET
        if not isinstance(self.file_ids, Unset):
            file_ids = self.file_ids

        response_schema: dict[str, Any] | None | str | Unset
        if isinstance(self.response_schema, Unset):
            response_schema = UNSET
        elif isinstance(self.response_schema, AgenticExecutorParametersResponseSchemaType0):
            response_schema = self.response_schema.to_dict()
        else:
            response_schema = self.response_schema

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "prompt": prompt,
            }
        )
        if agent is not UNSET:
            field_dict["agent"] = agent
        if model is not UNSET:
            field_dict["model"] = model
        if credential_id is not UNSET:
            field_dict["credential_id"] = credential_id
        if file_ids is not UNSET:
            field_dict["file_ids"] = file_ids
        if response_schema is not UNSET:
            field_dict["responseSchema"] = response_schema

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.agentic_executor_parameters_response_schema_type_0 import (
            AgenticExecutorParametersResponseSchemaType0,
        )

        d = dict(src_dict)
        prompt = d.pop("prompt")

        def _parse_agent(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        agent = _parse_agent(d.pop("agent", UNSET))

        def _parse_model(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        model = _parse_model(d.pop("model", UNSET))

        def _parse_credential_id(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        credential_id = _parse_credential_id(d.pop("credential_id", UNSET))

        file_ids = cast(list[str], d.pop("file_ids", UNSET))

        def _parse_response_schema(data: object) -> AgenticExecutorParametersResponseSchemaType0 | None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                response_schema_type_0 = AgenticExecutorParametersResponseSchemaType0.from_dict(data)

                return response_schema_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(AgenticExecutorParametersResponseSchemaType0 | None | str | Unset, data)

        response_schema = _parse_response_schema(d.pop("responseSchema", UNSET))

        agentic_executor_parameters = cls(
            prompt=prompt,
            agent=agent,
            model=model,
            credential_id=credential_id,
            file_ids=file_ids,
            response_schema=response_schema,
        )

        agentic_executor_parameters.additional_properties = d
        return agentic_executor_parameters

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
