from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="AAPJobTemplateDetail")


@_attrs_define
class AAPJobTemplateDetail:
    """AAP job template with prompt-on-launch capabilities.

    Attributes:
        id (int):
        name (str):
        description (None | str | Unset):
        url (None | str | Unset): Link to the job template in AAP Controller UI
        ask_job_type_on_launch (bool | Unset):  Default: False.
        ask_inventory_on_launch (bool | Unset):  Default: False.
        ask_credential_on_launch (bool | Unset):  Default: False.
        ask_variables_on_launch (bool | Unset):  Default: False.
        ask_limit_on_launch (bool | Unset):  Default: False.
        ask_tags_on_launch (bool | Unset):  Default: False.
        ask_skip_tags_on_launch (bool | Unset):  Default: False.
        ask_verbosity_on_launch (bool | Unset):  Default: False.
        ask_diff_mode_on_launch (bool | Unset):  Default: False.
        ask_forks_on_launch (bool | Unset):  Default: False.
        ask_job_slice_count_on_launch (bool | Unset):  Default: False.
        ask_execution_environment_on_launch (bool | Unset):  Default: False.
        ask_instance_groups_on_launch (bool | Unset):  Default: False.
        ask_labels_on_launch (bool | Unset):  Default: False.
        ask_timeout_on_launch (bool | Unset):  Default: False.
        ask_scm_branch_on_launch (bool | Unset):  Default: False.
        survey_enabled (bool | Unset):  Default: False.
    """

    id: int
    name: str
    description: None | str | Unset = UNSET
    url: None | str | Unset = UNSET
    ask_job_type_on_launch: bool | Unset = False
    ask_inventory_on_launch: bool | Unset = False
    ask_credential_on_launch: bool | Unset = False
    ask_variables_on_launch: bool | Unset = False
    ask_limit_on_launch: bool | Unset = False
    ask_tags_on_launch: bool | Unset = False
    ask_skip_tags_on_launch: bool | Unset = False
    ask_verbosity_on_launch: bool | Unset = False
    ask_diff_mode_on_launch: bool | Unset = False
    ask_forks_on_launch: bool | Unset = False
    ask_job_slice_count_on_launch: bool | Unset = False
    ask_execution_environment_on_launch: bool | Unset = False
    ask_instance_groups_on_launch: bool | Unset = False
    ask_labels_on_launch: bool | Unset = False
    ask_timeout_on_launch: bool | Unset = False
    ask_scm_branch_on_launch: bool | Unset = False
    survey_enabled: bool | Unset = False
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        description: None | str | Unset
        if isinstance(self.description, Unset):
            description = UNSET
        else:
            description = self.description

        url: None | str | Unset
        if isinstance(self.url, Unset):
            url = UNSET
        else:
            url = self.url

        ask_job_type_on_launch = self.ask_job_type_on_launch

        ask_inventory_on_launch = self.ask_inventory_on_launch

        ask_credential_on_launch = self.ask_credential_on_launch

        ask_variables_on_launch = self.ask_variables_on_launch

        ask_limit_on_launch = self.ask_limit_on_launch

        ask_tags_on_launch = self.ask_tags_on_launch

        ask_skip_tags_on_launch = self.ask_skip_tags_on_launch

        ask_verbosity_on_launch = self.ask_verbosity_on_launch

        ask_diff_mode_on_launch = self.ask_diff_mode_on_launch

        ask_forks_on_launch = self.ask_forks_on_launch

        ask_job_slice_count_on_launch = self.ask_job_slice_count_on_launch

        ask_execution_environment_on_launch = self.ask_execution_environment_on_launch

        ask_instance_groups_on_launch = self.ask_instance_groups_on_launch

        ask_labels_on_launch = self.ask_labels_on_launch

        ask_timeout_on_launch = self.ask_timeout_on_launch

        ask_scm_branch_on_launch = self.ask_scm_branch_on_launch

        survey_enabled = self.survey_enabled

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "id": id,
                "name": name,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if url is not UNSET:
            field_dict["url"] = url
        if ask_job_type_on_launch is not UNSET:
            field_dict["ask_job_type_on_launch"] = ask_job_type_on_launch
        if ask_inventory_on_launch is not UNSET:
            field_dict["ask_inventory_on_launch"] = ask_inventory_on_launch
        if ask_credential_on_launch is not UNSET:
            field_dict["ask_credential_on_launch"] = ask_credential_on_launch
        if ask_variables_on_launch is not UNSET:
            field_dict["ask_variables_on_launch"] = ask_variables_on_launch
        if ask_limit_on_launch is not UNSET:
            field_dict["ask_limit_on_launch"] = ask_limit_on_launch
        if ask_tags_on_launch is not UNSET:
            field_dict["ask_tags_on_launch"] = ask_tags_on_launch
        if ask_skip_tags_on_launch is not UNSET:
            field_dict["ask_skip_tags_on_launch"] = ask_skip_tags_on_launch
        if ask_verbosity_on_launch is not UNSET:
            field_dict["ask_verbosity_on_launch"] = ask_verbosity_on_launch
        if ask_diff_mode_on_launch is not UNSET:
            field_dict["ask_diff_mode_on_launch"] = ask_diff_mode_on_launch
        if ask_forks_on_launch is not UNSET:
            field_dict["ask_forks_on_launch"] = ask_forks_on_launch
        if ask_job_slice_count_on_launch is not UNSET:
            field_dict["ask_job_slice_count_on_launch"] = ask_job_slice_count_on_launch
        if ask_execution_environment_on_launch is not UNSET:
            field_dict["ask_execution_environment_on_launch"] = ask_execution_environment_on_launch
        if ask_instance_groups_on_launch is not UNSET:
            field_dict["ask_instance_groups_on_launch"] = ask_instance_groups_on_launch
        if ask_labels_on_launch is not UNSET:
            field_dict["ask_labels_on_launch"] = ask_labels_on_launch
        if ask_timeout_on_launch is not UNSET:
            field_dict["ask_timeout_on_launch"] = ask_timeout_on_launch
        if ask_scm_branch_on_launch is not UNSET:
            field_dict["ask_scm_branch_on_launch"] = ask_scm_branch_on_launch
        if survey_enabled is not UNSET:
            field_dict["survey_enabled"] = survey_enabled

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        d = dict(src_dict)
        id = d.pop("id")

        name = d.pop("name")

        def _parse_description(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        description = _parse_description(d.pop("description", UNSET))

        def _parse_url(data: object) -> None | str | Unset:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(None | str | Unset, data)

        url = _parse_url(d.pop("url", UNSET))

        ask_job_type_on_launch = d.pop("ask_job_type_on_launch", UNSET)

        ask_inventory_on_launch = d.pop("ask_inventory_on_launch", UNSET)

        ask_credential_on_launch = d.pop("ask_credential_on_launch", UNSET)

        ask_variables_on_launch = d.pop("ask_variables_on_launch", UNSET)

        ask_limit_on_launch = d.pop("ask_limit_on_launch", UNSET)

        ask_tags_on_launch = d.pop("ask_tags_on_launch", UNSET)

        ask_skip_tags_on_launch = d.pop("ask_skip_tags_on_launch", UNSET)

        ask_verbosity_on_launch = d.pop("ask_verbosity_on_launch", UNSET)

        ask_diff_mode_on_launch = d.pop("ask_diff_mode_on_launch", UNSET)

        ask_forks_on_launch = d.pop("ask_forks_on_launch", UNSET)

        ask_job_slice_count_on_launch = d.pop("ask_job_slice_count_on_launch", UNSET)

        ask_execution_environment_on_launch = d.pop("ask_execution_environment_on_launch", UNSET)

        ask_instance_groups_on_launch = d.pop("ask_instance_groups_on_launch", UNSET)

        ask_labels_on_launch = d.pop("ask_labels_on_launch", UNSET)

        ask_timeout_on_launch = d.pop("ask_timeout_on_launch", UNSET)

        ask_scm_branch_on_launch = d.pop("ask_scm_branch_on_launch", UNSET)

        survey_enabled = d.pop("survey_enabled", UNSET)

        aap_job_template_detail = cls(
            id=id,
            name=name,
            description=description,
            url=url,
            ask_job_type_on_launch=ask_job_type_on_launch,
            ask_inventory_on_launch=ask_inventory_on_launch,
            ask_credential_on_launch=ask_credential_on_launch,
            ask_variables_on_launch=ask_variables_on_launch,
            ask_limit_on_launch=ask_limit_on_launch,
            ask_tags_on_launch=ask_tags_on_launch,
            ask_skip_tags_on_launch=ask_skip_tags_on_launch,
            ask_verbosity_on_launch=ask_verbosity_on_launch,
            ask_diff_mode_on_launch=ask_diff_mode_on_launch,
            ask_forks_on_launch=ask_forks_on_launch,
            ask_job_slice_count_on_launch=ask_job_slice_count_on_launch,
            ask_execution_environment_on_launch=ask_execution_environment_on_launch,
            ask_instance_groups_on_launch=ask_instance_groups_on_launch,
            ask_labels_on_launch=ask_labels_on_launch,
            ask_timeout_on_launch=ask_timeout_on_launch,
            ask_scm_branch_on_launch=ask_scm_branch_on_launch,
            survey_enabled=survey_enabled,
        )

        aap_job_template_detail.additional_properties = d
        return aap_job_template_detail

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
