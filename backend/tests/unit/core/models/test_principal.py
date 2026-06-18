"""Unit tests for Principal model and event listener registration."""

from uuid import uuid4

from nexus.core.models.principal import (
    _PRINCIPAL_SUBTYPES,
    Principal,
    PrincipalType,
    _register_principal_subtype,
)


class TestPrincipalType:
    """Tests for PrincipalType enum."""

    def test_user_value(self) -> None:
        assert PrincipalType.USER.value == "user"

    def test_service_account_value(self) -> None:
        assert PrincipalType.SERVICE_ACCOUNT.value == "service_account"

    def test_is_str_enum(self) -> None:
        assert isinstance(PrincipalType.USER, str)
        assert str(PrincipalType.USER) == "user"


class TestPrincipalModel:
    """Tests for the Principal SQLModel."""

    def test_tablename(self) -> None:
        assert Principal.__tablename__ == "principals"

    def test_for_user(self) -> None:
        uid = uuid4()
        p = Principal.for_user(uid)
        assert p.id == uid
        assert p.principal_type == PrincipalType.USER

    def test_for_service_account(self) -> None:
        sa_id = uuid4()
        p = Principal.for_service_account(sa_id)
        assert p.id == sa_id
        assert p.principal_type == PrincipalType.SERVICE_ACCOUNT

    def test_has_principal_type_index(self) -> None:
        table = Principal.__table__  # type: ignore[attr-defined]
        index_names = {idx.name for idx in table.indexes}
        assert "ix_principals_principal_type" in index_names


class TestPrincipalSubtypeRegistry:
    """Tests for the subtype registration used by the before_flush listener."""

    def test_register_and_lookup(self) -> None:
        _register_principal_subtype("users", PrincipalType.USER)
        assert _PRINCIPAL_SUBTYPES["users"] == PrincipalType.USER

    def test_service_accounts_registered(self) -> None:
        _register_principal_subtype("service_accounts", PrincipalType.SERVICE_ACCOUNT)
        assert _PRINCIPAL_SUBTYPES["service_accounts"] == PrincipalType.SERVICE_ACCOUNT

    def test_unknown_tablename_not_in_registry(self) -> None:
        assert "nonexistent_table" not in _PRINCIPAL_SUBTYPES
