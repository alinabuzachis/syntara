from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
    from ..models.batch_approval_decision import BatchApprovalDecision


T = TypeVar("T", bound="BatchApprovalRequest")


@_attrs_define
class BatchApprovalRequest:
    """Request payload for submitting multiple approval decisions at once.

    Attributes:
        decisions (list[BatchApprovalDecision]): List of approval decisions to submit
    """

    decisions: list[BatchApprovalDecision]
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        decisions = []
        for decisions_item_data in self.decisions:
            decisions_item = decisions_item_data.to_dict()
            decisions.append(decisions_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "decisions": decisions,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
        from ..models.batch_approval_decision import BatchApprovalDecision

        d = dict(src_dict)
        decisions = []
        _decisions = d.pop("decisions")
        for decisions_item_data in _decisions:
            decisions_item = BatchApprovalDecision.from_dict(decisions_item_data)

            decisions.append(decisions_item)

        batch_approval_request = cls(
            decisions=decisions,
        )

        batch_approval_request.additional_properties = d
        return batch_approval_request

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
