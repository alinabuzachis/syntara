"""Unit tests for apply_sorting SQLAlchemy Query API functionality.

These tests verify that apply_sorting can correctly apply sorting to SQLAlchemy Query objects
using the SQLAlchemy object model instead of building raw SQL strings.
"""

from collections.abc import Generator
from datetime import UTC, datetime
from typing import Any
from unittest.mock import Mock

import pytest
from sqlalchemy import Engine
from sqlmodel import Field, Session, SQLModel, create_engine, select

from nexus.core.utils.cursor import SortDirection
from nexus.core.utils.sorting import apply_sorting


class UserModel(SQLModel, table=True):
    """Test model for apply_sorting SQLAlchemy integration tests."""

    __tablename__ = "test_users_sorting"

    id: int = Field(primary_key=True)
    username: str = Field(index=True)
    email: str = Field(index=True)
    full_name: str
    age: int
    is_active: bool = Field(default=True)
    created_at: datetime
    priority: int = Field(default=0)


class TestApplySortingSQLAlchemy:
    """Test apply_sorting SQLAlchemy Query API integration."""

    @pytest.fixture
    def engine(self) -> Engine:
        """Create in-memory SQLite engine for testing."""
        engine = create_engine("sqlite:///:memory:")
        SQLModel.metadata.create_all(engine)
        return engine

    @pytest.fixture
    def session(self, engine) -> Generator[Session, Any, None]:
        """Create database session with test data."""
        session = Session(engine)

        # Add test data with various field values for sorting
        test_users = [
            UserModel(
                id=1,
                username="alice",
                email="alice@example.com",
                full_name="Alice Smith",
                age=25,
                is_active=True,
                created_at=datetime(2025, 1, 1, 10, 0, 0, tzinfo=UTC),
                priority=5,
            ),
            UserModel(
                id=2,
                username="bob",
                email="bob@example.com",
                full_name="Bob Johnson",
                age=30,
                is_active=True,
                created_at=datetime(2025, 1, 2, 11, 0, 0, tzinfo=UTC),
                priority=3,
            ),
            UserModel(
                id=3,
                username="charlie",
                email="charlie@example.com",
                full_name="Charlie Brown",
                age=22,
                is_active=False,
                created_at=datetime(2025, 1, 3, 12, 0, 0, tzinfo=UTC),
                priority=1,
            ),
            UserModel(
                id=4,
                username="diana",
                email="diana@example.com",
                full_name="Diana Wilson",
                age=28,
                is_active=True,
                created_at=datetime(2025, 1, 4, 13, 0, 0, tzinfo=UTC),
                priority=4,
            ),
            UserModel(
                id=5,
                username="eve",
                email="eve@example.com",
                full_name="Eve Davis",
                age=35,
                is_active=False,
                created_at=datetime(2025, 1, 5, 14, 0, 0, tzinfo=UTC),
                priority=2,
            ),
        ]

        for user in test_users:
            session.add(user)
        session.commit()

        yield session
        session.close()

    def test_apply_sorting_empty_sorts(self, session) -> None:
        """Test that empty sort tuples returns original query unchanged."""
        query = select(UserModel)
        sort_tuples: list[tuple[str, SortDirection]] = []

        # Apply sorting should return the same query
        sorted_query = apply_sorting(query, sort_tuples, UserModel)

        # Should be able to execute without changes
        result = session.exec(sorted_query).all()
        assert len(result) == 5

    def test_apply_sorting_single_field_ascending(self, session) -> None:
        """Test applying single field ascending sort."""
        query = select(UserModel)
        sort_tuples = [("username", SortDirection.ASC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by username ascending: alice, bob, charlie, diana, eve
        assert len(result) == 5
        usernames = [user.username for user in result]
        assert usernames == ["alice", "bob", "charlie", "diana", "eve"]

    def test_apply_sorting_single_field_descending(self, session) -> None:
        """Test applying single field descending sort."""
        query = select(UserModel)
        sort_tuples = [("age", SortDirection.DESC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by age descending: 35, 30, 28, 25, 22
        assert len(result) == 5
        ages = [user.age for user in result]
        assert ages == [35, 30, 28, 25, 22]

    def test_apply_sorting_multiple_fields(self, session) -> None:
        """Test applying multiple field sorting."""
        query = select(UserModel)
        sort_tuples = [
            ("is_active", SortDirection.DESC),  # Active users first (True > False)
            ("age", SortDirection.ASC),  # Then by age ascending
        ]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by is_active DESC, then age ASC
        # Active users (True): alice(25), diana(28), bob(30)
        # Inactive users (False): charlie(22), eve(35)
        assert len(result) == 5
        expected_order = ["alice", "diana", "bob", "charlie", "eve"]
        usernames = [user.username for user in result]
        assert usernames == expected_order

    def test_apply_sorting_datetime_field(self, session) -> None:
        """Test sorting by datetime field."""
        query = select(UserModel)
        sort_tuples = [("created_at", SortDirection.DESC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by created_at descending (newest first)
        assert len(result) == 5
        usernames = [user.username for user in result]
        assert usernames == ["eve", "diana", "charlie", "bob", "alice"]

    def test_apply_sorting_integer_field(self, session) -> None:
        """Test sorting by integer field."""
        query = select(UserModel)
        sort_tuples = [("priority", SortDirection.ASC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by priority ascending: 1, 2, 3, 4, 5
        assert len(result) == 5
        priorities = [user.priority for user in result]
        assert priorities == [1, 2, 3, 4, 5]
        usernames = [user.username for user in result]
        assert usernames == ["charlie", "eve", "bob", "diana", "alice"]

    def test_apply_sorting_with_where_clause(self, session) -> None:
        """Test sorting combined with WHERE clause."""
        query = select(UserModel).where(UserModel.is_active == True)  # noqa: E712
        sort_tuples = [("age", SortDirection.DESC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should filter active users and sort by age descending
        assert len(result) == 3
        ages = [user.age for user in result]
        assert ages == [30, 28, 25]  # bob, diana, alice

    def test_apply_sorting_with_limit(self, session) -> None:
        """Test sorting combined with LIMIT."""
        query = select(UserModel).limit(3)
        sort_tuples = [("username", SortDirection.DESC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be limited to 3 results, sorted by username descending
        assert len(result) == 3
        usernames = [user.username for user in result]
        assert usernames == ["eve", "diana", "charlie"]

    def test_apply_sorting_complex_multi_field(self, session) -> None:
        """Test complex multi-field sorting scenario."""
        query = select(UserModel)
        sort_tuples = [
            ("is_active", SortDirection.ASC),  # Inactive first (False < True)
            ("priority", SortDirection.DESC),  # Then by priority descending
            ("username", SortDirection.ASC),  # Then by username ascending
        ]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by: is_active ASC, priority DESC, username ASC
        # Inactive users (False): eve(priority=2), charlie(priority=1)
        # Active users (True): alice(priority=5), diana(priority=4), bob(priority=3)
        assert len(result) == 5
        expected_order = ["eve", "charlie", "alice", "diana", "bob"]
        usernames = [user.username for user in result]
        assert usernames == expected_order

    def test_apply_sorting_invalid_field_raises_error(self) -> None:
        """Test that invalid field names raise ValueError."""
        query = select(UserModel)
        sort_tuples = [("invalid_field", SortDirection.ASC)]

        with pytest.raises(ValueError, match="Model UserModel does not have a 'invalid_field' field"):
            apply_sorting(query, sort_tuples, UserModel)

    def test_apply_sorting_mixed_valid_invalid_fields(self) -> None:
        """Test that error is raised even with some valid fields."""
        query = select(UserModel)
        sort_tuples = [
            ("username", SortDirection.ASC),  # Valid field
            ("invalid_field", SortDirection.DESC),  # Invalid field
        ]

        with pytest.raises(ValueError, match="Model UserModel does not have a 'invalid_field' field"):
            apply_sorting(query, sort_tuples, UserModel)

    def test_apply_sorting_all_direction_combinations(self, session) -> None:
        """Test all combinations of sort directions."""
        query = select(UserModel)

        # Test ASC + ASC
        sort_tuples = [("priority", SortDirection.ASC), ("username", SortDirection.ASC)]
        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()
        usernames = [user.username for user in result]
        assert usernames == ["charlie", "eve", "bob", "diana", "alice"]

        # Test DESC + ASC
        sort_tuples = [("priority", SortDirection.DESC), ("username", SortDirection.ASC)]
        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()
        usernames = [user.username for user in result]
        assert usernames == ["alice", "diana", "bob", "eve", "charlie"]

        # Test ASC + DESC
        sort_tuples = [("priority", SortDirection.ASC), ("username", SortDirection.DESC)]
        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()
        usernames = [user.username for user in result]
        assert usernames == ["charlie", "eve", "bob", "diana", "alice"]

        # Test DESC + DESC
        sort_tuples = [("priority", SortDirection.DESC), ("username", SortDirection.DESC)]
        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()
        usernames = [user.username for user in result]
        assert usernames == ["alice", "diana", "bob", "eve", "charlie"]

    def test_apply_sorting_with_mock_query(self) -> None:
        """Test apply_sorting method signature and basic validation."""
        # Test that apply_sorting function exists and has correct signature
        assert callable(apply_sorting)

        # Test that it validates model field properly
        mock_query = Mock()
        mock_model = Mock(spec=[])  # Empty spec means hasattr returns False for everything
        mock_model.__name__ = "MockModel"

        # Test with invalid model - should raise ValueError
        sort_tuples = [("username", SortDirection.ASC)]

        with pytest.raises(ValueError, match="Model MockModel does not have a 'username' field"):
            apply_sorting(mock_query, sort_tuples, mock_model)

        # Test with empty sorts - should return original query
        empty_sorts: list[tuple[str, SortDirection]] = []
        mock_model_with_fields = Mock()
        mock_model_with_fields.username = Mock()
        result = apply_sorting(mock_query, empty_sorts, mock_model_with_fields)  # type: ignore[var-annotated]
        assert result == mock_query

    def test_apply_sorting_performance_with_many_sorts(self, session) -> None:
        """Test performance with many sort criteria."""
        query = select(UserModel)
        # Create multiple sort criteria
        sort_tuples = [
            ("id", SortDirection.ASC),
            ("username", SortDirection.DESC),
            ("age", SortDirection.ASC),
            ("priority", SortDirection.DESC),
            ("created_at", SortDirection.ASC),
        ]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should execute successfully with multiple sorts
        assert len(result) == 5
        # Verify it's actually sorted (primary sort is id ASC)
        ids = [user.id for user in result]
        assert ids == [1, 2, 3, 4, 5]

    def test_apply_sorting_string_field_sorting(self, session) -> None:
        """Test sorting string fields with various cases."""
        query = select(UserModel)
        sort_tuples = [("full_name", SortDirection.ASC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by full_name ascending
        assert len(result) == 5
        full_names = [user.full_name for user in result]
        assert full_names == ["Alice Smith", "Bob Johnson", "Charlie Brown", "Diana Wilson", "Eve Davis"]

    def test_apply_sorting_boolean_field_sorting(self, session) -> None:
        """Test sorting boolean fields."""
        query = select(UserModel)
        sort_tuples = [("is_active", SortDirection.ASC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by is_active ascending (False < True)
        assert len(result) == 5
        is_active_values = [user.is_active for user in result]
        # First two should be False, last three should be True
        assert is_active_values[:2] == [False, False]
        assert is_active_values[2:] == [True, True, True]

    def test_apply_sorting_primary_key_field(self, session) -> None:
        """Test sorting by primary key field."""
        query = select(UserModel)
        sort_tuples = [("id", SortDirection.DESC)]

        sorted_query = apply_sorting(query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should be sorted by id descending
        assert len(result) == 5
        ids = [user.id for user in result]
        assert ids == [5, 4, 3, 2, 1]

    def test_apply_sorting_with_sqlalchemy_query_operations(self, session) -> None:
        """Test that apply_sorting works with other SQLAlchemy query operations."""
        # Start with a complex query including WHERE, ORDER BY combination
        base_query = select(UserModel).where(UserModel.age >= 25)
        sort_tuples = [("created_at", SortDirection.DESC)]

        sorted_query = apply_sorting(base_query, sort_tuples, UserModel)
        result = session.exec(sorted_query).all()

        # Should filter users >= 25 years and sort by created_at DESC
        assert len(result) == 4  # alice(25), bob(30), diana(28), eve(35)
        usernames = [user.username for user in result]
        assert usernames == ["eve", "diana", "bob", "alice"]  # Sorted by created_at DESC

        # Verify ages are all >= 25
        ages = [user.age for user in result]
        assert all(age >= 25 for age in ages)
