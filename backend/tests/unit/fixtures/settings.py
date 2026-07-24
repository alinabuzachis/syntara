"""Settings fixtures specific to unit tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:
    from collections.abc import Callable, Generator
    from contextlib import AbstractContextManager


@pytest.fixture
def fast_workflow_client_settings(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> Generator[None, None, None]:
    """Configure fast workflow client settings for approval tests."""
    with override_settings(
        workflow_client_max_retries=2,
        workflow_client_initial_backoff_seconds=0.01,
        workflow_client_backoff_growth_factor=2.0,
        workflow_client_max_backoff_seconds=0.1,
        workflow_client_request_timeout_seconds=1.0,
    ):
        yield
