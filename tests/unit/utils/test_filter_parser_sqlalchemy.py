"""Unit tests for FilterParser SQLAlchemy Query API functionality.

These tests verify that FilterParser can correctly apply filters to SQLAlchemy Query objects
using the query.filter() API instead of building raw SQL strings.

NOTE: These tests use timezone-naive datetimes because the test models create tables
directly via SQLModel metadata (not via Alembic migrations). Production code uses
Alembic migrations with DateTime(timezone=True) to create TIMESTAMPTZ columns and
stores timezone-aware UTC datetimes. See BaseResource in core/models/base.py.
"""
# ruff: noqa: DTZ001

from collections.abc import AsyncGenerator
from datetime import datetime
from unittest.mock import Mock

import pytest
import pytest_asyncio
import sqlalchemy
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlmodel import Field, SQLModel, select

from nexus.core.utils.filters import Filter, FilterOperator, apply_filters, parse_filters


class UserModel(SQLModel, table=True):
    """Test model for FilterParser SQLAlchemy integration tests."""

    __tablename__ = "test_users_filtering"

    id: int = Field(primary_key=True)
    username: str = Field(index=True)
    email: str = Field(index=True)
    full_name: str
    age: int
    is_active: bool = Field(default=True)
    created_at: datetime = Field()


@pytest.mark.asyncio
class TestFilterParserSQLAlchemy:
    """Test FilterParser SQLAlchemy Query API integration."""

    @pytest_asyncio.fixture
    async def session(
        self, test_db_session: AsyncSession, test_db_engine: AsyncEngine
    ) -> AsyncGenerator[AsyncSession, None]:
        """Create database session with test data using PostgreSQL.

        Args:
            test_db_session: Async PostgreSQL test session from conftest
            test_db_engine: Async PostgreSQL engine from conftest

        Yields:
            AsyncSession with test data

        """
        # Create tables for test models
        async with test_db_engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)

        # Clear existing data from this test's tables
        await test_db_session.execute(sqlalchemy.delete(UserModel))
        await test_db_session.commit()

        # Add test data
        test_users = [
            UserModel(
                id=1,
                username="alice",
                email="alice@example.com",
                full_name="Alice Smith",
                age=25,
                is_active=True,
                created_at=datetime(2025, 1, 1, 10, 0, 0),
            ),
            UserModel(
                id=2,
                username="bob",
                email="bob@example.com",
                full_name="Bob Johnson",
                age=30,
                is_active=True,
                created_at=datetime(2025, 1, 2, 11, 0, 0),
            ),
            UserModel(
                id=3,
                username="charlie",
                email="charlie@example.com",
                full_name="Charlie Brown",
                age=35,
                is_active=False,
                created_at=datetime(2025, 1, 3, 12, 0, 0),
            ),
            UserModel(
                id=4,
                username="diana",
                email="diana@example.com",
                full_name="Diana Prince",
                age=28,
                is_active=True,
                created_at=datetime(2025, 1, 4, 13, 0, 0),
            ),
        ]

        for user in test_users:
            test_db_session.add(user)
        await test_db_session.commit()

        yield test_db_session

    async def test_apply_filters_empty_filters_list(self, session: AsyncSession) -> None:
        """Test that empty filters list returns original query unchanged."""
        query = select(UserModel)
        filters: list[Filter] = []

        # Apply filters should return the same query
        filtered_query = apply_filters(query, filters, UserModel)

        # Should be able to execute without changes
        result = (await session.execute(filtered_query)).scalars().all()
        assert len(result) == 4

    async def test_apply_filters_equality_operator(self, session: AsyncSession) -> None:
        """Test applying equality filter using Query API."""
        query = select(UserModel)
        filters = [Filter(field="username", operator=FilterOperator.EQ, value="alice")]

        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        assert len(result) == 1
        assert result[0].username == "alice"
        assert result[0].email == "alice@example.com"

    async def test_apply_filters_contains_operator(self, session: AsyncSession) -> None:
        """Test applying contains filter using ilike."""
        query = select(UserModel)
        filters = [Filter(field="full_name", operator=FilterOperator.CONTAINS, value="o")]

        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match "Bob Johnson" and "Charlie Brown"
        assert len(result) == 2
        usernames = {user.username for user in result}
        assert usernames == {"bob", "charlie"}

    async def test_apply_filters_starts_with_operator(self, session: AsyncSession) -> None:
        """Test applying starts_with filter using ilike."""
        query = select(UserModel)
        filters = [Filter(field="username", operator=FilterOperator.STARTS_WITH, value="b")]

        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match "bob"
        assert len(result) == 1
        assert result[0].username == "bob"

    async def test_apply_filters_numeric_comparison_operators(self, session: AsyncSession) -> None:
        """Test applying numeric comparison filters."""
        query = select(UserModel)

        # Test greater than
        filters = [Filter(field="age", operator=FilterOperator.GT, value=30)]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()
        assert len(result) == 1
        assert result[0].username == "charlie"

        # Test greater than or equal
        filters = [Filter(field="age", operator=FilterOperator.GTE, value=30)]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()
        assert len(result) == 2
        usernames = {user.username for user in result}
        assert usernames == {"bob", "charlie"}

        # Test less than
        filters = [Filter(field="age", operator=FilterOperator.LT, value=30)]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()
        assert len(result) == 2
        usernames = {user.username for user in result}
        assert usernames == {"alice", "diana"}

        # Test less than or equal
        filters = [Filter(field="age", operator=FilterOperator.LTE, value=30)]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()
        assert len(result) == 3
        usernames = {user.username for user in result}
        assert usernames == {"alice", "bob", "diana"}

    async def test_apply_filters_boolean_field(self, session: AsyncSession) -> None:
        """Test applying filter to boolean field."""
        query = select(UserModel)
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value=True)]

        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users (alice, bob, diana)
        assert len(result) == 3
        usernames = {user.username for user in result}
        assert usernames == {"alice", "bob", "diana"}

    async def test_apply_filters_multiple_conditions_and_logic(self, session: AsyncSession) -> None:
        """Test applying multiple filters with AND logic."""
        query = select(UserModel)
        filters = [
            Filter(field="is_active", operator=FilterOperator.EQ, value=True),
            Filter(field="age", operator=FilterOperator.GTE, value=28),
        ]

        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users with age >= 28 (bob, diana)
        assert len(result) == 2
        usernames = {user.username for user in result}
        assert usernames == {"bob", "diana"}

    async def test_apply_filters_invalid_field_raises_error(self) -> None:
        """Test that invalid field name raises ValueError."""
        query = select(UserModel)
        filters = [Filter(field="nonexistent_field", operator=FilterOperator.EQ, value="test")]

        with pytest.raises(ValueError, match="Field 'nonexistent_field' not found on model UserModel"):
            apply_filters(query, filters, UserModel)

    async def test_apply_filters_with_parsed_filters(self, session: AsyncSession) -> None:
        """Test complete workflow: parse parameters and apply to query."""
        # Parse filters from query parameters
        params = {
            "username[starts_with]": "a",
            "is_active": "1",  # String representation of boolean
        }
        allowed_fields = ["username", "is_active"]
        filters = parse_filters(params, allowed_fields)

        # Convert string "1" to boolean
        for filter_obj in filters:
            if filter_obj.field == "is_active":
                filter_obj.value = bool(int(str(filter_obj.value)))

        # Apply to query
        query = select(UserModel)
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match alice (starts with 'a' and is active)
        assert len(result) == 1
        assert result[0].username == "alice"

    async def test_apply_filters_case_insensitive_string_operations(self, session: AsyncSession) -> None:
        """Test that string operations are case-insensitive."""
        query = select(UserModel)

        # Test contains with different case
        filters = [Filter(field="full_name", operator=FilterOperator.CONTAINS, value="ALICE")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        assert len(result) == 1
        assert result[0].username == "alice"

        # Test starts_with with different case
        filters = [Filter(field="username", operator=FilterOperator.STARTS_WITH, value="BOB")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        assert len(result) == 1
        assert result[0].username == "bob"

    async def test_apply_filters_method_signature_and_validation(self) -> None:
        """Test apply_filters method signature and basic validation."""
        # Test that apply_filters function exists and has correct signature
        assert callable(apply_filters)

        # Test that it validates model fields properly
        mock_query = Mock()
        mock_model = Mock(spec=[])  # Empty spec means hasattr returns False for everything
        mock_model.__name__ = "MockModel"

        # Test with invalid field - should raise ValueError
        filters = [Filter(field="nonexistent_field", operator=FilterOperator.EQ, value="test")]

        with pytest.raises(ValueError, match="Field 'nonexistent_field' not found on model MockModel"):
            apply_filters(mock_query, filters, mock_model)

        # Test with empty filters - should return original query
        empty_filters: list[Filter] = []
        result = apply_filters(mock_query, empty_filters, mock_model)  # type: ignore[var-annotated]
        assert result == mock_query

    async def test_datetime_field_filtering(self, session: AsyncSession) -> None:
        """Test filtering datetime fields."""
        query = select(UserModel)

        # Test filtering by date (as string, would be converted by your app)
        filters = [Filter(field="created_at", operator=FilterOperator.GTE, value=datetime(2025, 1, 3, 0, 0, 0))]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match charlie and diana (created on/after Jan 3)
        assert len(result) == 2
        usernames = {user.username for user in result}
        assert usernames == {"charlie", "diana"}
