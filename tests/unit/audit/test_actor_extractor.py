"""Unit tests for audit actor extraction utilities."""

import inspect
from collections.abc import Awaitable, Callable
from typing import Any
from unittest.mock import Mock
from uuid import UUID, uuid4

import pytest

from nexus.audit.actor_extractor import extract_actor
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


class TestActorExtractorFastApiDependencyExtraction:
    """Test FastAPI dependency extraction functionality."""

    async def test_extract_current_user_success(
        self, simple_test_signature: inspect.Signature, test_user: User
    ) -> None:
        """Test extraction from current_user parameter."""
        kwargs = {"current_user": test_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result is not None
        assert result.id == test_user.id
        assert result.username == test_user.username

    def test_extract_user_context_success(self, simple_test_signature: inspect.Signature, test_user: User) -> None:
        """Test extraction from user_context parameter."""
        kwargs = {"user_context": test_user}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result is not None
        assert result.id == test_user.id
        assert result.username == test_user.username

    def test_extract_non_user_object(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with non-User object."""
        kwargs = {"current_user": Mock()}  # Not a User instance

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result is None

    def test_extract_none_value_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with None value."""
        kwargs = {"current_user": None}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result is None

    def test_extract_no_matching_params_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with no matching parameters."""
        kwargs = {"other_param": "value"}

        result = extract_actor(simple_test_signature, (), kwargs)

        assert result is None


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

        assert result is None

    def test_extract_explicit_param_user_from_kwargs(self, test_user: User) -> None:
        """Test extraction of User from explicit parameter in kwargs."""

        def test_func(actor: User, other_param: int = 0) -> None:
            pass

        args: tuple[User, ...] = ()
        kwargs = {"actor": test_user, "other_param": 42}

        result = extract_actor(inspect.signature(test_func), args, kwargs, actor_param="actor")

        assert result is not None
        assert result.id == test_user.id
        assert result.username == test_user.username

    def test_extract_explicit_param_missing_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test extraction with missing explicit parameter."""
        args = (42,)
        kwargs: dict[str, str] = {}

        result = extract_actor(simple_test_signature, args, kwargs, actor_param="user_id")

        assert result is None

    def test_extract_explicit_param_none_value_fallback_system(self) -> None:
        """Test extraction with None value in explicit parameter."""

        def test_func(user_id: UUID | None) -> None:
            pass

        args = (None,)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs, actor_param="user_id")

        assert result is None


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
        assert result.id == test_user.id
        assert result.username == test_user.username

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
        assert result.id == current_user.id  # current_user should win due to priority
        assert result.username == current_user.username

    def test_auto_detect_skips_none_values(self, test_user: User) -> None:
        """Test auto-detection skips None values and falls back to next match."""

        def test_func(user: User | None, current_user: User) -> None:
            pass

        args = (None, test_user)
        kwargs: dict[str, str] = {}

        result = extract_actor(inspect.signature(test_func), args, kwargs)

        assert result is not None
        assert result.id == test_user.id
        assert result.username == test_user.username

    def test_auto_detect_no_matching_params_fallback_system(self, simple_test_signature: inspect.Signature) -> None:
        """Test auto-detection with no matching parameters."""
        args = (42, "value")
        kwargs = {"other_param": 42, "another_param": "value"}

        result = extract_actor(simple_test_signature, args, kwargs)

        assert result is None
