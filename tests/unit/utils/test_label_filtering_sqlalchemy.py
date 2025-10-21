"""Unit tests for label filtering SQLAlchemy Query API functionality.

These tests verify that apply_label_filters can correctly apply label filters to SQLAlchemy
Query objects using the JSON field operators instead of building raw SQL strings.

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
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession
from sqlmodel import Field, SQLModel, select

from nexus.core.utils.labels import apply_label_filters, parse_label_filter
from tests.unit.utils.test_filter_parser_sqlalchemy import UserModel


class ResourceModel(SQLModel, table=True):
    """Test model for label filtering SQLAlchemy integration tests."""

    __tablename__ = "test_resources"

    id: int = Field(primary_key=True)
    name: str = Field(index=True)
    description: str
    status: str = Field(default="active")
    labels: dict[str, str] = Field(default_factory=dict, sa_type=JSONB)
    created_at: datetime = Field()


@pytest.mark.asyncio
class TestLabelFilteringSQLAlchemy:
    """Test label filtering SQLAlchemy Query API integration."""

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
        await test_db_session.execute(sqlalchemy.delete(ResourceModel))
        await test_db_session.commit()

        # Add test data with various label combinations
        test_resources = [
            ResourceModel(
                id=1,
                name="api-service",
                description="Main API service",
                status="active",
                labels={
                    "environment": "production",
                    "region": "us-east-1",
                    "team": "platform",
                    "service": "api",
                    "version": "v1.2.0",
                },
                created_at=datetime(2025, 1, 1, 10, 0, 0),
            ),
            ResourceModel(
                id=2,
                name="web-service",
                description="Frontend web service",
                status="active",
                labels={
                    "environment": "production",
                    "region": "us-west-2",
                    "team": "frontend",
                    "service": "web",
                    "version": "v2.1.0",
                },
                created_at=datetime(2025, 1, 2, 11, 0, 0),
            ),
            ResourceModel(
                id=3,
                name="staging-api",
                description="Staging API service",
                status="testing",
                labels={
                    "environment": "staging",
                    "region": "us-east-1",
                    "team": "platform",
                    "service": "api",
                    "version": "v1.3.0-beta",
                },
                created_at=datetime(2025, 1, 3, 12, 0, 0),
            ),
            ResourceModel(
                id=4,
                name="data-processor",
                description="Background data processing service",
                status="active",
                labels={
                    "environment": "production",
                    "region": "us-east-1",
                    "team": "data",
                    "service": "processor",
                    "version": "v3.0.1",
                },
                created_at=datetime(2025, 1, 4, 13, 0, 0),
            ),
            ResourceModel(
                id=5,
                name="dev-sandbox",
                description="Development sandbox",
                status="inactive",
                labels={"environment": "development", "region": "us-west-1", "team": "dev", "experimental": "true"},
                created_at=datetime(2025, 1, 5, 14, 0, 0),
            ),
        ]

        for resource in test_resources:
            test_db_session.add(resource)
        await test_db_session.commit()

        yield test_db_session

    async def test_apply_label_filters_empty_filters(self, session: AsyncSession) -> None:
        """Test that empty label filters returns original query unchanged."""
        query = select(ResourceModel)
        label_filters: dict[str, str] = {}

        # Apply filters should return the same query
        filtered_query = apply_label_filters(query, label_filters, ResourceModel)

        # Should be able to execute without changes
        result = (await session.execute(filtered_query)).scalars().all()
        assert len(result) == 5

    async def test_apply_label_filters_single_label_match(self, session) -> None:
        """Test applying single label filter."""
        query = select(ResourceModel)
        label_filters = {"environment": "production"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match resources 1, 2, and 4 (production environment)
        assert len(result) == 3
        names = {resource.name for resource in result}
        assert names == {"api-service", "web-service", "data-processor"}

    async def test_apply_label_filters_multiple_labels_and_logic(self, session) -> None:
        """Test applying multiple label filters with AND logic."""
        query = select(ResourceModel)
        label_filters = {"environment": "production", "region": "us-east-1"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match resources 1 and 4 (production AND us-east-1)
        assert len(result) == 2
        names = {resource.name for resource in result}
        assert names == {"api-service", "data-processor"}

    async def test_apply_label_filters_team_and_service_match(self, session) -> None:
        """Test filtering by team and service labels."""
        query = select(ResourceModel)
        label_filters = {"team": "platform", "service": "api"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match resources 1 and 3 (platform team AND api service)
        assert len(result) == 2
        names = {resource.name for resource in result}
        assert names == {"api-service", "staging-api"}

    async def test_apply_label_filters_no_matches(self, session) -> None:
        """Test label filtering with no matching resources."""
        query = select(ResourceModel)
        label_filters = {"environment": "production", "team": "nonexistent"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match no resources
        assert len(result) == 0

    async def test_apply_label_filters_single_unique_label(self, session) -> None:
        """Test filtering by a label that only exists on one resource."""
        query = select(ResourceModel)
        label_filters = {"experimental": "true"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match only the dev-sandbox resource
        assert len(result) == 1
        assert result[0].name == "dev-sandbox"

    async def test_apply_label_filters_version_pattern(self, session) -> None:
        """Test filtering by version labels."""
        query = select(ResourceModel)
        label_filters = {"version": "v1.2.0"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match only api-service with v1.2.0
        assert len(result) == 1
        assert result[0].name == "api-service"

    async def test_apply_label_filters_with_order_by(self, session) -> None:
        """Test label filtering combined with ORDER BY."""
        query = select(ResourceModel).order_by(ResourceModel.name)
        label_filters = {"environment": "production"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should be ordered by name: api-service, data-processor, web-service
        assert len(result) == 3
        names = [resource.name for resource in result]
        assert names == ["api-service", "data-processor", "web-service"]

    async def test_apply_label_filters_with_limit(self, session) -> None:
        """Test label filtering combined with LIMIT."""
        query = select(ResourceModel).limit(2)
        label_filters = {"environment": "production"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should be limited to 2 results
        assert len(result) == 2
        # All should be production environment
        for resource in result:
            assert resource.labels["environment"] == "production"

    async def test_apply_label_filters_model_without_labels_field(self) -> None:
        """Test that error is raised when model doesn't have labels field."""
        query = select(UserModel)
        label_filters = {"environment": "production"}

        with pytest.raises(ValueError, match="Model UserModel does not have a 'labels' field"):
            apply_label_filters(query, label_filters, UserModel)

    async def test_apply_label_filters_case_sensitive_matching(self, session) -> None:
        """Test that label matching is case-sensitive."""
        query = select(ResourceModel)
        label_filters = {"environment": "Production"}  # Wrong case

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match no resources due to case sensitivity
        assert len(result) == 0

    async def test_apply_label_filters_with_parsed_params(self, session) -> None:
        """Test complete workflow: parse label parameters and apply to query."""
        # Parse labels from query parameters
        params = {"labels[environment]": "production", "labels[team]": "platform", "other_param": "ignored"}
        label_filters = parse_label_filter(params)

        # Apply to query
        query = select(ResourceModel)
        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match api-service (production + platform team)
        assert len(result) == 1
        assert result[0].name == "api-service"

    async def test_apply_label_filters_complex_scenario(self, session) -> None:
        """Test complex scenario with multiple filters and query operations."""
        # Find all production services in us-east-1 region, ordered by creation time
        query = select(ResourceModel).where(ResourceModel.status == "active").order_by("created_at")

        label_filters = {"environment": "production", "region": "us-east-1"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match api-service and data-processor (both active, production, us-east-1)
        assert len(result) == 2
        # Should be ordered by creation time
        assert result[0].name == "api-service"  # Created first
        assert result[1].name == "data-processor"  # Created second

    async def test_apply_label_filters_with_mock_query(self) -> None:
        """Test apply_label_filters method signature and basic validation."""
        # Test that apply_label_filters function exists and has correct signature
        assert callable(apply_label_filters)

        # Test that it validates model labels field properly
        mock_query = Mock()
        mock_model = Mock(spec=[])  # Empty spec means hasattr returns False for everything
        mock_model.__name__ = "MockModel"

        # Test with invalid model - should raise ValueError
        label_filters = {"environment": "production"}

        with pytest.raises(ValueError, match="Model MockModel does not have a 'labels' field"):
            apply_label_filters(mock_query, label_filters, mock_model)

        # Test with empty filters - should return original query
        empty_filters: dict[str, str] = {}
        mock_model_with_labels = Mock()
        mock_model_with_labels.labels = Mock()
        result = apply_label_filters(mock_query, empty_filters, mock_model_with_labels)  # type: ignore[var-annotated]
        assert result == mock_query

    async def test_apply_label_filters_performance_with_many_labels(self, session) -> None:
        """Test performance with resources having many labels."""
        # Add a resource with many labels
        resource_with_many_labels = ResourceModel(
            id=6,
            name="complex-service",
            description="Service with many labels",
            status="active",
            labels={f"label_{i}": f"value_{i}" for i in range(20)},  # 20 labels
            created_at=datetime(2025, 1, 6, 15, 0, 0),
        )
        session.add(resource_with_many_labels)
        await session.commit()

        query = select(ResourceModel)
        label_filters = {"label_0": "value_0", "label_10": "value_10"}

        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Should match the complex-service
        assert len(result) == 1
        assert result[0].name == "complex-service"

    async def test_apply_label_filters_json_field_operations(self, session) -> None:
        """Test that the function uses proper JSON field operations."""
        query = select(ResourceModel)
        label_filters = {"environment": "production"}

        # Apply label filters using PostgreSQL JSONB operators
        filtered_query = apply_label_filters(query, label_filters, ResourceModel)
        result = (await session.execute(filtered_query)).scalars().all()

        # Verify results are correct
        assert len(result) == 3
        for resource in result:
            assert resource.labels["environment"] == "production"
