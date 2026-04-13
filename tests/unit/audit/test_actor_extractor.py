"""Unit tests for audit actor extraction utilities."""

import inspect
from unittest.mock import Mock
from uuid import UUID, uuid4

from nexus.audit.actor_extractor import (
    ActorContext,
    _auto_detect_actor_params,
    _convert_to_actor_context,
    _extract_from_param,
    _try_fastapi_dependency_extraction,
    extract_actor_context,
)
from nexus.audit.models import ActorType


class TestActorExtractorFastApiDependencyExtraction:
    """Test FastAPI dependency extraction functionality."""

    def test_try_fastapi_dependency_extraction_current_user(self) -> None:
        """Test extraction from current_user parameter."""
        user_id = uuid4()
        user = Mock()
        user.id = user_id
        kwargs = {"current_user": user}

        result = _try_fastapi_dependency_extraction(kwargs)

        assert result is not None
        assert result.actor_id == user_id
        assert result.actor_type == ActorType.USER

    def test_try_fastapi_dependency_extraction_user_context(self) -> None:
        """Test extraction from user_context parameter."""
        user_id = uuid4()
        context = Mock()
        context.user_id = user_id
        kwargs = {"user_context": context}

        result = _try_fastapi_dependency_extraction(kwargs)

        assert result is not None
        assert result.actor_id == user_id
        assert result.actor_type == ActorType.USER

    def test_try_fastapi_dependency_extraction_missing_id(self) -> None:
        """Test extraction with missing user ID."""
        user = Mock()
        del user.id  # Ensure no id attribute
        kwargs = {"current_user": user}

        result = _try_fastapi_dependency_extraction(kwargs)

        assert result is not None
        assert result.actor_id is None
        assert result.actor_type == ActorType.USER

    def test_try_fastapi_dependency_extraction_attribute_error(self) -> None:
        """Test extraction with AttributeError."""
        kwargs = {"current_user": None}

        result = _try_fastapi_dependency_extraction(kwargs)

        assert result is not None
        assert result.actor_id is None
        assert result.actor_type == ActorType.USER

    def test_try_fastapi_dependency_extraction_no_matching_params(self) -> None:
        """Test extraction with no matching parameters."""
        kwargs = {"other_param": "value"}

        result = _try_fastapi_dependency_extraction(kwargs)

        assert result is None

    def test_try_fastapi_dependency_extraction_exception_handling(self) -> None:
        """Test extraction handles various exceptions gracefully."""
        kwargs = {"current_user": object()}  # Object without id attribute

        result = _try_fastapi_dependency_extraction(kwargs)

        assert result is not None
        assert result.actor_id is None
        assert result.actor_type == ActorType.USER


class TestActorExtractorParamExtraction:
    """Test parameter extraction functionality."""

    def test_extract_from_param_success(self) -> None:
        """Test successful parameter extraction."""

        def test_func(user_id: str, other_param: int) -> None:
            pass

        args = ("test-user", 42)
        kwargs: dict[str, str] = {}

        result = _extract_from_param(inspect.signature(test_func), args, kwargs, "user_id")

        assert result == "test-user"

    def test_extract_from_param_from_kwargs(self) -> None:
        """Test parameter extraction from kwargs."""

        def test_func(user_id: str, other_param: int = 0) -> None:
            pass

        args: tuple[str, ...] = ()
        kwargs = {"user_id": "test-user", "other_param": 42}

        result = _extract_from_param(inspect.signature(test_func), args, kwargs, "user_id")

        assert result == "test-user"

    def test_extract_from_param_missing_param(self) -> None:
        """Test extraction of non-existent parameter."""

        def test_func(other_param: int) -> None:
            pass

        args = (42,)
        kwargs: dict[str, str] = {}

        result = _extract_from_param(inspect.signature(test_func), args, kwargs, "user_id")

        assert result is None

    def test_extract_from_param_type_error(self) -> None:
        """Test extraction with TypeError (wrong number of args)."""

        def test_func(user_id: str) -> None:
            pass

        args = ("user1", "user2")  # Too many args
        kwargs: dict[str, str] = {}

        result = _extract_from_param(inspect.signature(test_func), args, kwargs, "user_id")

        assert result is None

    def test_extract_from_param_with_defaults(self) -> None:
        """Test extraction with default values applied."""

        def test_func(user_id: str = "default-user", other_param: int = 0) -> None:
            pass

        args: tuple[str, ...] = ()
        kwargs: dict[str, str] = {}

        result = _extract_from_param(inspect.signature(test_func), args, kwargs, "user_id")

        assert result == "default-user"


class TestActorExtractorAutoDetection:
    """Test automatic actor parameter detection."""

    def test_auto_detect_actor_params_user_id(self) -> None:
        """Test auto-detection with user_id parameter."""
        user_id = uuid4()

        def test_func(user_id: UUID, other_param: int) -> None:
            pass

        args = (user_id, 42)
        kwargs: dict[str, str] = {}

        result = _auto_detect_actor_params(inspect.signature(test_func), args, kwargs)

        assert result is not None
        assert result.actor_id == user_id
        assert result.actor_type == ActorType.USER

    def test_auto_detect_actor_params_current_user(self) -> None:
        """Test auto-detection with current_user parameter."""
        user_id = uuid4()
        user = Mock()
        user.id = user_id

        def test_func(current_user: Mock, other_param: int) -> None:
            pass

        args = (user, 42)
        kwargs: dict[str, str] = {}

        result = _auto_detect_actor_params(inspect.signature(test_func), args, kwargs)

        assert result is not None
        assert result.actor_id == user_id
        assert result.actor_type == ActorType.USER

    def test_auto_detect_actor_params_priority_order(self) -> None:
        """Test that user_id has priority over other patterns."""
        user_id_value = uuid4()
        current_user_value = uuid4()

        def test_func(user_id: UUID, current_user: UUID) -> None:
            pass

        args = (user_id_value, current_user_value)
        kwargs: dict[str, str] = {}

        result = _auto_detect_actor_params(inspect.signature(test_func), args, kwargs)

        assert result is not None
        assert result.actor_id == user_id_value  # user_id should win due to priority

    def test_auto_detect_actor_params_none_value(self) -> None:
        """Test auto-detection skips None values."""

        def test_func(user_id: UUID | None, current_user: str) -> None:
            pass

        args = (None, "test-user")
        kwargs: dict[str, str] = {}

        result = _auto_detect_actor_params(inspect.signature(test_func), args, kwargs)

        assert result is not None
        # "test-user" string gets converted to SYSTEM since it's not a valid UUID
        assert result.actor_id is None
        assert result.actor_type == ActorType.SYSTEM

    def test_auto_detect_actor_params_no_matching_params(self) -> None:
        """Test auto-detection with no matching parameter patterns."""

        def test_func(other_param: int, another_param: str) -> None:
            pass

        args = (42, "value")
        kwargs: dict[str, str] = {}

        result = _auto_detect_actor_params(inspect.signature(test_func), args, kwargs)

        assert result is None

    def test_auto_detect_actor_params_exception_handling(self) -> None:
        """Test auto-detection handles exceptions gracefully."""

        def test_func(user_id: str) -> None:
            pass

        args = ("user1", "user2")  # Wrong number of args
        kwargs: dict[str, str] = {}

        result = _auto_detect_actor_params(inspect.signature(test_func), args, kwargs)

        assert result is None


class TestActorExtractorConversion:
    """Test actor context conversion functionality."""

    def test_convert_to_actor_context_already_actor_context(self) -> None:
        """Test conversion of existing ActorContext."""
        actor_id = uuid4()
        original_context = ActorContext(actor_id=actor_id, actor_type=ActorType.USER)

        result = _convert_to_actor_context(original_context)

        assert result is original_context
        assert result.actor_id == actor_id
        assert result.actor_type == ActorType.USER

    def test_convert_to_actor_context_uuid(self) -> None:
        """Test conversion of UUID value."""
        actor_id = uuid4()

        result = _convert_to_actor_context(actor_id)

        assert result.actor_id == actor_id
        assert result.actor_type == ActorType.USER

    def test_convert_to_actor_context_valid_string_uuid(self) -> None:
        """Test conversion of valid UUID string."""
        actor_id = uuid4()
        uuid_string = str(actor_id)

        result = _convert_to_actor_context(uuid_string)

        assert result.actor_id == actor_id
        assert result.actor_type == ActorType.USER

    def test_convert_to_actor_context_invalid_string_uuid(self) -> None:
        """Test conversion of invalid UUID string falls back to SYSTEM."""
        invalid_uuid = "not-a-valid-uuid"

        result = _convert_to_actor_context(invalid_uuid)

        assert result.actor_id is None
        assert result.actor_type == ActorType.SYSTEM

    def test_convert_to_actor_context_object_with_uuid_id(self) -> None:
        """Test conversion of object with UUID id attribute."""
        actor_id = uuid4()
        user = Mock()
        user.id = actor_id

        result = _convert_to_actor_context(user)

        assert result.actor_id == actor_id
        assert result.actor_type == ActorType.USER

    def test_convert_to_actor_context_object_with_string_id(self) -> None:
        """Test conversion of object with string id attribute."""
        actor_id = uuid4()
        user = Mock()
        user.id = str(actor_id)

        result = _convert_to_actor_context(user)

        assert result.actor_id == actor_id
        assert result.actor_type == ActorType.USER

    def test_convert_to_actor_context_object_with_invalid_string_id(self) -> None:
        """Test conversion of object with invalid string id."""
        user = Mock()
        user.id = "invalid-uuid"

        result = _convert_to_actor_context(user)

        assert result.actor_id is None
        assert result.actor_type == ActorType.SYSTEM

    def test_convert_to_actor_context_object_without_id(self) -> None:
        """Test conversion of object without id attribute."""
        user = Mock()
        del user.id

        result = _convert_to_actor_context(user)

        assert result.actor_id is None
        assert result.actor_type == ActorType.SYSTEM

    def test_convert_to_actor_context_primitive_value(self) -> None:
        """Test conversion of primitive value falls back to SYSTEM."""
        result = _convert_to_actor_context(42)

        assert result.actor_id is None
        assert result.actor_type == ActorType.SYSTEM


class TestActorExtractorMainExtraction:
    """Test the main actor context extraction logic."""

    def test_extract_actor_context_fastapi_dependency(self) -> None:
        """Test extraction from FastAPI dependency."""
        user_id = uuid4()
        user = Mock()
        user.id = user_id

        def test_func(*, current_user=None) -> None:
            pass

        # Test when no context variables are set (they default to None)
        result = extract_actor_context(inspect.signature(test_func), (), {"current_user": user})

        assert result.actor_id == user_id
        assert result.actor_type == ActorType.USER

    def test_extract_actor_context_explicit_param(self) -> None:
        """Test extraction from explicit parameter."""
        user_id = uuid4()

        def test_func(admin_id: UUID) -> None:
            pass

        result = extract_actor_context(inspect.signature(test_func), (user_id,), {}, actor_param="admin_id")

        assert result.actor_id == user_id
        assert result.actor_type == ActorType.USER

    def test_extract_actor_context_auto_detection(self) -> None:
        """Test extraction via auto-detection."""
        user_id = uuid4()

        def test_func(user_id: UUID) -> None:
            pass

        result = extract_actor_context(inspect.signature(test_func), (user_id,), {})

        assert result.actor_id == user_id
        assert result.actor_type == ActorType.USER

    def test_extract_actor_context_fallback_context(self) -> None:
        """Test extraction uses fallback context."""
        fallback_id = uuid4()
        fallback_context = ActorContext(actor_id=fallback_id, actor_type=ActorType.USER)

        def test_func() -> None:
            pass

        result = extract_actor_context(inspect.signature(test_func), (), {}, actor_fallback=fallback_context)

        assert result.actor_id == fallback_id
        assert result.actor_type == ActorType.USER

    def test_extract_actor_context_system_default(self) -> None:
        """Test extraction defaults to SYSTEM actor."""

        def test_func() -> None:
            pass

        result = extract_actor_context(inspect.signature(test_func), (), {})

        assert result.actor_id is None
        assert result.actor_type == ActorType.SYSTEM

    def test_extract_actor_context_strategy_priority_fastapi_over_explicit(self) -> None:
        """Test that FastAPI dependency wins over explicit param."""
        fastapi_id = uuid4()
        explicit_id = uuid4()

        user = Mock()
        user.id = fastapi_id

        def test_func(admin_id: UUID, *, current_user=None) -> None:
            pass

        result = extract_actor_context(
            inspect.signature(test_func), (explicit_id,), {"current_user": user}, actor_param="admin_id"
        )

        assert result.actor_id == fastapi_id  # FastAPI should win

    def test_extract_actor_context_strategy_priority_explicit_over_auto(self) -> None:
        """Test that explicit param wins over auto-detection."""
        explicit_id = uuid4()
        auto_id = uuid4()

        def test_func(user_id: UUID, admin_id: UUID) -> None:
            pass

        result = extract_actor_context(inspect.signature(test_func), (auto_id, explicit_id), {}, actor_param="admin_id")

        assert result.actor_id == explicit_id  # Explicit should win over auto

    def test_extract_actor_context_strategy_priority_auto_over_fallback(self) -> None:
        """Test that auto-detection wins over fallback."""
        auto_id = uuid4()
        fallback_id = uuid4()
        fallback_context = ActorContext(actor_id=fallback_id, actor_type=ActorType.USER)

        def test_func(user_id: UUID) -> None:
            pass

        result = extract_actor_context(inspect.signature(test_func), (auto_id,), {}, actor_fallback=fallback_context)

        assert result.actor_id == auto_id  # Auto should win over fallback

    def test_extract_actor_context_none_values_are_skipped(self) -> None:
        """Test that None values are properly skipped in extraction."""

        def test_func(user_id: UUID | None) -> None:
            pass

        result = extract_actor_context(inspect.signature(test_func), (None,), {})

        assert result.actor_id is None
        assert result.actor_type == ActorType.SYSTEM
