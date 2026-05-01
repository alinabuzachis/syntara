# ruff: noqa: S106
"""Unit tests for IdP group sync on OIDC login."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from nexus.auth.services.idp_group_sync import match_group_entries, sync_idp_groups
from nexus.core.models import User, UserIdentity
from nexus.identity_providers.models.identity_provider_configuration import (
    OIDCConfiguration,
    OIDCGroupMappingEntry,
    OIDCIdpType,
)
from nexus.identity_providers.models.idp_group_mapping import IdpGroupMappingEntry


@pytest.fixture(autouse=True)
def _mock_runtime_settings() -> Generator[AsyncMock, None, None]:
    """Mock get_runtime_settings so auto-create tests don't need a real SettingsCache."""
    mock_cache = AsyncMock()
    mock_cache.get_int = AsyncMock(return_value=25)  # default limit
    with patch("nexus.auth.services.idp_group_sync.get_runtime_settings", return_value=mock_cache):
        yield mock_cache


def _make_user() -> User:
    return User(
        id=uuid4(),
        username="testuser",
        email="test@example.com",
        full_name="Test User",
        is_enabled=True,
    )


def _make_identity(user: User, provider_id: UUID) -> UserIdentity:
    return UserIdentity(
        id=uuid4(),
        user_id=user.id,
        identity_provider_id=provider_id,
        issuer="https://idp.example.com",
        subject="sub-123",
    )


def _make_config(group_jmespath_expression: str | None = None) -> OIDCConfiguration:
    return OIDCConfiguration(
        provider_type="oidc",
        issuer_url="https://idp.example.com",
        client_id="client-id",
        client_secret="client-secret",
        redirect_uri="http://localhost:8000/callback",
        group_jmespath_expression=group_jmespath_expression,
    )


def _make_db_entry(provider_id: UUID, idp_group_value: str, nexus_group_id: UUID) -> IdpGroupMappingEntry:
    """Create an IdpGroupMappingEntry row as returned from the DB."""
    return IdpGroupMappingEntry(
        id=uuid4(),
        identity_provider_id=provider_id,
        idp_group_value=idp_group_value,
        nexus_group_id=nexus_group_id,
    )


def _make_mock_db(mapping_entries: list[IdpGroupMappingEntry] | None = None) -> AsyncMock:
    """Create a mock db session.

    The first call to db.execute returns the mapping entries (for the
    IdpGroupMappingEntry query). Subsequent calls return empty results.
    """
    db = AsyncMock()

    # Build result for mapping entries query (first call)
    entries = mapping_entries or []
    mapping_result = MagicMock()
    mapping_scalars = MagicMock()
    mapping_scalars.all = MagicMock(return_value=entries)
    mapping_result.scalars = MagicMock(return_value=mapping_scalars)

    # Build empty result for all subsequent queries
    def _make_empty_result() -> MagicMock:
        r = MagicMock()
        r.__iter__ = MagicMock(return_value=iter([]))
        r.first = MagicMock(return_value=None)
        r.scalars = MagicMock(return_value=MagicMock(all=MagicMock(return_value=[])))
        return r

    call_count = 0

    async def _execute_side_effect(*args: object, **kwargs: object) -> MagicMock:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return mapping_result
        return _make_empty_result()

    db.execute = AsyncMock(side_effect=_execute_side_effect)
    return db


class TestSyncIdpGroups:
    """Tests for the sync_idp_groups function."""

    @pytest.mark.asyncio
    async def test_denies_when_no_group_mapping(self):
        """Should return False when no jmespath expression and no entries exist."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        config = _make_config(group_jmespath_expression=None)
        db = _make_mock_db(mapping_entries=[])

        result = await sync_idp_groups(db, user, identity, {"groups": ["admin"]}, config)
        assert result is False
        assert db.execute.call_count == 1

    @pytest.mark.asyncio
    async def test_denies_when_no_mapping_entries(self):
        """Should return False when no entries exist and auto-create is off."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        config = _make_config(group_jmespath_expression="groups[*]")
        db = _make_mock_db(mapping_entries=[])

        result = await sync_idp_groups(db, user, identity, {"groups": ["admin"]}, config)
        assert result is False
        assert db.execute.call_count == 1

    def test_rejects_invalid_jmespath_at_config_time(self):
        """Should reject syntactically invalid JMESPath at model validation time."""
        with pytest.raises(ValueError, match="not a valid JMESPath expression"):
            _make_config(group_jmespath_expression="[[[invalid")

    @pytest.mark.asyncio
    async def test_denies_login_on_jmespath_runtime_error(self):
        """Should return False when JMESPath extraction fails at runtime."""
        from unittest.mock import patch

        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        nexus_group_id = uuid4()
        config = _make_config(group_jmespath_expression="groups[*]")
        db = _make_mock_db(mapping_entries=[_make_db_entry(provider_id, "admin", nexus_group_id)])

        # Simulate a JMESPath runtime error (e.g., corrupted claims object)
        with patch("nexus.auth.services.idp_group_sync.jmespath.search", side_effect=TypeError("unexpected type")):
            result = await sync_idp_groups(db, user, identity, {"groups": ["admin"]}, config)
        assert result is False
        # Should only have the mapping entries query, no sync queries
        assert db.execute.call_count == 1

    @pytest.mark.asyncio
    async def test_processes_matching_groups(self):
        """Should return True and execute DB operations when groups match."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        nexus_group_id = uuid4()
        config = _make_config(group_jmespath_expression="groups[*]")
        db = _make_mock_db(mapping_entries=[_make_db_entry(provider_id, "admin", nexus_group_id)])

        result = await sync_idp_groups(db, user, identity, {"groups": ["admin", "users"]}, config)
        assert result is True
        assert db.execute.call_count > 1

    @pytest.mark.asyncio
    async def test_handles_nested_jmespath(self):
        """Should handle nested JMESPath expressions like realm_access.roles[*]."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        nexus_group_id = uuid4()
        config = _make_config(group_jmespath_expression="realm_access.roles[*]")
        db = _make_mock_db(mapping_entries=[_make_db_entry(provider_id, "admin", nexus_group_id)])

        await sync_idp_groups(
            db,
            user,
            identity,
            {"realm_access": {"roles": ["admin", "user"]}},
            config,
        )
        assert db.execute.call_count > 1

    @pytest.mark.asyncio
    async def test_returns_false_when_no_groups_match(self):
        """Should return False when mappings exist but none match the user's groups."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        nexus_group_id = uuid4()
        config = _make_config(group_jmespath_expression="groups[*]")
        db = _make_mock_db(mapping_entries=[_make_db_entry(provider_id, "admin", nexus_group_id)])

        # "users" is in the token but not in mapping entries
        result = await sync_idp_groups(db, user, identity, {"groups": ["users"]}, config)
        assert result is False
        # Still calls execute for the tracking table query and cleanup
        assert db.execute.call_count > 1

    @pytest.mark.asyncio
    async def test_returns_false_when_claim_missing(self):
        """Should return False when groups claim is absent and mappings are configured."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        nexus_group_id = uuid4()
        config = _make_config(group_jmespath_expression="groups[*]")
        db = _make_mock_db(mapping_entries=[_make_db_entry(provider_id, "admin", nexus_group_id)])

        # No "groups" claim at all
        result = await sync_idp_groups(db, user, identity, {"sub": "user-123"}, config)
        assert result is False
        # Should still execute for tracking table query and cleanup
        assert db.execute.call_count > 1

    @pytest.mark.asyncio
    async def test_auto_create_allows_login_when_groups_present(self):
        """Should return True when auto-create resolves groups from the token."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        config = OIDCConfiguration(
            provider_type="oidc",
            issuer_url="https://idp.example.com",
            client_id="client-id",
            client_secret="client-secret",
            redirect_uri="http://localhost:8000/callback",
            auto_create_groups=True,
        )
        db = _make_mock_db(mapping_entries=[])

        result = await sync_idp_groups(db, user, identity, {"groups": ["team-a"]}, config)
        assert result is True

    @pytest.mark.asyncio
    async def test_auto_create_denies_when_no_groups_in_token(self):
        """Should return False when auto-create is on but token has no groups."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        config = OIDCConfiguration(
            provider_type="oidc",
            issuer_url="https://idp.example.com",
            client_id="client-id",
            client_secret="client-secret",
            redirect_uri="http://localhost:8000/callback",
            auto_create_groups=True,
        )
        db = _make_mock_db(mapping_entries=[])

        result = await sync_idp_groups(db, user, identity, {"sub": "user-123"}, config)
        assert result is False

    @pytest.mark.asyncio
    async def test_handles_scalar_jmespath_result(self):
        """Should wrap scalar JMESPath result into a list."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        nexus_group_id = uuid4()
        config = _make_config(group_jmespath_expression="role")
        db = _make_mock_db(mapping_entries=[_make_db_entry(provider_id, "admin", nexus_group_id)])

        await sync_idp_groups(db, user, identity, {"role": "admin"}, config)
        assert db.execute.call_count > 1


class TestAutoCreateGroupLimit:
    """Tests for the max_auto_create_groups runtime setting enforcement."""

    @pytest.mark.asyncio
    async def test_denies_login_when_groups_exceed_limit(self, _mock_runtime_settings: AsyncMock):  # noqa: PT019
        """Should return False (deny login) when token groups exceed the configured limit."""
        _mock_runtime_settings.get_int.return_value = 5

        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        config = OIDCConfiguration(
            provider_type="oidc",
            issuer_url="https://idp.example.com",
            client_id="client-id",
            client_secret="client-secret",
            redirect_uri="http://localhost:8000/callback",
            auto_create_groups=True,
        )
        db = _make_mock_db(mapping_entries=[])

        groups = [f"group-{i}" for i in range(10)]
        result = await sync_idp_groups(db, user, identity, {"groups": groups}, config)
        assert result is False

    @pytest.mark.asyncio
    async def test_allows_login_when_groups_within_limit(self):
        """Should allow login when token groups are within the configured limit."""
        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        config = OIDCConfiguration(
            provider_type="oidc",
            issuer_url="https://idp.example.com",
            client_id="client-id",
            client_secret="client-secret",
            redirect_uri="http://localhost:8000/callback",
            auto_create_groups=True,
        )
        db = _make_mock_db(mapping_entries=[])

        result = await sync_idp_groups(db, user, identity, {"groups": ["team-a", "team-b"]}, config)
        assert result is True

    @pytest.mark.asyncio
    async def test_zero_limit_means_no_limit(self, _mock_runtime_settings: AsyncMock):  # noqa: PT019
        """Should allow any number of groups when limit is 0 (no limit)."""
        _mock_runtime_settings.get_int.return_value = 0

        user = _make_user()
        provider_id = uuid4()
        identity = _make_identity(user, provider_id)
        config = OIDCConfiguration(
            provider_type="oidc",
            issuer_url="https://idp.example.com",
            client_id="client-id",
            client_secret="client-secret",
            redirect_uri="http://localhost:8000/callback",
            auto_create_groups=True,
        )
        db = _make_mock_db(mapping_entries=[])

        groups = [f"group-{i}" for i in range(100)]
        result = await sync_idp_groups(db, user, identity, {"groups": groups}, config)
        assert result is True


class TestGroupMappingModels:
    """Tests for group mapping model validation."""

    def test_group_mapping_entry_requires_fields(self):
        entry = OIDCGroupMappingEntry(
            idp_group_value="admin-guid-123",
            nexus_group_id=uuid4(),
        )
        assert entry.idp_group_value == "admin-guid-123"

    def test_oidc_config_with_group_jmespath(self):
        nexus_id = uuid4()
        config = OIDCConfiguration(
            provider_type="oidc",
            issuer_url="https://idp.example.com",
            client_id="client-id",
            client_secret="client-secret",
            redirect_uri="http://localhost:8000/callback",
            group_jmespath_expression="realm_access.roles[*]",
            group_mapping_entries=[OIDCGroupMappingEntry(idp_group_value="admin", nexus_group_id=nexus_id)],
        )
        assert config.group_jmespath_expression == "realm_access.roles[*]"
        assert len(config.group_mapping_entries) == 1

    def test_oidc_config_without_group_jmespath(self):
        config = _make_config()
        assert config.group_jmespath_expression is None
        assert config.group_mapping_entries == []

    def test_oidc_config_serialization_roundtrip(self):
        config = _make_config(group_jmespath_expression="groups[*]")
        data = config.model_dump()
        restored = OIDCConfiguration.model_validate(data)
        assert restored.group_jmespath_expression == "groups[*]"


class TestMatchGroupEntries:
    """Tests for match_group_entries wildcard matching."""

    def test_exact_match(self):
        group_id = uuid4()
        entries = [_make_db_entry(uuid4(), "admins", group_id)]
        result = match_group_entries(entries, {"admins", "users"})
        assert result == {group_id}

    def test_no_match(self):
        entries = [_make_db_entry(uuid4(), "admins", uuid4())]
        result = match_group_entries(entries, {"users", "developers"})
        assert result == set()

    def test_wildcard_star_matches_all(self):
        group_id = uuid4()
        entries = [_make_db_entry(uuid4(), "*", group_id)]
        result = match_group_entries(entries, {"admins", "users", "developers"})
        assert result == {group_id}

    def test_wildcard_prefix(self):
        group_id = uuid4()
        entries = [_make_db_entry(uuid4(), "admin*", group_id)]
        result = match_group_entries(entries, {"admin-prod", "admin-staging", "users"})
        assert result == {group_id}

    def test_wildcard_suffix(self):
        group_id = uuid4()
        entries = [_make_db_entry(uuid4(), "*-leads", group_id)]
        result = match_group_entries(entries, {"team-platform-leads", "team-security-leads", "users"})
        assert result == {group_id}

    def test_wildcard_middle(self):
        group_id = uuid4()
        entries = [_make_db_entry(uuid4(), "org/*/engineers", group_id)]
        result = match_group_entries(entries, {"org/acme/engineers", "org/acme/managers"})
        assert result == {group_id}

    def test_wildcard_no_match(self):
        entries = [_make_db_entry(uuid4(), "admin*", uuid4())]
        result = match_group_entries(entries, {"users", "developers"})
        assert result == set()

    def test_multiple_entries_mixed(self):
        gid1, gid2 = uuid4(), uuid4()
        provider_id = uuid4()
        entries = [
            _make_db_entry(provider_id, "admin*", gid1),
            _make_db_entry(provider_id, "dev-team", gid2),
        ]
        result = match_group_entries(entries, {"admin-prod", "dev-team", "users"})
        assert result == {gid1, gid2}

    def test_wildcard_star_with_empty_group_values(self):
        group_id = uuid4()
        entries = [_make_db_entry(uuid4(), "*", group_id)]
        result = match_group_entries(entries, set())
        assert result == set()

    def test_question_mark_wildcard(self):
        group_id = uuid4()
        entries = [_make_db_entry(uuid4(), "team-?", group_id)]
        result = match_group_entries(entries, {"team-a", "team-b", "team-ab"})
        assert result == {group_id}  # matches team-a and team-b, not team-ab


class TestOIDCIdpType:
    """Tests for idp_type validation on OIDCConfiguration."""

    def test_valid_idp_types(self):
        """All known idp_type values should be accepted."""
        for idp_type in OIDCIdpType:
            config = _make_config()
            config_data = config.model_dump()
            config_data["idp_type"] = idp_type.value
            validated = OIDCConfiguration.model_validate(config_data)
            assert validated.idp_type == idp_type.value

    def test_none_idp_type_accepted(self):
        """idp_type=None should be accepted."""
        config = _make_config()
        assert config.idp_type is None

    def test_unknown_idp_type_rejected(self):
        """Unknown idp_type values should be rejected."""
        with pytest.raises(ValueError, match="Unknown idp_type"):
            OIDCConfiguration(
                provider_type="oidc",
                issuer_url="https://idp.example.com",
                client_id="client-id",
                client_secret="client-secret",
                redirect_uri="http://localhost:8000/callback",
                idp_type="unknown_provider",
            )

    def test_known_idp_type_values(self):
        """OIDCIdpType enum should contain the expected values."""
        assert OIDCIdpType.AAP == "aap"
        assert OIDCIdpType.CUSTOM == "custom"
