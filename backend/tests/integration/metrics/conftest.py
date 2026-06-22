"""Fixtures specific to metrics integration tests."""

import pytest


@pytest.fixture(autouse=True)
def _seed_data(_seed_integration_data: None) -> None:
    """Opt into shared authz + builtin workflow seeding."""
