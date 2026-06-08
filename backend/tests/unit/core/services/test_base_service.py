"""Unit tests for BaseService._apply_access_filters."""

from uuid import uuid4

import pytest
from sqlmodel import select

from nexus.authz.engine import AllowedProjectsResult
from nexus.core.models import User
from nexus.core.services.base import BaseService
from nexus.workflows.models.workflow import Workflow


class TestApplyAccessFilters:
    """Tests for BaseService._apply_access_filters static method."""

    def test_no_filters_returns_query(self) -> None:
        query = select(User)
        result = BaseService._apply_access_filters(query, User, None, None)
        assert result is not None

    def test_all_projects_returns_query(self) -> None:
        query = select(Workflow)
        allowed = AllowedProjectsResult(all_projects=True, project_ids=[])
        result = BaseService._apply_access_filters(query, Workflow, allowed, None)
        assert result is not None

    def test_empty_project_ids_returns_none(self) -> None:
        query = select(Workflow)
        allowed = AllowedProjectsResult(all_projects=False, project_ids=[])
        result = BaseService._apply_access_filters(query, Workflow, allowed, None)
        assert result is None

    def test_project_ids_returns_filtered_query(self) -> None:
        query = select(Workflow)
        pid = uuid4()
        allowed = AllowedProjectsResult(all_projects=False, project_ids=[pid])
        result = BaseService._apply_access_filters(query, Workflow, allowed, None)
        assert result is not None

    def test_model_without_project_id_raises(self) -> None:
        query = select(User)
        allowed = AllowedProjectsResult(all_projects=False, project_ids=[uuid4()])
        with pytest.raises(ValueError, match="does not have a project_id field"):
            BaseService._apply_access_filters(query, User, allowed, None)

    def test_empty_id_restriction_returns_none(self) -> None:
        query = select(User)
        result = BaseService._apply_access_filters(query, User, None, [])
        assert result is None

    def test_id_restriction_returns_filtered_query(self) -> None:
        query = select(User)
        result = BaseService._apply_access_filters(query, User, None, [uuid4()])
        assert result is not None

    def test_both_filters_applied(self) -> None:
        query = select(Workflow)
        pid = uuid4()
        uid = uuid4()
        allowed = AllowedProjectsResult(all_projects=False, project_ids=[pid])
        result = BaseService._apply_access_filters(query, Workflow, allowed, [uid])
        assert result is not None

    def test_project_allowed_but_empty_id_restriction(self) -> None:
        query = select(Workflow)
        pid = uuid4()
        allowed = AllowedProjectsResult(all_projects=False, project_ids=[pid])
        result = BaseService._apply_access_filters(query, Workflow, allowed, [])
        assert result is None
