"""Unit tests for ServiceAccount model."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from nexus.core.models.base.base_resource import AuditLevel
from nexus.service_accounts.models.service_account import (
    ServiceAccount,
    ServiceAccountStatus,
)


class TestServiceAccountStatus:
    """Tests for ServiceAccountStatus enum values."""

    def test_active_value(self) -> None:
        assert ServiceAccountStatus.ACTIVE.value == "active"

    def test_disabled_value(self) -> None:
        assert ServiceAccountStatus.DISABLED.value == "disabled"

    def test_only_two_statuses(self) -> None:
        assert set(ServiceAccountStatus) == {
            ServiceAccountStatus.ACTIVE,
            ServiceAccountStatus.DISABLED,
        }


class TestServiceAccountModel:
    """Unit tests for the ServiceAccount SQLModel."""

    def test_tablename(self) -> None:
        assert ServiceAccount.__tablename__ == "service_accounts"

    def test_is_table_model(self) -> None:
        table = ServiceAccount.__table__  # type: ignore[attr-defined]
        pk_cols = [col.name for col in table.primary_key.columns]
        assert pk_cols == ["id"]

    def test_has_expected_columns(self) -> None:
        table = ServiceAccount.__table__  # type: ignore[attr-defined]
        column_names = {col.name for col in table.columns}
        expected = {
            "id",
            "name",
            "description",
            "client_id",
            "hashed_secret",
            "old_hashed_secret",
            "old_secret_valid_until",
            "grace_period_seconds",
            "status",
            "project_id",
            "last_authenticated_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
            "deleted_at",
            "deleted_by",
            "labels",
        }
        assert column_names == expected

    def test_client_id_has_unique_index(self) -> None:
        table = ServiceAccount.__table__  # type: ignore[attr-defined]
        unique_indexes = [idx.name for idx in table.indexes if idx.unique]
        assert "ix_service_accounts_client_id_unique" in unique_indexes

    def test_status_check_constraint(self) -> None:
        table = ServiceAccount.__table__  # type: ignore[attr-defined]
        constraint_names = [c.name for c in table.constraints if hasattr(c, "sqltext")]
        assert "ck_service_accounts_status_valid" in constraint_names

    def test_grace_period_check_constraint(self) -> None:
        table = ServiceAccount.__table__  # type: ignore[attr-defined]
        constraint_names = [c.name for c in table.constraints if hasattr(c, "sqltext")]
        assert "ck_service_accounts_grace_period_range" in constraint_names

    def test_default_status_is_active(self) -> None:
        sa = ServiceAccount(
            name="test",
            client_id="nx_sa_test123",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            project_id=uuid4(),
            created_by=uuid4(),
        )
        assert sa.status == ServiceAccountStatus.ACTIVE

    def test_default_grace_period(self) -> None:
        sa = ServiceAccount(
            name="test",
            client_id="nx_sa_test123",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            project_id=uuid4(),
            created_by=uuid4(),
        )
        assert sa.grace_period_seconds == 3600

    def test_grace_period_rejects_negative(self) -> None:
        with pytest.raises(ValidationError, match="greater than or equal to 0"):
            ServiceAccount(
                name="test",
                client_id="nx_sa_test123",
                hashed_secret="$argon2id$placeholder",  # noqa: S106
                project_id=uuid4(),
                created_by=uuid4(),
                grace_period_seconds=-1,
            )

    def test_grace_period_rejects_over_24h(self) -> None:
        with pytest.raises(ValidationError, match="less than or equal to 86400"):
            ServiceAccount(
                name="test",
                client_id="nx_sa_test123",
                hashed_secret="$argon2id$placeholder",  # noqa: S106
                project_id=uuid4(),
                created_by=uuid4(),
                grace_period_seconds=86401,
            )

    def test_optional_fields_default_none(self) -> None:
        sa = ServiceAccount(
            name="test",
            client_id="nx_sa_test123",
            hashed_secret="$argon2id$placeholder",  # noqa: S106
            project_id=uuid4(),
            created_by=uuid4(),
        )
        assert sa.old_hashed_secret is None
        assert sa.old_secret_valid_until is None
        assert sa.last_authenticated_at is None
        assert sa.updated_by is None
        assert sa.deleted_at is None
        assert sa.deleted_by is None


class TestServiceAccountAuditConfig:
    """Tests for audit configuration — hashed secrets must be excluded."""

    def test_audit_level_is_meta(self) -> None:
        assert ServiceAccount.__auditable__ == AuditLevel.META

    def test_hashed_secret_excluded_from_audit(self) -> None:
        assert "hashed_secret" not in ServiceAccount.__auditable_fields__
        assert "old_hashed_secret" not in ServiceAccount.__auditable_fields__

    def test_auditable_fields_include_key_metadata(self) -> None:
        for field in ("name", "client_id", "status", "project_id"):
            assert field in ServiceAccount.__auditable_fields__
