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

    async def test_boolean_string_to_boolean_conversion(self, session: AsyncSession) -> None:
        """Test automatic conversion of boolean string values to actual boolean types."""
        query = select(UserModel)

        # Test "true" string converts to True boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="true")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users (alice, bob, diana)
        assert len(result) == 3
        usernames = {user.username for user in result}
        assert usernames == {"alice", "bob", "diana"}

        # Test "false" string converts to False boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="false")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match inactive users (charlie)
        assert len(result) == 1
        assert result[0].username == "charlie"

    async def test_boolean_numeric_string_conversion(self, session: AsyncSession) -> None:
        """Test conversion of numeric string representations to boolean."""
        query = select(UserModel)

        # Test "1" string converts to True boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="1")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users (alice, bob, diana)
        assert len(result) == 3
        usernames = {user.username for user in result}
        assert usernames == {"alice", "bob", "diana"}

        # Test "0" string converts to False boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="0")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match inactive users (charlie)
        assert len(result) == 1
        assert result[0].username == "charlie"

    async def test_boolean_alternative_string_representations(self, session: AsyncSession) -> None:
        """Test alternative boolean string representations (yes/no, on/off)."""
        query = select(UserModel)

        # Test "yes" string converts to True boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="yes")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users (alice, bob, diana)
        assert len(result) == 3
        usernames = {user.username for user in result}
        assert usernames == {"alice", "bob", "diana"}

        # Test "no" string converts to False boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="no")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match inactive users (charlie)
        assert len(result) == 1
        assert result[0].username == "charlie"

        # Test "on" string converts to True boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="on")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users (alice, bob, diana)
        assert len(result) == 3
        usernames = {user.username for user in result}
        assert usernames == {"alice", "bob", "diana"}

        # Test "off" string converts to False boolean
        filters = [Filter(field="is_active", operator=FilterOperator.EQ, value="off")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match inactive users (charlie)
        assert len(result) == 1
        assert result[0].username == "charlie"

    async def test_boolean_case_insensitive_conversion(self, session: AsyncSession) -> None:
        """Test that boolean string conversion is case-insensitive."""
        query = select(UserModel)

        # Test various case combinations for "true"
        true_variations = ["TRUE", "True", "TrUe", "tRUE"]
        for true_value in true_variations:
            filters = [Filter(field="is_active", operator=FilterOperator.EQ, value=true_value)]
            filtered_query = apply_filters(query, filters, UserModel)
            result = (await session.execute(filtered_query)).scalars().all()

            # Should match active users (alice, bob, diana)
            assert len(result) == 3, f"Failed for case variation: {true_value}"
            usernames = {user.username for user in result}
            assert usernames == {"alice", "bob", "diana"}

        # Test various case combinations for "false"
        false_variations = ["FALSE", "False", "FaLsE", "fALSE"]
        for false_value in false_variations:
            filters = [Filter(field="is_active", operator=FilterOperator.EQ, value=false_value)]
            filtered_query = apply_filters(query, filters, UserModel)
            result = (await session.execute(filtered_query)).scalars().all()

            # Should match inactive users (charlie)
            assert len(result) == 1, f"Failed for case variation: {false_value}"
            assert result[0].username == "charlie"

    async def test_boolean_invalid_string_raises_error(self) -> None:
        """Test that invalid boolean strings raise ValueError."""
        query = select(UserModel)

        # Test invalid boolean strings
        invalid_values = ["invalid", "maybe", "sometimes", "2", "-1", "null", ""]

        for invalid_value in invalid_values:
            filters = [Filter(field="is_active", operator=FilterOperator.EQ, value=invalid_value)]

            with pytest.raises(ValueError, match="Invalid boolean value"):
                apply_filters(query, filters, UserModel)

    async def test_end_to_end_boolean_filtering_from_query_params(self, session: AsyncSession) -> None:
        """Test complete workflow: parse boolean query parameters and apply filters."""
        # Test the exact scenario that was failing: enabled[eq]=false
        params = {"is_active[eq]": "false"}
        allowed_fields = ["is_active"]

        # Parse filters from query parameters
        filters = parse_filters(params, allowed_fields)

        # Apply to query - this should automatically convert "false" to False
        query = select(UserModel)
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match inactive users (charlie)
        assert len(result) == 1
        assert result[0].username == "charlie"
        assert result[0].is_active is False

        # Test the opposite: enabled[eq]=true
        params = {"is_active[eq]": "true"}
        filters = parse_filters(params, allowed_fields)

        query = select(UserModel)
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users (alice, bob, diana)
        assert len(result) == 3
        usernames = {user.username for user in result}
        assert usernames == {"alice", "bob", "diana"}
        for user in result:
            assert user.is_active is True

    async def test_boolean_filtering_mixed_with_other_filters(self, session: AsyncSession) -> None:
        """Test boolean filtering combined with other filter types."""
        # Test boolean + numeric filter
        params = {"is_active[eq]": "true", "age[gte]": "30"}
        allowed_fields = ["is_active", "age"]
        filters = parse_filters(params, allowed_fields)

        query = select(UserModel)
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match active users with age >= 30 (bob)
        assert len(result) == 1
        assert result[0].username == "bob"
        assert result[0].is_active is True
        assert result[0].age >= 30

        # Test boolean + string filter
        params = {"is_active[eq]": "false", "username[starts_with]": "c"}
        allowed_fields = ["is_active", "username"]
        filters = parse_filters(params, allowed_fields)

        query = select(UserModel)
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match inactive users whose username starts with 'c' (charlie)
        assert len(result) == 1
        assert result[0].username == "charlie"
        assert result[0].is_active is False


@pytest.mark.asyncio
class TestSQLInjectionProtection:
    """Test SQL injection protection in filter operations with real database."""

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
        ]

        for user in test_users:
            test_db_session.add(user)
        await test_db_session.commit()

        yield test_db_session

    async def test_like_injection_protection_contains(self, session: AsyncSession) -> None:
        """Test that LIKE injection attempts are properly sanitized with contains operator."""
        query = select(UserModel)

        # Test SQL injection attempts through contains operator
        injection_attempts = [
            "%'; DROP TABLE users; --",  # Classic injection with wildcard
            "_' OR '1'='1",  # Injection with underscore wildcard
            "\\'; DELETE FROM users; --",  # Injection with escaped characters
            "%' UNION SELECT * FROM passwords --",  # Union-based injection
        ]

        for injection_value in injection_attempts:
            filters = [Filter(field="full_name", operator=FilterOperator.CONTAINS, value=injection_value)]
            filtered_query = apply_filters(query, filters, UserModel)

            # Should execute safely without SQL injection
            result = (await session.execute(filtered_query)).scalars().all()

            # Should return empty result since no user has these exact escaped values
            assert len(result) == 0

    async def test_like_injection_protection_starts_with(self, session: AsyncSession) -> None:
        """Test that LIKE injection attempts are properly sanitized with starts_with operator."""
        query = select(UserModel)

        # Test injection attempts through starts_with operator
        injection_attempts = [
            "Alice%'; DROP TABLE--",  # Injection after legitimate start
            "_lice' OR 1=1--",  # Wildcard injection
            "\\' OR 'a'='a",  # Boolean injection
        ]

        for injection_value in injection_attempts:
            filters = [Filter(field="full_name", operator=FilterOperator.STARTS_WITH, value=injection_value)]
            filtered_query = apply_filters(query, filters, UserModel)

            # Should execute safely without SQL injection
            result = (await session.execute(filtered_query)).scalars().all()

            # Should return empty result since wildcards are escaped
            assert len(result) == 0

    async def test_wildcard_escaping_functionality(self, session: AsyncSession) -> None:
        """Test that wildcards are properly escaped but filtering still works correctly."""
        query = select(UserModel)

        # Test that % wildcard is escaped in contains
        filters = [Filter(field="username", operator=FilterOperator.CONTAINS, value="ali%ce")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should not match "alice" because % is escaped to literal %
        assert len(result) == 0

        # Test that _ wildcard is escaped in contains
        filters = [Filter(field="username", operator=FilterOperator.CONTAINS, value="alic_")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should not match "alice" because _ is escaped to literal _
        assert len(result) == 0

        # Test normal contains still works
        filters = [Filter(field="username", operator=FilterOperator.CONTAINS, value="lic")]
        filtered_query = apply_filters(query, filters, UserModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match "alice" because no wildcards to escape
        assert len(result) == 1
        assert result[0].username == "alice"

    async def test_backslash_escaping_in_filters(self, session: AsyncSession) -> None:
        """Test proper handling of backslashes in filter values."""
        query = select(UserModel)

        # Test various backslash patterns
        backslash_patterns = [
            "test\\value",  # Single backslash
            "test\\\\value",  # Double backslash
            "\\%test",  # Backslash with wildcard
            "\\_test",  # Backslash with underscore
        ]

        for pattern in backslash_patterns:
            filters = [Filter(field="username", operator=FilterOperator.CONTAINS, value=pattern)]
            filtered_query = apply_filters(query, filters, UserModel)

            # Should execute safely without error
            result = (await session.execute(filtered_query)).scalars().all()
            # Should return empty since no users have these patterns in username
            assert len(result) == 0

    async def test_injection_through_field_values_with_special_chars(self, session: AsyncSession) -> None:
        """Test injection attempts through special characters in field values."""
        query = select(UserModel)

        # Test various special character injection attempts
        special_char_injections = [
            "'; CREATE TABLE malicious (id INT); --",
            "' AND 1=1--",
            "' UNION ALL SELECT NULL--",
            "'; INSERT INTO users (username) VALUES ('hacker'); --",
            "' OR username LIKE '%'--",
        ]

        for injection_value in special_char_injections:
            # Test with different operators to ensure all are protected
            for operator in [FilterOperator.EQ, FilterOperator.CONTAINS, FilterOperator.STARTS_WITH]:
                filters = [Filter(field="username", operator=operator, value=injection_value)]
                filtered_query = apply_filters(query, filters, UserModel)

                # Should execute safely without SQL injection
                result = (await session.execute(filtered_query)).scalars().all()

                # Should not find any matches for these injection strings
                assert len(result) == 0

    async def test_parametrized_query_protection(self, session: AsyncSession) -> None:
        """Test that SQLAlchemy's parametrized queries protect against injection."""
        query = select(UserModel)

        # Test that SQLAlchemy correctly parameterizes our filter values
        # This is more of a verification that our approach is sound
        dangerous_value = "'; DROP TABLE users; SELECT * FROM users WHERE username='"

        filters = [Filter(field="username", operator=FilterOperator.EQ, value=dangerous_value)]
        filtered_query = apply_filters(query, filters, UserModel)

        # The query should be safely parameterized - we can inspect it
        # SQLAlchemy should use bound parameters, not string concatenation
        compiled_query = filtered_query.compile(compile_kwargs={"literal_binds": False})

        # Should contain parameter placeholders, not the literal dangerous value
        query_str = str(compiled_query)
        assert dangerous_value not in query_str
        assert ":username_1" in query_str or "%(username_1)s" in query_str or "?" in query_str

        # Execute safely
        result = (await session.execute(filtered_query)).scalars().all()
        assert len(result) == 0

    async def test_multiple_injection_attempts_combined(self, session: AsyncSession) -> None:
        """Test multiple simultaneous injection attempts in different fields."""
        query = select(UserModel)

        # Combine multiple injection attempts in one filter set
        filters = [
            Filter(field="username", operator=FilterOperator.CONTAINS, value="'; DROP TABLE--"),
            Filter(field="full_name", operator=FilterOperator.STARTS_WITH, value="%' OR 1=1--"),
            Filter(field="email", operator=FilterOperator.EQ, value="' UNION SELECT--"),
        ]

        filtered_query = apply_filters(query, filters, UserModel)

        # Should execute safely without any SQL injection
        result = (await session.execute(filtered_query)).scalars().all()

        # Should return empty result since no user matches these injection strings
        assert len(result) == 0

    async def test_case_insensitive_operations_with_injection(self, session: AsyncSession) -> None:
        """Test that case-insensitive operations don't introduce injection vulnerabilities."""
        query = select(UserModel)

        # Test injection attempts with case variations
        case_injection_attempts = [
            "Alice'; DROP table USERS;--",
            "ALICE%'; delete FROM users;--",
            "alice_' OR '1'='1'--",
        ]

        for injection_value in case_injection_attempts:
            filters = [Filter(field="full_name", operator=FilterOperator.CONTAINS, value=injection_value)]
            filtered_query = apply_filters(query, filters, UserModel)

            # Should execute safely
            result = (await session.execute(filtered_query)).scalars().all()

            # Should not match legitimate users due to escaped wildcards
            assert len(result) == 0
