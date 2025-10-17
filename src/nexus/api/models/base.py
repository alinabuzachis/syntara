"""Base model class for all database models."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import DateTime, Uuid

# Naming convention for constraints
convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

metadata = MetaData(naming_convention=convention)


class Base(DeclarativeBase):
    """Base class for all models."""

    metadata = metadata

    # Type annotation for type checkers
    __tablename__: str


class TimestampMixin:
    """Mixin for created_at and updated_at timestamps."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class SoftDeleteMixin:
    """Mixin for soft delete functionality."""

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
    )

    deleted_by: Mapped[UUID | None] = mapped_column(
        Uuid,
        nullable=True,
        default=None,
    )

    def soft_delete(self, deleted_by_id: UUID) -> None:
        """Mark this record as soft deleted.

        Args:
            deleted_by_id: UUID of the user performing the deletion

        """
        self.deleted_at = datetime.now(UTC)
        self.deleted_by = deleted_by_id

    @property
    def is_deleted(self) -> bool:
        """Check if this record is soft deleted.

        Returns:
            True if soft deleted, False otherwise

        """
        return self.deleted_at is not None


def generate_uuid() -> UUID:
    """Generate a new UUID for use as primary key.

    Returns:
        UUID instance

    """
    return uuid4()
