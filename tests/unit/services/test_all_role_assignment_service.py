"""Tests for AllRoleAssignmentService — unified user + group role assignment listing.

Covers:
- UNION query merging user and group assignments
- Filtering by principal_type, principal_name, role_name, project_id
- Cursor-based pagination (forward and backward)
- Sorting by various fields
- Visibility restrictions (restrict_user_id / restrict_group_ids)
- Total count with include_total
"""

from typing import Any
from uuid import uuid4

import pytest
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.authz.models.assignments import GroupRoleAssignment, UserRoleAssignment
from nexus.authz.models.project import Project
from nexus.authz.seed import seed_authz_data
from nexus.authz.services.all_role_assignment_service import AllRoleAssignmentService
from nexus.core.models import User
from nexus.core.models.group import Group


@pytest.fixture
async def seeded_db(test_db_session: AsyncSession) -> AsyncSession:
    """Seed authz data and return the session."""
    await seed_authz_data(test_db_session)
    return test_db_session


async def _setup_data(
    db: AsyncSession,
    test_user: User,
) -> dict[str, Any]:
    """Create a project, extra user, group, and assignments for testing."""
    project = Project(id=uuid4(), name="test-proj", description="test", labels={})
    db.add(project)

    user2 = User(id=uuid4(), username="alice", email="alice@test.com", full_name="Alice")
    db.add(user2)

    group = Group(id=uuid4(), name="devs", description="Developer group", labels={})
    db.add(group)
    await db.flush()

    ura1 = UserRoleAssignment(
        id=uuid4(), user_id=test_user.id, role_name="project-admin", project_id=project.id, labels={}
    )
    ura2 = UserRoleAssignment(id=uuid4(), user_id=user2.id, role_name="project-user", project_id=project.id, labels={})
    ura3 = UserRoleAssignment(id=uuid4(), user_id=test_user.id, role_name="admin", labels={})
    gra1 = GroupRoleAssignment(
        id=uuid4(), group_id=group.id, role_name="project-user", project_id=project.id, labels={}
    )
    gra2 = GroupRoleAssignment(id=uuid4(), group_id=group.id, role_name="user", labels={})

    db.add_all([ura1, ura2, ura3, gra1, gra2])
    await db.commit()

    return {
        "project": project,
        "user2": user2,
        "group": group,
        "user_assignments": [ura1, ura2, ura3],
        "group_assignments": [gra1, gra2],
    }


# ============================================================================
# Basic listing
# ============================================================================


@pytest.mark.asyncio
async def test_list_all_returns_user_and_group_assignments(seeded_db: AsyncSession, test_user: User) -> None:
    """The UNION query returns both user and group assignments."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100)

    principal_types = {r["principal_type"] for r in result["resources"]}
    assert "user" in principal_types
    assert "group" in principal_types


@pytest.mark.asyncio
async def test_list_all_contains_expected_fields(seeded_db: AsyncSession, test_user: User) -> None:
    """Each result row has all expected fields."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100)

    assert len(result["resources"]) > 0
    for r in result["resources"]:
        assert "id" in r
        assert "principal_id" in r
        assert "principal_name" in r
        assert "principal_type" in r
        assert "role_name" in r
        assert r["principal_type"] in ("user", "group")


@pytest.mark.asyncio
async def test_list_all_resolves_principal_names(seeded_db: AsyncSession, test_user: User) -> None:
    """User assignments resolve username, group assignments resolve group name."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100)

    names = {r["principal_name"] for r in result["resources"]}
    assert "alice" in names
    assert "devs" in names


@pytest.mark.asyncio
async def test_list_all_resolves_project_names(seeded_db: AsyncSession, test_user: User) -> None:
    """Project-scoped assignments resolve project name; global ones have None."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100)

    project_names = {r["project_name"] for r in result["resources"]}
    assert "test-proj" in project_names
    assert None in project_names


# ============================================================================
# Filtering
# ============================================================================


@pytest.mark.asyncio
async def test_filter_principal_type_user(seeded_db: AsyncSession, test_user: User) -> None:
    """principal_type=user returns only user assignments."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, principal_type="user")

    assert len(result["resources"]) > 0
    for r in result["resources"]:
        assert r["principal_type"] == "user"


@pytest.mark.asyncio
async def test_filter_principal_type_group(seeded_db: AsyncSession, test_user: User) -> None:
    """principal_type=group returns only group assignments."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, principal_type="group")

    assert len(result["resources"]) > 0
    for r in result["resources"]:
        assert r["principal_type"] == "group"


@pytest.mark.asyncio
async def test_filter_principal_name(seeded_db: AsyncSession, test_user: User) -> None:
    """principal_name filter returns only matching principal."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, principal_name="alice")

    assert len(result["resources"]) >= 1
    for r in result["resources"]:
        assert r["principal_name"] == "alice"


@pytest.mark.asyncio
async def test_filter_role_name(seeded_db: AsyncSession, test_user: User) -> None:
    """role_name filter returns only assignments with that role."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, role_name="project-user")

    assert len(result["resources"]) >= 2  # alice + devs group
    for r in result["resources"]:
        assert r["role_name"] == "project-user"


@pytest.mark.asyncio
async def test_filter_project_id(seeded_db: AsyncSession, test_user: User) -> None:
    """project_id filter returns only assignments scoped to that project."""
    data = await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, project_id=data["project"].id)

    assert len(result["resources"]) >= 1
    for r in result["resources"]:
        assert r["project_id"] == str(data["project"].id)


@pytest.mark.asyncio
async def test_filter_combined(seeded_db: AsyncSession, test_user: User) -> None:
    """Multiple filters combine correctly."""
    data = await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(
        limit=100,
        principal_type="user",
        role_name="project-user",
        project_id=data["project"].id,
    )

    assert len(result["resources"]) == 1
    r = result["resources"][0]
    assert r["principal_name"] == "alice"
    assert r["principal_type"] == "user"
    assert r["role_name"] == "project-user"


# ============================================================================
# Visibility restrictions
# ============================================================================


@pytest.mark.asyncio
async def test_restrict_user_id(seeded_db: AsyncSession, test_user: User) -> None:
    """restrict_user_id limits user assignments to that user only."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(
        limit=100,
        restrict_user_id=test_user.id,
        restrict_group_ids=[],
    )

    for r in result["resources"]:
        if r["principal_type"] == "user":
            assert r["principal_id"] == str(test_user.id)


@pytest.mark.asyncio
async def test_restrict_group_ids(seeded_db: AsyncSession, test_user: User) -> None:
    """restrict_group_ids limits group assignments to those groups."""
    data = await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(
        limit=100,
        restrict_user_id=test_user.id,
        restrict_group_ids=[data["group"].id],
    )

    group_results = [r for r in result["resources"] if r["principal_type"] == "group"]
    for r in group_results:
        assert r["principal_id"] == str(data["group"].id)


@pytest.mark.asyncio
async def test_restrict_empty_group_ids_excludes_all_groups(seeded_db: AsyncSession, test_user: User) -> None:
    """Empty restrict_group_ids means no group assignments returned."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(
        limit=100,
        restrict_user_id=test_user.id,
        restrict_group_ids=[],
    )

    group_results = [r for r in result["resources"] if r["principal_type"] == "group"]
    assert group_results == []


@pytest.mark.asyncio
async def test_no_restrictions_returns_all(seeded_db: AsyncSession, test_user: User) -> None:
    """Without restrictions (admin view), all assignments are returned."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100)

    # Should include seeded assignments + our test data
    # At minimum: 3 user + 2 group from _setup_data + seeded data
    assert len(result["resources"]) >= 5


# ============================================================================
# Pagination
# ============================================================================


@pytest.mark.asyncio
async def test_pagination_forward(seeded_db: AsyncSession, test_user: User) -> None:
    """Paginating forward through all results produces no duplicates."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)

    all_ids: list[str] = []
    cursor = None
    page_count = 0
    while True:
        result = await svc.list_all(limit=2, cursor=cursor)
        all_ids.extend(r["id"] for r in result["resources"])
        page_count += 1
        if not result["next"]:
            break
        cursor = result["next"]
        assert page_count < 30, "Too many pages"

    assert len(all_ids) == len(set(all_ids)), "Duplicate IDs found across pages"


@pytest.mark.asyncio
async def test_pagination_backward(seeded_db: AsyncSession, test_user: User) -> None:
    """Backward pagination (prev cursor) returns previous page."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)

    # Get first page
    page1 = await svc.list_all(limit=2)
    assert page1["next"] is not None

    # Get second page
    page2 = await svc.list_all(limit=2, cursor=page1["next"])
    assert page2["prev"] is not None

    # Go back to first page
    page1_again = await svc.list_all(limit=2, cursor=page2["prev"])
    page1_ids = [r["id"] for r in page1["resources"]]
    page1_again_ids = [r["id"] for r in page1_again["resources"]]
    assert page1_ids == page1_again_ids


@pytest.mark.asyncio
async def test_pagination_page_size_respected(seeded_db: AsyncSession, test_user: User) -> None:
    """Each page has at most `limit` items."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)

    cursor = None
    while True:
        result = await svc.list_all(limit=2, cursor=cursor)
        assert len(result["resources"]) <= 2
        if not result["next"]:
            break
        cursor = result["next"]


@pytest.mark.asyncio
async def test_include_total(seeded_db: AsyncSession, test_user: User) -> None:
    """include_total returns the total count of matching resources."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, include_total=True)

    assert result["total"] is not None
    assert result["total"] == len(result["resources"])


@pytest.mark.asyncio
async def test_include_total_with_filter(seeded_db: AsyncSession, test_user: User) -> None:
    """include_total reflects the filtered count, not the global count."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)

    all_result = await svc.list_all(limit=100, include_total=True)
    user_result = await svc.list_all(limit=100, include_total=True, principal_type="user")
    group_result = await svc.list_all(limit=100, include_total=True, principal_type="group")

    assert user_result["total"] + group_result["total"] == all_result["total"]


# ============================================================================
# Sorting
# ============================================================================


@pytest.mark.asyncio
async def test_sort_by_principal_name_asc(seeded_db: AsyncSession, test_user: User) -> None:
    """sort=principal_name orders by principal name ascending."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, sort="principal_name")

    names = [r["principal_name"] for r in result["resources"]]
    assert names == sorted(names)


@pytest.mark.asyncio
async def test_sort_by_principal_name_desc(seeded_db: AsyncSession, test_user: User) -> None:
    """sort=-principal_name orders by principal name descending."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, sort="-principal_name")

    names = [r["principal_name"] for r in result["resources"]]
    assert names == sorted(names, reverse=True)


@pytest.mark.asyncio
async def test_sort_by_role_name(seeded_db: AsyncSession, test_user: User) -> None:
    """sort=role_name orders by role name ascending."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, sort="role_name")

    names = [r["role_name"] for r in result["resources"]]
    assert names == sorted(names)


@pytest.mark.asyncio
async def test_sort_default_is_created_at_desc(seeded_db: AsyncSession, test_user: User) -> None:
    """Default sort is created_at descending (newest first)."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100)

    dates = [r["created_at"] for r in result["resources"] if r["created_at"]]
    assert dates == sorted(dates, reverse=True)


@pytest.mark.asyncio
async def test_sort_invalid_field_falls_back_to_default(seeded_db: AsyncSession, test_user: User) -> None:
    """Invalid sort field falls back to created_at descending."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)

    result_default = await svc.list_all(limit=100)
    result_invalid = await svc.list_all(limit=100, sort="nonexistent_field")

    default_ids = [r["id"] for r in result_default["resources"]]
    invalid_ids = [r["id"] for r in result_invalid["resources"]]
    assert default_ids == invalid_ids


# ============================================================================
# Edge cases
# ============================================================================


@pytest.mark.asyncio
async def test_empty_results(seeded_db: AsyncSession, test_user: User) -> None:
    """Filtering to a non-existent principal_name returns empty results."""
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100, principal_name="nonexistent-user-xyz")

    assert result["resources"] == []
    assert result["next"] is None
    assert result["prev"] is None


@pytest.mark.asyncio
async def test_first_page_has_no_prev_cursor(seeded_db: AsyncSession, test_user: User) -> None:
    """The first page should not have a prev cursor."""
    await _setup_data(seeded_db, test_user)
    svc = AllRoleAssignmentService(seeded_db, test_user)
    result = await svc.list_all(limit=100)

    assert result["prev"] is None
