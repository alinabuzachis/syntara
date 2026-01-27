"""Conftest for utils unit tests.

This module provides shared fixtures for utility function tests.
"""
# ruff: noqa: DTZ001

from datetime import datetime

import pytest_asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.core.models.user import UserRole


@pytest_asyncio.fixture
async def test_users(test_db_session: AsyncSession) -> list[User]:
    """Create test data for filtering and sorting tests.

    Args:
        test_db_session: Async PostgreSQL test session from conftest

    Returns:
        List of test Users

    """
    # Add test data with various label combinations for comprehensive testing
    test_users = [
        User(
            username="alice",
            email="alice@example.com",
            full_name="Alice Smith",
            role=UserRole.CREATOR,
            is_active=True,
            labels={
                "environment": "production",
                "region": "us-east-1",
                "team": "platform",
                "service": "api",
                "version": "v1.2.0",
            },
            created_at=datetime(2025, 1, 1, 10, 0, 0),
        ),
        User(
            username="bob",
            email="bob@example.com",
            full_name="Bob Johnson",
            role=UserRole.APPROVER,
            is_active=True,
            labels={
                "environment": "production",
                "region": "us-west-2",
                "team": "frontend",
                "service": "web",
                "version": "v2.1.0",
            },
            created_at=datetime(2025, 1, 2, 11, 0, 0),
        ),
        User(
            username="charlie",
            email="charlie@example.com",
            full_name="Charlie Brown",
            role=UserRole.VIEWER,
            is_active=False,
            labels={
                "environment": "staging",
                "region": "us-east-1",
                "team": "platform",
                "service": "api",
                "version": "v1.3.0-beta",
            },
            created_at=datetime(2025, 1, 3, 12, 0, 0),
        ),
        User(
            username="diana",
            email="diana@example.com",
            full_name="Diana Prince",
            role=UserRole.ADMINISTRATOR,
            is_active=True,
            labels={
                "environment": "production",
                "region": "us-east-1",
                "team": "data",
                "service": "processor",
                "version": "v3.0.1",
            },
            created_at=datetime(2025, 1, 4, 13, 0, 0),
        ),
        User(
            username="eve",
            email="eve@example.com",
            full_name="Eve Davis",
            role=UserRole.ADMINISTRATOR,
            is_active=False,
            labels={"environment": "development", "region": "us-west-1", "team": "dev", "experimental": "true"},
            created_at=datetime(2025, 1, 5, 14, 0, 0),
        ),
    ]

    for user in test_users:
        test_db_session.add(user)
    await test_db_session.commit()
    return test_users
