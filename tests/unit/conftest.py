"""Unit test configuration.

Eagerly initialises the resource-actions registry so that unit tests calling
``validate_statements`` (e.g. via ``PolicyService.create_policy``) work
without booting the full app lifespan.  Integration tests get the registry
via the ``session_app`` fixture's lifespan startup instead.
"""

from collections.abc import Generator

import pytest
from fastapi import FastAPI

from nexus.authz.engine import clear_opa_cache, init_opa_cache
from nexus.authz.resource_actions import _registry, build_resource_actions

if _registry is None:
    from nexus.core.router_discovery import discover_and_register_routers

    _init_app = FastAPI()
    discover_and_register_routers(app=_init_app, prefix="", enable_validation=False)
    build_resource_actions(_init_app)
    del _init_app


@pytest.fixture(autouse=True)
def _reset_opa_cache() -> Generator[None, None, None]:
    """Disable OPA cache between unit tests to prevent cross-test pollution."""
    init_opa_cache(enabled=False)
    yield
    clear_opa_cache()
    init_opa_cache(enabled=False)
