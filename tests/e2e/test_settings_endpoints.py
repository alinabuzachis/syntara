"""E2E tests for settings API endpoints."""

from __future__ import annotations

import asyncio
from http import HTTPStatus
from typing import TYPE_CHECKING, Any

import pytest
from nexus_api_client.models.error_data import ErrorData
from nexus_api_client.models.runtime_setting_read import RuntimeSettingRead
from nexus_api_client.models.setting_bulk_update_item import SettingBulkUpdateItem
from nexus_api_client.models.setting_bulk_update_request import SettingBulkUpdateRequest
from nexus_api_client.models.setting_update import SettingUpdate

from nexus.core.config.base import get_settings
from tests.e2e.helpers import _retry_api_call, poll_audit_events

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.e2e

_LOG_LEVEL_KEY = "logging.log_level"
_MAX_TOKENS_KEY = "context_manager.max_total_tokens"
_GROUNDING_SCORE_KEY = "context_manager.required_grounding_score"
_ENABLE_HYBRID_KEY = "context_manager.enable_hybrid_search"
_COMPRESSION_TEMP_KEY = "context_manager.compression_temperature"
_TIMEOUT_SECONDS_KEY = "document_conversion.timeout_seconds"
_SCRIPT_TIMEOUT_KEY = "workflow_engine.script_timeout_seconds"
_OVERWRITE_KEY = "document_conversion.overwrite_existing"
_RETRIEVER_MODEL_KEY = "retriever.llm_model"


def _get_setting(api: NexusApiRegistry, key: str) -> RuntimeSettingRead:
    """Get a single setting, asserting success."""
    resp = _retry_api_call(lambda: api.settings.get(key=key))
    assert resp.status_code == HTTPStatus.OK
    assert isinstance(resp.parsed, RuntimeSettingRead)
    return resp.parsed


def _update_setting(
    api: NexusApiRegistry,
    key: str,
    value: object,
    *,
    expected_version: int | None = None,
) -> RuntimeSettingRead:
    """Update a single setting, asserting success."""
    body = SettingUpdate(value=value)
    if expected_version is not None:
        body.expected_version = expected_version
    resp = _retry_api_call(lambda: api.settings.update(key=key, body=body))
    assert resp.status_code == HTTPStatus.OK
    assert isinstance(resp.parsed, RuntimeSettingRead)
    return resp.parsed


def _restore_setting(api: NexusApiRegistry, key: str, value: object) -> None:
    """Restore a setting to a previous value (best-effort, no assertions)."""
    api.settings.update(key=key, body=SettingUpdate(value=value))


def _find_audit_event_by_key(events: list[Any], key: str) -> Any:  # noqa: ANN401
    """Return the first audit event whose setting field matches *key*."""
    for event in events:
        props = event.structured_data.additional_properties
        if props.get("setting") == key:
            return event
    return None


def _find_audit_event_by_key_and_version(
    events: list[Any],
    key: str,
    min_version: int,
) -> Any:  # noqa: ANN401
    """Return the first audit event matching key with version >= min_version."""
    for event in events:
        props = event.structured_data.additional_properties
        if props.get("setting") == key and props.get("version", 0) >= min_version:
            return event
    return None


def _find_bulk_audit_event(events: list[Any], expected_keys: set[str]) -> Any:  # noqa: ANN401
    """Return the first bulk audit event matching exactly *expected_keys*."""
    for event in events:
        props = event.structured_data.additional_properties
        settings = set(props.get("settings", []))
        if settings == expected_keys:
            return event
    return None


@pytest.mark.xdist_group("settings_write")
class TestSettings:
    """E2E tests for settings GET and PATCH endpoints."""

    def test_list_settings(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings returns 200 with resources containing required fields."""
        resp = nexus_api.settings.list()

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        settings = resp.parsed.resources
        assert len(settings) > 0
        for setting in settings:
            assert setting.key
            assert setting.effective_value is not None
            assert setting.value_type is not None
            assert setting.category
            assert setting.version is not None

    def test_list_categories(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings/categories returns 200 with all expected categories."""
        resp = nexus_api.settings.list_categories()

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        categories = resp.parsed.results
        assert len(categories) > 0
        slugs = [cat.slug for cat in categories]
        for expected in ("ai_llm", "system", "context_manager", "workflow_execution", "application"):
            assert expected in slugs
        for cat in categories:
            assert cat.slug
            assert cat.name
            assert cat.group_names is not None

    def test_get_setting(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings/{key} returns a specific setting with full metadata."""
        setting = _get_setting(nexus_api, _MAX_TOKENS_KEY)

        assert setting.key == _MAX_TOKENS_KEY
        assert setting.effective_value is not None
        assert setting.default_value is not None
        assert setting.value_type is not None
        assert setting.category
        assert setting.version is not None
        assert setting.validation_schema is not None

    def test_update_setting(self, nexus_api: NexusApiRegistry) -> None:
        """PATCH /settings/{key} updates a setting and persists on re-read."""
        original_value = _get_setting(nexus_api, _MAX_TOKENS_KEY).effective_value

        try:
            updated = _update_setting(nexus_api, _MAX_TOKENS_KEY, 6666)
            assert updated.effective_value == 6666

            reread = _get_setting(nexus_api, _MAX_TOKENS_KEY)
            assert reread.effective_value == 6666
        finally:
            _restore_setting(nexus_api, _MAX_TOKENS_KEY, original_value)


@pytest.mark.xdist_group("settings_write")
class TestLogLevelSetting:
    """E2E tests for the logging.log_level runtime setting."""

    def test_get_log_level(self, nexus_api: NexusApiRegistry) -> None:
        """Admin can read the log level setting with expected metadata."""
        setting = _get_setting(nexus_api, _LOG_LEVEL_KEY)

        assert setting.key == _LOG_LEVEL_KEY
        assert setting.requires_restart is False
        assert setting.effective_value in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL")

    def test_update_log_level(self, nexus_api: NexusApiRegistry) -> None:
        """Admin can change the log level and the update persists on re-read."""
        original_value = _get_setting(nexus_api, _LOG_LEVEL_KEY).effective_value

        try:
            updated = _update_setting(nexus_api, _LOG_LEVEL_KEY, "DEBUG")
            assert updated.effective_value == "DEBUG"

            reread = _get_setting(nexus_api, _LOG_LEVEL_KEY)
            assert reread.effective_value == "DEBUG"
        finally:
            _restore_setting(nexus_api, _LOG_LEVEL_KEY, original_value)

    def test_update_log_level_rejects_invalid(self, nexus_api: NexusApiRegistry) -> None:
        """Updating log level with an invalid value returns 422."""
        resp = nexus_api.settings.update(key=_LOG_LEVEL_KEY, body=SettingUpdate(value="INVALID"))

        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


class TestNewSettings:
    """E2E tests for runtime settings catalog entries."""

    def test_new_categories_appear(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings/categories includes ai_llm, workflow_execution, application."""
        resp = nexus_api.settings.list_categories()

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        slugs = [cat.slug for cat in resp.parsed.results]
        assert "ai_llm" in slugs
        assert "workflow_execution" in slugs
        assert "application" in slugs

    def test_workflow_setting_exists(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings/{key} returns a workflow execution setting."""
        setting = _get_setting(nexus_api, _SCRIPT_TIMEOUT_KEY)

        assert setting.key == _SCRIPT_TIMEOUT_KEY
        assert setting.category == "workflow_execution"
        assert setting.value_type.value == "integer"
        assert setting.default_value == 300

    def test_retriever_setting_requires_restart(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings/retriever.llm_model shows requires_restart=True."""
        setting = _get_setting(nexus_api, _RETRIEVER_MODEL_KEY)
        assert setting.requires_restart is True

    def test_all_settings_have_requires_restart(self, nexus_api: NexusApiRegistry) -> None:
        """Every setting in the list response includes a requires_restart boolean."""
        resp = nexus_api.settings.list()

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        for setting in resp.parsed.resources:
            assert isinstance(setting.requires_restart, bool)

    def test_constraint_validation_rejects_invalid(self, nexus_api: NexusApiRegistry) -> None:
        """PATCH with out-of-range value returns 422."""
        resp = nexus_api.settings.update(key=_TIMEOUT_SECONDS_KEY, body=SettingUpdate(value=999))

        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


class TestAuditorSettingsAccess:
    """E2E tests verifying auditor users have read-only access to settings."""

    def test_auditor_can_list_settings(self, auditor_api: NexusApiRegistry) -> None:
        """Auditor can list all settings."""
        resp = auditor_api.settings.list()

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        assert len(resp.parsed.resources) > 0

    def test_auditor_can_get_setting(self, auditor_api: NexusApiRegistry) -> None:
        """Auditor can read a specific setting."""
        resp = auditor_api.settings.get(key=_MAX_TOKENS_KEY)

        assert resp.status_code == HTTPStatus.OK
        assert isinstance(resp.parsed, RuntimeSettingRead)
        assert resp.parsed.key == _MAX_TOKENS_KEY

    def test_auditor_can_list_categories(self, auditor_api: NexusApiRegistry) -> None:
        """Auditor can list setting categories."""
        resp = auditor_api.settings.list_categories()

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        assert len(resp.parsed.results) > 0

    def test_auditor_cannot_update_setting(self, auditor_api: NexusApiRegistry) -> None:
        """Auditor is denied access to update a setting."""
        resp = auditor_api.settings.update(key=_LOG_LEVEL_KEY, body=SettingUpdate(value="DEBUG"))

        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_auditor_cannot_bulk_update(self, auditor_api: NexusApiRegistry) -> None:
        """Auditor is denied access to bulk update settings."""
        resp = auditor_api.settings.bulk_update(
            body=SettingBulkUpdateRequest(updates=[SettingBulkUpdateItem(key=_LOG_LEVEL_KEY, value="DEBUG")])
        )

        assert resp.status_code == HTTPStatus.FORBIDDEN


class TestSettingsAuthorization:
    """E2E tests verifying non-admin users cannot access settings."""

    def test_viewer_cannot_list_settings(self, viewer_api: NexusApiRegistry) -> None:
        """Non-admin user is denied access to list settings."""
        resp = viewer_api.settings.list()
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_viewer_cannot_get_setting(self, viewer_api: NexusApiRegistry) -> None:
        """Non-admin user is denied access to read a specific setting."""
        resp = viewer_api.settings.get(key=_LOG_LEVEL_KEY)
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_viewer_cannot_update_setting(self, viewer_api: NexusApiRegistry) -> None:
        """Non-admin user is denied access to update a setting."""
        resp = viewer_api.settings.update(key=_LOG_LEVEL_KEY, body=SettingUpdate(value="DEBUG"))
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_viewer_cannot_bulk_update(self, viewer_api: NexusApiRegistry) -> None:
        """Non-admin user is denied access to bulk update settings."""
        resp = viewer_api.settings.bulk_update(
            body=SettingBulkUpdateRequest(updates=[SettingBulkUpdateItem(key=_LOG_LEVEL_KEY, value="DEBUG")])
        )
        assert resp.status_code == HTTPStatus.FORBIDDEN

    def test_viewer_cannot_list_categories(self, viewer_api: NexusApiRegistry) -> None:
        """Non-admin user is denied access to list setting categories."""
        resp = viewer_api.settings.list_categories()
        assert resp.status_code == HTTPStatus.FORBIDDEN


class TestSettingsFiltering:
    """E2E tests for filtering settings by category and group."""

    def test_filter_by_category(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings?category= returns only settings in that category."""
        resp = nexus_api.settings.list(category="context_manager")

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        settings = resp.parsed.resources
        assert len(settings) > 0
        for setting in settings:
            assert setting.category == "context_manager"

    def test_filter_by_category_and_group(self, nexus_api: NexusApiRegistry) -> None:
        """GET /settings?category=&group= returns only matching settings."""
        resp = nexus_api.settings.list(category="context_manager", group="Compression")

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed is not None
        settings = resp.parsed.resources
        assert len(settings) > 0
        for setting in settings:
            assert setting.category == "context_manager"
            assert setting.group == "Compression"


class TestSettingsPagination:
    """E2E tests for cursor-based pagination of settings."""

    def test_pagination_no_overlap(self, nexus_api: NexusApiRegistry) -> None:
        """Paginated pages do not contain overlapping settings."""
        # sort by -created_at to align with the cursor's (created_at, id) keyset
        page1 = nexus_api.settings.list(limit=5, sort="-created_at")
        assert page1.status_code == HTTPStatus.OK
        assert page1.parsed is not None
        assert len(page1.parsed.resources) == 5
        assert page1.parsed.next_ is not None

        page2 = nexus_api.settings.list(limit=5, sort="-created_at", cursor=page1.parsed.next_)
        assert page2.status_code == HTTPStatus.OK
        assert page2.parsed is not None
        assert len(page2.parsed.resources) > 0

        page1_keys = {s.key for s in page1.parsed.resources}
        page2_keys = {s.key for s in page2.parsed.resources}
        assert page1_keys.isdisjoint(page2_keys)


class TestSettingsGetErrors:
    """E2E tests for error responses on GET /settings/{key}."""

    def test_get_nonexistent_setting_404(self, nexus_api: NexusApiRegistry) -> None:
        """Requesting a nonexistent setting key returns 404."""
        resp = nexus_api.settings.get(key="nonexistent.setting.key")
        assert resp.status_code == HTTPStatus.NOT_FOUND

    def test_get_invalid_key_format_400(self, nexus_api: NexusApiRegistry) -> None:
        """Requesting a setting with an invalid key format returns 400."""
        resp = nexus_api.settings.get(key="INVALID")
        assert resp.status_code == HTTPStatus.BAD_REQUEST


class TestSettingsValidation:
    """E2E tests for setting value validation on PATCH."""

    def test_float_above_max(self, nexus_api: NexusApiRegistry) -> None:
        """Float value above max constraint returns 422."""
        resp = nexus_api.settings.update(key=_GROUNDING_SCORE_KEY, body=SettingUpdate(value=1.5))
        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY

    def test_float_below_min(self, nexus_api: NexusApiRegistry) -> None:
        """Float value below min constraint returns 422."""
        resp = nexus_api.settings.update(key=_GROUNDING_SCORE_KEY, body=SettingUpdate(value=-0.1))
        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY

    def test_wrong_type_string_for_boolean(self, nexus_api: NexusApiRegistry) -> None:
        """String value for a boolean setting returns 422."""
        resp = nexus_api.settings.update(key=_ENABLE_HYBRID_KEY, body=SettingUpdate(value="yes"))
        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY

    def test_boolean_for_integer(self, nexus_api: NexusApiRegistry) -> None:
        """Boolean value for an integer setting returns 422."""
        resp = nexus_api.settings.update(key=_MAX_TOKENS_KEY, body=SettingUpdate(value=True))
        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY

    def test_integer_below_min(self, nexus_api: NexusApiRegistry) -> None:
        """Integer value below min constraint returns 422 with descriptive message."""
        resp = nexus_api.settings.update(key=_MAX_TOKENS_KEY, body=SettingUpdate(value=0))

        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
        assert isinstance(resp.parsed, ErrorData)
        assert "must be >= 1" in resp.parsed.detail

    def test_null_value_rejected(self, nexus_api: NexusApiRegistry) -> None:
        """Null value returns 422 with guidance to use default_value."""
        resp = nexus_api.settings.update(key=_LOG_LEVEL_KEY, body=SettingUpdate(value=None))

        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY
        assert isinstance(resp.parsed, ErrorData)
        assert "default_value" in resp.parsed.detail

    def test_nonexistent_key_on_update(self, nexus_api: NexusApiRegistry) -> None:
        """Updating a nonexistent setting key returns 404."""
        resp = nexus_api.settings.update(key="nonexistent.setting.key", body=SettingUpdate(value=42))
        assert resp.status_code == HTTPStatus.NOT_FOUND

    def test_oversized_value(self, nexus_api: NexusApiRegistry) -> None:
        """Value exceeding 64KB returns 422."""
        resp = nexus_api.settings.update(key=_RETRIEVER_MODEL_KEY, body=SettingUpdate(value="x" * 70_000))
        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY


@pytest.mark.xdist_group("settings_write")
class TestSettingsResetToDefault:
    """E2E tests for resetting a setting to its default value."""

    def test_reset_to_default(self, nexus_api: NexusApiRegistry) -> None:
        """Setting can be reset by PATCHing with its default_value."""
        original_value = _get_setting(nexus_api, _MAX_TOKENS_KEY).effective_value

        try:
            _update_setting(nexus_api, _MAX_TOKENS_KEY, 9999)
            default_value = _get_setting(nexus_api, _MAX_TOKENS_KEY).default_value
            _update_setting(nexus_api, _MAX_TOKENS_KEY, default_value)

            result = _get_setting(nexus_api, _MAX_TOKENS_KEY)
            assert result.effective_value == default_value
        finally:
            _restore_setting(nexus_api, _MAX_TOKENS_KEY, original_value)


@pytest.mark.xdist_group("settings_write")
class TestSettingsBulkUpdate:
    """E2E tests for the bulk update endpoint PATCH /settings."""

    def test_bulk_update_happy_path(self, nexus_api: NexusApiRegistry) -> None:
        """Bulk update across categories succeeds and persists."""
        keys = [_MAX_TOKENS_KEY, _SCRIPT_TIMEOUT_KEY, _TIMEOUT_SECONDS_KEY]
        originals = {k: _get_setting(nexus_api, k).effective_value for k in keys}

        try:
            resp = nexus_api.settings.bulk_update(
                body=SettingBulkUpdateRequest(
                    updates=[
                        SettingBulkUpdateItem(key=_MAX_TOKENS_KEY, value=5000),
                        SettingBulkUpdateItem(key=_SCRIPT_TIMEOUT_KEY, value=60),
                        SettingBulkUpdateItem(key=_TIMEOUT_SECONDS_KEY, value=15),
                    ]
                )
            )
            assert resp.status_code == HTTPStatus.OK
            assert isinstance(resp.parsed, list)
            assert len(resp.parsed) == 3

            for key, expected in [
                (_MAX_TOKENS_KEY, 5000),
                (_SCRIPT_TIMEOUT_KEY, 60),
                (_TIMEOUT_SECONDS_KEY, 15),
            ]:
                assert _get_setting(nexus_api, key).effective_value == expected
        finally:
            for k, v in originals.items():
                _restore_setting(nexus_api, k, v)

    def test_bulk_update_all_or_nothing(self, nexus_api: NexusApiRegistry) -> None:
        """If any item in a bulk update fails validation, no settings change."""
        original_tokens = _get_setting(nexus_api, _MAX_TOKENS_KEY).effective_value
        original_grounding = _get_setting(nexus_api, _GROUNDING_SCORE_KEY).effective_value

        try:
            resp = nexus_api.settings.bulk_update(
                body=SettingBulkUpdateRequest(
                    updates=[
                        SettingBulkUpdateItem(key=_MAX_TOKENS_KEY, value=5000),
                        SettingBulkUpdateItem(key=_GROUNDING_SCORE_KEY, value=999.0),
                    ]
                )
            )
            assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY

            assert _get_setting(nexus_api, _MAX_TOKENS_KEY).effective_value == original_tokens
            assert _get_setting(nexus_api, _GROUNDING_SCORE_KEY).effective_value == original_grounding
        finally:
            _restore_setting(nexus_api, _MAX_TOKENS_KEY, original_tokens)
            _restore_setting(nexus_api, _GROUNDING_SCORE_KEY, original_grounding)

    def test_bulk_update_duplicate_keys(self, nexus_api: NexusApiRegistry) -> None:
        """Bulk update with duplicate keys returns 400 with message."""
        resp = nexus_api.settings.bulk_update(
            body=SettingBulkUpdateRequest(
                updates=[
                    SettingBulkUpdateItem(key=_MAX_TOKENS_KEY, value=1000),
                    SettingBulkUpdateItem(key=_MAX_TOKENS_KEY, value=2000),
                ]
            )
        )

        assert resp.status_code == HTTPStatus.BAD_REQUEST
        assert isinstance(resp.parsed, ErrorData)
        assert "duplicate" in resp.parsed.detail.lower()

    def test_bulk_update_empty_list(self, nexus_api: NexusApiRegistry) -> None:
        """Bulk update with empty updates list returns 200."""
        resp = nexus_api.settings.bulk_update(body=SettingBulkUpdateRequest(updates=[]))

        assert resp.status_code == HTTPStatus.OK
        assert resp.parsed == []

    def test_bulk_update_exceeds_limit(self, nexus_api: NexusApiRegistry) -> None:
        """Bulk update with more than 500 items returns 422."""
        updates = [SettingBulkUpdateItem(key=f"fake.key_{i}", value=i) for i in range(501)]
        resp = nexus_api.settings.bulk_update(body=SettingBulkUpdateRequest(updates=updates))

        assert resp.status_code == HTTPStatus.UNPROCESSABLE_ENTITY

    def test_bulk_update_version_conflict(self, nexus_api: NexusApiRegistry) -> None:
        """Bulk update with a stale version returns 409 and no settings change."""
        setting_a = _get_setting(nexus_api, _MAX_TOKENS_KEY)
        setting_b = _get_setting(nexus_api, _COMPRESSION_TEMP_KEY)
        original_a = setting_a.effective_value

        try:
            incremented = _update_setting(nexus_api, _COMPRESSION_TEMP_KEY, 0.5, expected_version=setting_b.version)

            resp = nexus_api.settings.bulk_update(
                body=SettingBulkUpdateRequest(
                    updates=[
                        SettingBulkUpdateItem(key=_MAX_TOKENS_KEY, value=7777),
                        SettingBulkUpdateItem(
                            key=_COMPRESSION_TEMP_KEY,
                            value=0.9,
                            expected_version=setting_b.version,
                        ),
                    ]
                )
            )
            assert resp.status_code == HTTPStatus.CONFLICT
            assert isinstance(resp.parsed, ErrorData)
            assert resp.parsed.code == "SETTING_VERSION_CONFLICT"

            assert _get_setting(nexus_api, _MAX_TOKENS_KEY).effective_value == original_a
            assert _get_setting(nexus_api, _COMPRESSION_TEMP_KEY).effective_value == incremented.effective_value
        finally:
            _restore_setting(nexus_api, _MAX_TOKENS_KEY, original_a)
            _restore_setting(nexus_api, _COMPRESSION_TEMP_KEY, setting_b.effective_value)


@pytest.mark.xdist_group("settings_write")
class TestSettingsOptimisticLocking:
    """E2E tests for optimistic locking via expected_version."""

    def test_correct_version(self, nexus_api: NexusApiRegistry) -> None:
        """Update with correct expected_version succeeds and increments version."""
        setting = _get_setting(nexus_api, _COMPRESSION_TEMP_KEY)
        original_value = setting.effective_value
        version_n = setting.version

        try:
            updated = _update_setting(nexus_api, _COMPRESSION_TEMP_KEY, 0.5, expected_version=version_n)
            assert updated.version == version_n + 1
        finally:
            _restore_setting(nexus_api, _COMPRESSION_TEMP_KEY, original_value)

    def test_stale_version(self, nexus_api: NexusApiRegistry) -> None:
        """Update with stale expected_version returns 409."""
        setting = _get_setting(nexus_api, _COMPRESSION_TEMP_KEY)
        original_value = setting.effective_value
        version_n = setting.version

        try:
            _update_setting(nexus_api, _COMPRESSION_TEMP_KEY, 0.5, expected_version=version_n)

            resp = nexus_api.settings.update(
                key=_COMPRESSION_TEMP_KEY,
                body=SettingUpdate(value=0.9, expected_version=version_n),
            )
            assert resp.status_code == HTTPStatus.CONFLICT
            assert isinstance(resp.parsed, ErrorData)
            assert resp.parsed.code == "SETTING_VERSION_CONFLICT"
        finally:
            _restore_setting(nexus_api, _COMPRESSION_TEMP_KEY, original_value)

    def test_without_expected_version(self, nexus_api: NexusApiRegistry) -> None:
        """Update without expected_version succeeds and increments version."""
        setting = _get_setting(nexus_api, _COMPRESSION_TEMP_KEY)
        original_value = setting.effective_value
        version_n = setting.version

        try:
            updated = _update_setting(nexus_api, _COMPRESSION_TEMP_KEY, 0.5)
            assert updated.version == version_n + 1
        finally:
            _restore_setting(nexus_api, _COMPRESSION_TEMP_KEY, original_value)


@pytest.mark.xdist_group("settings_write")
class TestAdminSettingsAccess:
    """E2E test verifying admin has full CRUD access to all settings endpoints."""

    def test_admin_full_access(self, nexus_api: NexusApiRegistry) -> None:
        """Admin can list, get, list categories, update, and bulk update settings."""
        assert nexus_api.settings.list().status_code == HTTPStatus.OK
        assert nexus_api.settings.list_categories().status_code == HTTPStatus.OK
        assert nexus_api.settings.get(key=_MAX_TOKENS_KEY).status_code == HTTPStatus.OK

        original = _get_setting(nexus_api, _MAX_TOKENS_KEY).effective_value
        try:
            assert (
                nexus_api.settings.update(key=_MAX_TOKENS_KEY, body=SettingUpdate(value=5555)).status_code
                == HTTPStatus.OK
            )
            assert (
                nexus_api.settings.bulk_update(
                    body=SettingBulkUpdateRequest(updates=[SettingBulkUpdateItem(key=_MAX_TOKENS_KEY, value=6666)])
                ).status_code
                == HTTPStatus.OK
            )
        finally:
            _restore_setting(nexus_api, _MAX_TOKENS_KEY, original)


@pytest.mark.xdist_group("settings_write")
class TestSettingsAuditLog:
    """E2E tests verifying audit events are created for settings changes."""

    async def test_audit_single_update(
        self,
        nexus_api: NexusApiRegistry,
        auditor_api: NexusApiRegistry,
    ) -> None:
        """Updating a setting creates an audit event with the correct structure."""
        original = _get_setting(nexus_api, _COMPRESSION_TEMP_KEY)
        original_value = original.effective_value
        version_before = original.version

        try:
            _update_setting(nexus_api, _COMPRESSION_TEMP_KEY, 0.5)

            # Sleep for full poll interval + buffer to ensure worker has run
            settings = get_settings()
            await asyncio.sleep(settings.audit_outbox_poll_interval_seconds * 3)

            # Retrieve MORE than batch_size to account for concurrent activity
            events = poll_audit_events(
                auditor_api,
                "setting_changed",
                resource_urn="urn:nexus:setting:context_manager.compression_temperature",
            )

            # Match on both key AND version for determinism
            event = _find_audit_event_by_key_and_version(
                events,
                _COMPRESSION_TEMP_KEY,
                min_version=version_before + 1,
            )

            assert event is not None, (
                f"No audit event found for key {_COMPRESSION_TEMP_KEY} with version > {version_before}"
            )
            assert event.actor_id is not None
            assert event.actor_username == "admin"
            assert event.created_at is not None
            assert event.event_action == "setting_changed"
            assert event.structured_data.data_type == "setting-changed"
            props = event.structured_data.additional_properties
            assert props["setting"] == _COMPRESSION_TEMP_KEY
            assert props["new_value"] == "0.5"
            assert "version" in props
        finally:
            _restore_setting(nexus_api, _COMPRESSION_TEMP_KEY, original_value)

    async def test_audit_bulk_update(
        self,
        nexus_api: NexusApiRegistry,
        auditor_api: NexusApiRegistry,
    ) -> None:
        """Bulk updating settings creates an audit event with the updates list."""
        originals = {
            _MAX_TOKENS_KEY: _get_setting(nexus_api, _MAX_TOKENS_KEY).effective_value,
            _TIMEOUT_SECONDS_KEY: _get_setting(nexus_api, _TIMEOUT_SECONDS_KEY).effective_value,
        }
        expected_keys = {_MAX_TOKENS_KEY, _TIMEOUT_SECONDS_KEY}

        try:
            nexus_api.settings.bulk_update(
                body=SettingBulkUpdateRequest(
                    updates=[
                        SettingBulkUpdateItem(key=_MAX_TOKENS_KEY, value=4444),
                        SettingBulkUpdateItem(key=_TIMEOUT_SECONDS_KEY, value=10),
                    ]
                )
            )

            # Sleep for poll interval + buffer
            settings = get_settings()
            await asyncio.sleep(settings.audit_outbox_poll_interval_seconds * 2)

            # Retrieve MORE events
            events = poll_audit_events(
                auditor_api,
                "setting_bulk_changed",
            )

            event = _find_bulk_audit_event(events, expected_keys)
            assert event is not None, f"No bulk audit event found with keys {expected_keys}"
            assert event.event_action == "setting_bulk_changed"
            props = event.structured_data.additional_properties
            assert _MAX_TOKENS_KEY in props["settings"]
            assert _TIMEOUT_SECONDS_KEY in props["settings"]
            assert props["change_count"] == 2
        finally:
            for k, v in originals.items():
                _restore_setting(nexus_api, k, v)

    async def test_audit_old_and_new_values(
        self,
        nexus_api: NexusApiRegistry,
        auditor_api: NexusApiRegistry,
    ) -> None:
        """Audit event captures distinct old_value and new_value for a setting change."""
        original = _get_setting(nexus_api, _COMPRESSION_TEMP_KEY)
        original_value = original.effective_value

        try:
            # Set a known value first so old_value is deterministic
            first = _update_setting(nexus_api, _COMPRESSION_TEMP_KEY, 0.3)
            first_version = first.version

            # Update to a different value
            _update_setting(nexus_api, _COMPRESSION_TEMP_KEY, 0.8)

            # Sleep for poll interval + buffer
            settings = get_settings()
            await asyncio.sleep(settings.audit_outbox_poll_interval_seconds * 2)

            # Retrieve MORE events
            events = poll_audit_events(
                auditor_api,
                "setting_changed",
                resource_urn="urn:nexus:setting:context_manager.compression_temperature",
            )

            # Find the event for the second update using version-based matching
            event = _find_audit_event_by_key_and_version(
                events,
                _COMPRESSION_TEMP_KEY,
                min_version=first_version + 1,
            )

            assert event is not None, (
                f"No audit event found for second update (key={_COMPRESSION_TEMP_KEY}, version > {first_version})"
            )
            props = event.structured_data.additional_properties
            assert props["old_value"] == "0.3", f"old_value should be '0.3', got '{props['old_value']}'"
            assert props["new_value"] == "0.8", f"new_value should be '0.8', got '{props['new_value']}'"
            assert props["old_value"] != props["new_value"]
        finally:
            _restore_setting(nexus_api, _COMPRESSION_TEMP_KEY, original_value)

    async def test_audit_reset_to_default(
        self,
        nexus_api: NexusApiRegistry,
        auditor_api: NexusApiRegistry,
    ) -> None:
        """Resetting a setting to default creates an audit event with the default value."""
        original = _get_setting(nexus_api, _MAX_TOKENS_KEY)
        original_value = original.effective_value
        default_value = original.default_value

        try:
            # First update to a non-default value
            first = _update_setting(nexus_api, _MAX_TOKENS_KEY, 9999)
            first_version = first.version

            # Then reset to default
            _update_setting(nexus_api, _MAX_TOKENS_KEY, default_value)

            # Sleep for poll interval + buffer
            settings = get_settings()
            await asyncio.sleep(settings.audit_outbox_poll_interval_seconds * 2)

            # Retrieve MORE events
            events = poll_audit_events(
                auditor_api,
                "setting_changed",
                resource_urn="urn:nexus:setting:context_manager.max_total_tokens",
            )

            # Find the reset event (version after first update)
            event = _find_audit_event_by_key_and_version(
                events,
                _MAX_TOKENS_KEY,
                min_version=first_version + 1,
            )

            assert event is not None, f"No audit event found for key {_MAX_TOKENS_KEY} with version > {first_version}"
            assert event.event_action == "setting_changed"
            props = event.structured_data.additional_properties
            assert props["new_value"] == str(default_value)
        finally:
            _restore_setting(nexus_api, _MAX_TOKENS_KEY, original_value)


@pytest.mark.xdist_group("settings_write")
class TestWorkflowExecutionSetting:
    """E2E tests for workflow execution settings."""

    def test_update_workflow_setting(self, nexus_api: NexusApiRegistry) -> None:
        """Update a workflow execution setting with full GET-PATCH-GET-restore flow."""
        original = _get_setting(nexus_api, _SCRIPT_TIMEOUT_KEY)
        original_value = original.effective_value

        assert original.category == "workflow_execution"
        assert original.value_type.value == "integer"

        try:
            updated = _update_setting(nexus_api, _SCRIPT_TIMEOUT_KEY, 60)
            assert updated.effective_value == 60

            reread = _get_setting(nexus_api, _SCRIPT_TIMEOUT_KEY)
            assert reread.effective_value == 60
        finally:
            _restore_setting(nexus_api, _SCRIPT_TIMEOUT_KEY, original_value)


@pytest.mark.xdist_group("settings_write")
class TestApplicationSetting:
    """E2E tests for application category settings."""

    def test_update_application_setting(self, nexus_api: NexusApiRegistry) -> None:
        """Update an application setting and verify persistence."""
        original = _get_setting(nexus_api, _OVERWRITE_KEY)
        original_value = original.effective_value

        assert original.category == "application"
        assert original.value_type.value == "boolean"

        try:
            updated = _update_setting(nexus_api, _OVERWRITE_KEY, value=True)
            assert updated.effective_value is True

            reread = _get_setting(nexus_api, _OVERWRITE_KEY)
            assert reread.effective_value is True
        finally:
            _restore_setting(nexus_api, _OVERWRITE_KEY, original_value)
