from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.publish_version_request_workflow_definition_type_0 import PublishVersionRequestWorkflowDefinitionType0


T = TypeVar("T", bound="PublishVersionRequest")


@_attrs_define
class PublishVersionRequest:
    """Request body for publishing a workflow version.

    Attributes:
        publish_name (None | str | Unset): Optional name for this published version
        change_description (None | str | Unset): Description of changes in this version
        workflow_definition (None | PublishVersionRequestWorkflowDefinitionType0 | Unset): Optional workflow definition
            to publish directly (skips separate save step)
    """

    publish_name: None | str | Unset = UNSET
    change_description: None | str | Unset = UNSET
    workflow_definition: None | PublishVersionRequestWorkflowDefinitionType0 | Unset = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.publish_version_request_workflow_definition_type_0 import (
            PublishVersionRequestWorkflowDefinitionType0,
        )

        publish_name: None | str | Unset
        if isinstance(self.publish_name, Unset):
            publish_name = UNSET
        else:
            publish_name = self.publish_name

        change_description: None | str | Unset
        if isinstance(self.change_description, Unset):
            change_description = UNSET
        else:
            change_description = self.change_description

        workflow_definition: dict[str, Any] | None | Unset
        if isinstance(self.workflow_definition, Unset):
            workflow_definition = UNSET
        elif isinstance(self.workflow_definition, PublishVersionRequestWorkflowDefinitionType0):
            workflow_definition = self.workflow_definition.to_dict()
        else:
            workflow_definition = self.workflow_definition

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if publish_name is not UNSET:
            field_dict["publish_name"] = publish_name
        if change_description is not UNSET:
            field_dict["change_description"] = change_description
        if workflow_definition is not UNSET:
            field_dict["workflow_definition"] = workflow_definition

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.publish_version_request_workflow_definition_type_0 import (
            PublishVersionRequestWorkflowDefinitionType0,
        )

        d = dict(src_dict)

        def _parse_publish_name(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        publish_name = _parse_publish_name(d.pop("publish_name", UNSET))

        def _parse_change_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        change_description = _parse_change_description(d.pop("change_description", UNSET))

        def _parse_workflow_definition(data: object) -> None | PublishVersionRequestWorkflowDefinitionType0 | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                workflow_definition_type_0 = PublishVersionRequestWorkflowDefinitionType0.from_dict(data)

                return workflow_definition_type_0
            except (TypeError, ValueError, AttributeError, KeyError):
                pass
            return cast(None | PublishVersionRequestWorkflowDefinitionType0 | Unset, data)

        workflow_definition = _parse_workflow_definition(d.pop("workflow_definition", UNSET))

        publish_version_request = cls(
            publish_name=publish_name,
            change_description=change_description,
            workflow_definition=workflow_definition,
        )

        publish_version_request.additional_properties = d
        return publish_version_request

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
