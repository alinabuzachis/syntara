"""Mock concrete implementations of shared resource models for testing and documentation."""

from nexus.core.models.base import BaseResource, NamedResource, Resource, SoftDeletableResource, UserOwnedResource


class MockBaseResource(BaseResource, table=True):
    """Concrete implementation of BaseResource for testing and documentation.

    This class exists solely for testing purposes and to demonstrate how to create
    concrete subclasses of BaseResource. It should not be used in production code.
    """

    __tablename__ = "mock_base_resources"


class MockNamedResource(NamedResource, table=True):
    """Concrete implementation of NamedResource for testing and documentation.

    This class exists solely for testing purposes and to demonstrate how to create
    concrete subclasses of NamedResource. It should not be used in production code.
    """

    __tablename__ = "mock_named_resources"


class MockResource(Resource, table=True):
    """Concrete implementation of Resource for testing and documentation.

    This class exists solely for testing purposes and to demonstrate how to create
    concrete subclasses of Resource. It should not be used in production code.
    """

    __tablename__ = "mock_resources"


class MockSoftDeletableResource(SoftDeletableResource, table=True):
    """Concrete implementation of SoftDeletableResource for testing and documentation.

    This class exists solely for testing purposes and to demonstrate how to create
    concrete subclasses of SoftDeletableResource. It should not be used in production code.
    """

    __tablename__ = "mock_soft_deletable_resources"


class MockUserOwnedResource(UserOwnedResource, table=True):
    """Concrete implementation of UserOwnedResource for testing and documentation.

    This class exists solely for testing purposes and to demonstrate how to create
    concrete subclasses of UserOwnedResource. It should not be used in production code.
    """

    __tablename__ = "mock_user_owned_resources"
