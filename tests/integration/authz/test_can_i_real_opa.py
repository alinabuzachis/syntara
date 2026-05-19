"""Integration test: can-i consistency with real OPA HTTP server.

Exercises the actual ``OPAClient.evaluate()`` HTTP path that all other
tests mock out (via CLI or allow-all stubs).  Verifies that the real
OPA server returns ``allow: true`` for permissions the user actually has.

Requires: OPA server running on localhost:8181 (``make opa-run``).

Related: https://github.com/syntara-orchestration/syntara/issues/621
"""

from collections.abc import AsyncGenerator
from uuid import uuid4

import pytest
from sqlalchemy import insert
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.engine import AuthzRequest, authorize
from nexus.authz.models import PrincipalType, RoleAssignment
from nexus.authz.opa_client import OPAClient
from nexus.authz.resolver import resolve_effective_policies
from nexus.authz.seed import seed_authz_data
from nexus.core.models import User
from nexus.core.models.group import Group, user_groups

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
async def real_opa_client() -> AsyncGenerator[OPAClient, None]:
    """Create a real OPA HTTP client; skip if server is not reachable."""
    client = OPAClient(base_url="http://localhost:8181")
    client.start()
    if not await client.health():
        await client.stop()
        pytest.skip("OPA server not available at localhost:8181 (run `make opa-run`)")
    yield client
    await client.stop()


@pytest.fixture(autouse=True)
async def _seed(test_db_session: AsyncSession) -> None:
    """Seed built-in policies, roles, and groups before each test."""
    await seed_authz_data(test_db_session)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _make_user(session: AsyncSession, username: str) -> User:
    user = User(
        id=uuid4(),
        username=username,
        email=f"{username}@test.local",
        full_name=username.title(),
        password_hash="$argon2id$test",  # noqa: S106
        is_enabled=True,
    )
    session.add(user)
    await session.flush()
    return user


async def _assign_role(
    session: AsyncSession,
    user: User,
    role_name: str,
) -> None:
    group = Group(name=f"{role_name}-{uuid4()}", description="", labels={})
    session.add(group)
    await session.flush()
    session.add(RoleAssignment(principal_type=PrincipalType.GROUP, principal_id=group.id, role_name=role_name))
    await session.execute(insert(user_groups).values(user_id=user.id, group_id=group.id))
    await session.commit()


# ---------------------------------------------------------------------------
# Tests — these call authorize() with a REAL OPAClient, not the CLI mock.
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_admin_policy_create_allowed(
    test_db_session: AsyncSession,
    real_opa_client: OPAClient,
) -> None:
    """Admin user + policy:create must be allowed via real OPA HTTP."""
    user = await _make_user(test_db_session, "test-admin")
    await _assign_role(test_db_session, user, "admin")

    result = await authorize(
        test_db_session,
        real_opa_client,
        AuthzRequest(user_id=user.id, action="create", resource_type="policy", resource_id=""),
    )

    assert result.allowed is True, (
        f"real OPA returned allowed={result.allowed} for admin+policy:create "
        f"(matched_policy='{result.matched_policy}', denied={result.denied})"
    )


@pytest.mark.asyncio
async def test_user_workflow_read_allowed(
    test_db_session: AsyncSession,
    real_opa_client: OPAClient,
) -> None:
    """Regular user + user:read must be allowed via real OPA HTTP."""
    user = await _make_user(test_db_session, "test-user")
    await _assign_role(test_db_session, user, "user")

    result = await authorize(
        test_db_session,
        real_opa_client,
        AuthzRequest(user_id=user.id, action="read", resource_type="user", resource_id=""),
    )

    assert result.allowed is True, (
        f"real OPA returned allowed={result.allowed} for user+user:read "
        f"(matched_policy='{result.matched_policy}', denied={result.denied})"
    )


@pytest.mark.asyncio
async def test_can_i_consistent_with_what_can_i(
    test_db_session: AsyncSession,
    real_opa_client: OPAClient,
) -> None:
    """Every scope=any allow from what-can-i must match can-i via real OPA.

    This is the core assertion from issue #621: what-can-i works but can-i
    returns allowed=false for the same permissions.
    """
    user = await _make_user(test_db_session, "cross-check-user")
    await _assign_role(test_db_session, user, "user")

    effective = await resolve_effective_policies(test_db_session, user.id)
    any_allows = [p for p in effective if p.get("effect") == "allow" and p.get("scope") == "any"]
    assert len(any_allows) > 0, "User should have at least one scope=any allow policy"

    failures: list[str] = []
    for policy in any_allows:
        for action_str in policy.get("actions", []):
            resource_type, action = action_str.split(":", 1)
            result = await authorize(
                test_db_session,
                real_opa_client,
                AuthzRequest(
                    user_id=user.id,
                    action=action,
                    resource_type=resource_type,
                    resource_id="",
                ),
            )
            if not result.allowed:
                failures.append(f"{action_str} (policy '{policy.get('name')}') → allowed={result.allowed}")

    assert not failures, (
        f"can-i disagrees with what-can-i for {len(failures)} permission(s) "
        f"via real OPA HTTP:\n  " + "\n  ".join(failures)
    )
