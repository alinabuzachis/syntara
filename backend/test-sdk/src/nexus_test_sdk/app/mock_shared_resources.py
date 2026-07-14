"""Mock concrete implementations of shared resource models for testing."""

from nexus.core.models.base import BaseResource, NamedResource, Resource, SoftDeletableResource, UserOwnedResource


class MockBaseResource(BaseResource, table=True):
    """Concrete implementation of BaseResource for testing."""

    __tablename__ = "mock_base_resources"


class MockNamedResource(NamedResource, table=True):
    """Concrete implementation of NamedResource for testing."""

    __tablename__ = "mock_named_resources"


class MockResource(Resource, table=True):
    """Concrete implementation of Resource for testing."""

    __tablename__ = "mock_resources"


class MockSoftDeletableResource(SoftDeletableResource, table=True):
    """Concrete implementation of SoftDeletableResource for testing."""

    __tablename__ = "mock_soft_deletable_resources"


class MockUserOwnedResource(UserOwnedResource, table=True):
    """Concrete implementation of UserOwnedResource for testing."""

    __tablename__ = "mock_user_owned_resources"
