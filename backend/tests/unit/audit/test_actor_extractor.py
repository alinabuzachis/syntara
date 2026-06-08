"""Unit tests for audit actor extraction utilities."""

import inspect
from collections.abc import Awaitable, Callable
from typing import Any
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest

from nexus.audit.actor_extractor import extract_actor
from nexus.audit.emitter import AuditActorContext, actor_context_var
from nexus.audit.models.audit_event import ActorType
from nexus.core.models.user import User


@pytest.fixture
def simple_test_func() -> Any:  # noqa: ANN401
    """Fixture providing a simple test function with no special parameters."""

    def test_func(**kwargs: Any) -> None:  # noqa: ANN401
        pass

    return test_func


@pytest.fixture
def simple_test_signature(simple_test_func: Any) -> inspect.Signature:  # noqa: ANN401
    """Fixture providing the signature of simple_test_func."""
    return inspect.signature(simple_test_func)


class TestActorExtractorContextVariable:
    """Test Strategy 1: Context variable extraction (highest priority)."""

    def teardown_method(self) -> None:
        """Clean up context variable after each test."""
        actor_context_var.set(None)

    def test_extract_from_context_var_with_full_context(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction from context variable with both actor_id and actor_username."""
        user_id = uuid4()
        username = "testuser"

        # Set context variable with full actor context
        actor_context_var.set(
            AuditActorContext(
                actor_id=user_id,
                actor_username=username,
                actor_type=ActorType.USER,
            )
        )

        result = extract_actor(simple_test_signature, (), {})

        assert result.actor_id == user_id
        assert result.actor_username == username
        assert result.actor_type == ActorType.USER

    def test_extract_from_context_var_with_only_actor_id(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction from context variable with only actor_id (no username)."""
        user_id = uuid4()

        # Set context variable with partial context (id only)
        actor_context_var.set(
            AuditActorContext(
                actor_id=user_id,
                actor_username=None,
                actor_type=ActorType.USER,
            )
        )

        result = extract_actor(simple_test_signature, (), {})

        assert result.actor_id == user_id
        assert result.actor_username is None
        assert result.actor_type == ActorType.USER

    def test_extract_from_context_var_with_only_username(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction from context variable with only actor_username (no id)."""
        username = "testuser"

        # Set context variable with partial context (username only)
        actor_context_var.set(
            AuditActorContext(
                actor_id=None,
                actor_username=username,
                actor_type=ActorType.USER,
            )
        )

        result = extract_actor(simple_test_signature, (), {})

        assert result.actor_id is None
        assert result.actor_username == username
        assert result.actor_type == ActorType.USER

    def test_extract_from_empty_context_var_falls_through(
        self, simple_test_signature: inspect.Signature, test_user: User
    ) -> None:
        """Test that empty context variable falls through to other strategies."""
        # Set context variable with empty context (both None)
        actor_context_var.set(
            AuditActorContext(
                actor_id=None,
                actor_username=None,
                actor_type=ActorType.SYSTEM,
            )
        )

        # Provide a FastAPI dependency that should be used as fallback
        kwargs = {"current_user": test_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        # Should use FastAPI dependency (Strategy 2) since context var is empty
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username
        assert result.actor_type == ActorType.USER

    def test_extract_from_none_context_var_falls_through(
        self, simple_test_signature: inspect.Signature, test_user: User
    ) -> None:
        """Test that None context variable falls through to other strategies."""
        # Explicitly set context variable to None
        actor_context_var.set(None)

        # Provide a FastAPI dependency that should be used as fallback
        kwargs = {"current_user": test_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        # Should use FastAPI dependency (Strategy 2) since context var is None
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username
        assert result.actor_type == ActorType.USER

    def test_context_var_has_priority_over_other_strategies(
        self, simple_test_signature: inspect.Signature, test_user: User
    ) -> None:
        """Test that context variable has highest priority over other strategies."""
        context_user_id = uuid4()
        context_username = "context_user"

        # Set context variable
        actor_context_var.set(
            AuditActorContext(
                actor_id=context_user_id,
                actor_username=context_username,
                actor_type=ActorType.USER,
            )
        )

        # Also provide FastAPI dependency (should be ignored)
        kwargs = {"current_user": test_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        # Should use context variable (Strategy 1), not FastAPI dependency
        assert result.actor_id == context_user_id
        assert result.actor_username == context_username
        assert result.actor_type == ActorType.USER


class TestActorExtractorFastApiDependencyExtraction:
    """Test FastAPI dependency extraction functionality."""

    async def test_extract_current_user_success(
        self, simple_test_signature: inspect.Signature, test_user: User
    ) -> None:
        """Test extraction from current_user parameter."""
        kwargs = {"current_user": test_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result is not None
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username
        assert result.actor_type == ActorType.USER

    def test_extract_user_context_success(self, simple_test_signature: inspect.Signature, test_user: User) -> None:
        """Test extraction from user_context parameter."""
        kwargs = {"user_context": test_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result is not None
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username
        assert result.actor_type == ActorType.USER

    def test_extract_non_user_object(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with non-User object."""
        kwargs = {"current_user": Mock()}  # Not a User instance

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result == AuditActorContext()
        assert result.actor_type == ActorType.SYSTEM

    def test_extract_none_value_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with None value."""
        kwargs = {"current_user": None}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result == AuditActorContext()
        assert result.actor_type == ActorType.SYSTEM

    def test_extract_no_matching_params_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with no matching parameters."""
        kwargs = {"other_param": "value"}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result == AuditActorContext()
        assert result.actor_type == ActorType.SYSTEM


class TestActorExtractorParamExtraction:
    """Test explicit parameter extraction functionality."""

    def test_extract_explicit_param_from_args(self) -> None:
        """Test extraction from explicit parameter in args."""
        user_id = uuid4()

        def test_func(actor_id: UUID, other_param: int) -> None:
            pass

        args = (user_id, 42)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs, actor_param="actor_id")

        assert result == AuditActorContext()
        assert result.actor_type == ActorType.SYSTEM

    def test_extract_explicit_param_user_from_kwargs(self, test_user: User) -> None:
        """Test extraction of User from explicit parameter in kwargs."""

        def test_func(actor: User, other_param: int = 0) -> None:
            pass

        args: tuple[User, ...] = ()
        kwargs = {"actor": test_user, "other_param": 42}

        result = extract_actor(inspect.signature(test_func), args, kwargs, actor_param="actor")

        assert result is not None
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username
        assert result.actor_type == ActorType.USER

    def test_extract_explicit_param_missing_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with missing explicit parameter."""
        args = (42,)
        kwargs: dict[str, str] = {}

        result = extract_actor(simple_test_signature, args, kwargs, actor_param="user_id")

        assert result == AuditActorContext()
        assert result.actor_type == ActorType.SYSTEM

    def test_extract_explicit_param_none_value_fallback_system(self) -> None:
        """Test extraction with None value in explicit parameter."""

        def test_func(user_id: UUID | None) -> None:
            pass

        args = (None,)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs, actor_param="user_id")

        assert result == AuditActorContext()
        assert result.actor_type == ActorType.SYSTEM


class TestActorExtractorAutoDetection:
    """Test automatic actor parameter detection."""

    async def test_auto_detect_current_user_param(self, test_user: User) -> None:
        """Test auto-detection with current_user parameter."""

        def test_func(current_user: User, other_param: int) -> None:
            pass

        args = (test_user, 42)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs)

        assert result is not None
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username
        assert result.actor_type == ActorType.USER

    async def test_auto_detect_priority_order(
        self, test_user: User, user_factory: Callable[..., Awaitable["User"]]
    ) -> None:
        """Test that user_id has priority over other patterns."""
        current_user = await user_factory(username="current_user", email="current_user@example.com")

        def test_func(user: User, current_user: User) -> None:
            pass

        args = (test_user, current_user)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs)

        assert result is not None
        assert result.actor_id == current_user.id  # current_user should win due to priority
        assert result.actor_username == current_user.username
        assert result.actor_type == ActorType.USER

    def test_auto_detect_skips_none_values(self, test_user: User) -> None:
        """Test auto-detection skips None values and falls back to next match."""

        def test_func(user: User | None, current_user: User) -> None:
            pass

        args = (None, test_user)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs)

        assert result is not None
        assert result.actor_id == test_user.id
        assert result.actor_username == test_user.username
        assert result.actor_type == ActorType.USER

    def test_auto_detect_no_matching_params_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test auto-detection with no matching parameters."""
        args = (42, "value")
        kwargs = {"other_param": 42, "another_param": "value"}

        result = extract_actor(simple_test_signature, args, kwargs)

        assert result == AuditActorContext()
        assert result.actor_type == ActorType.SYSTEM


class TestActorExtractorSystemUserClassification:
    """Test system user classification based on system_user_id from settings."""

    def test_system_user_classified_as_system_actor(self) -> None:
        """Test that user with id == settings.system_user_id is classified as SYSTEM."""
        from nexus.core.config.base import get_settings

        settings = get_settings()
        system_user = User(
            id=settings.system_user_id,
            username="system_user",
            email="system@example.com",
            first_name="System",
            last_name="User",
            password_hash="not-a-real-hash",  # noqa: S106
        )

        def test_func(current_user: User) -> None:
            pass

        args = (system_user,)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs)

        assert result.actor_id == settings.system_user_id
        assert result.actor_username == "system_user"
        assert result.actor_type == ActorType.SYSTEM

    def test_regular_user_classified_as_user_actor(self) -> None:
        """Test that user with id != settings.system_user_id is classified as USER."""
        from nexus.core.config.base import get_settings

        settings = get_settings()
        regular_user = User(
            id=uuid4(),
            username="regular_user",
            email="regular@example.com",
            first_name="Regular",
            last_name="User",
            password_hash="not-a-real-hash",  # noqa: S106
        )
        assert regular_user.id != settings.system_user_id

        def test_func(current_user: User) -> None:
            pass

        args = (regular_user,)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs)

        assert result.actor_id == regular_user.id
        assert result.actor_username == regular_user.username
        assert result.actor_type == ActorType.USER

    def test_system_user_via_fastapi_dependency(self, simple_test_signature: inspect.Signature) -> None:
        """Test system user classification via FastAPI dependency injection."""
        from nexus.core.config.base import get_settings

        settings = get_settings()
        system_user = User(
            id=settings.system_user_id,
            username="system_via_dep",
            email="system_dep@example.com",
            first_name="System",
            last_name="Dep",
            password_hash="not-a-real-hash",  # noqa: S106
        )

        kwargs = {"current_user": system_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result.actor_id == settings.system_user_id
        assert result.actor_username == "system_via_dep"
        assert result.actor_type == ActorType.SYSTEM

    def test_system_user_via_explicit_param(self) -> None:
        """Test system user classification via explicit actor_param."""
        from nexus.core.config.base import get_settings

        settings = get_settings()
        system_user = User(
            id=settings.system_user_id,
            username="system_explicit",
            email="system_explicit@example.com",
            first_name="System",
            last_name="Explicit",
            password_hash="not-a-real-hash",  # noqa: S106
        )

        def test_func(actor: User) -> None:
            pass

        args: tuple[User, ...] = ()
        kwargs = {"actor": system_user}

        result = extract_actor(inspect.signature(test_func), args, kwargs, actor_param="actor")

        assert result.actor_id == settings.system_user_id
        assert result.actor_username == "system_explicit"
        assert result.actor_type == ActorType.SYSTEM
