"""Unit tests for _extract_request_id."""

from uuid import UUID, uuid4

import pytest

from nexus.agent_orchestrator.executor.invocation_executor import _extract_request_id


class TestExtractRequestId:
    """Tests for _extract_request_id helper."""

    def test_valid_uuid_in_metadata(self) -> None:
        uid = uuid4()
        context_data: dict[str, object] = {"metadata": {"request_id": str(uid)}}
        assert _extract_request_id(context_data) == uid

    def test_missing_metadata_key(self) -> None:
        assert _extract_request_id({}) is None

    def test_metadata_not_a_dict(self) -> None:
        assert _extract_request_id({"metadata": "not-a-dict"}) is None

    def test_missing_request_id_in_metadata(self) -> None:
        assert _extract_request_id({"metadata": {}}) is None

    def test_empty_string_request_id(self) -> None:
        assert _extract_request_id({"metadata": {"request_id": ""}}) is None

    def test_invalid_uuid_string(self) -> None:
        assert _extract_request_id({"metadata": {"request_id": "not-a-uuid"}}) is None

    def test_non_string_request_id(self) -> None:
        assert _extract_request_id({"metadata": {"request_id": 12345}}) is None

    @pytest.mark.parametrize(
        "rid",
        [
            "550e8400-e29b-41d4-a716-446655440000",
            "550e8400e29b41d4a716446655440000",
        ],
        ids=["hyphenated", "compact"],
    )
    def test_uuid_formats(self, rid: str) -> None:
        result = _extract_request_id({"metadata": {"request_id": rid}})
        assert isinstance(result, UUID)
