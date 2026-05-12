"""Authorization dependencies for FastAPI endpoints."""

from uuid import UUID

import structlog
from fastapi import Depends, Request
from fastapi.exceptions import RequestValidationError
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.dependencies import get_current_user
from nexus.authz.engine import (
    AllowedProjectsResult,
    AuthzRequest,
    AuthzResult,
    VisibilityResult,
    authorize,
    resolve_allowed_projects,
    resolve_visibility,
)
from nexus.authz.exceptions import AuthorizationDeniedError
from nexus.authz.models.project import Project
from nexus.authz.opa_client import OPAClient
from nexus.core.database.session import get_db
from nexus.core.models.user import User

logger = structlog.stdlib.get_logger(__name__)


def get_opa_client(request: Request) -> OPAClient:
    """Get the OPA client from app state.

    Args:
        request: FastAPI request.

    Returns:
        OPA client instance.

    """
    client: OPAClient = request.app.state.opa_client
    return client


class PermissionChecker:
    """FastAPI dependency that checks authorization via OPA.

    Usage:
        @router.post("", dependencies=[Depends(PermissionChecker("workflow", "create"))])
        async def create_workflow(...):
            ...

    For project-scoped checks, pass project_param to extract the project name
    from the path:
        Depends(PermissionChecker("project", "update", project_param="project_id"))

    """

    def __init__(
        self,
        resource_type: str,
        action: str,
        *,
        project_param: str | None = None,
        resource_model: type[SQLModel] | None = None,
        resource_id_param: str | None = None,
        body_project_field: str | None = None,
    ) -> None:
        """Initialize permission checker.

        Args:
            resource_type: The resource type (e.g., "workflow", "project").
            action: The action being performed (e.g., "read", "create", "delete").
            project_param: Path parameter name for project-scoped checks. When set,
                the checker looks up the project name from the database using this
                path parameter's UUID value.
            resource_model: SQLModel class with a project_id field. When set together
                with resource_id_param, the checker looks up the resource's project_id
                to enable project-scoped permission checks on single-resource endpoints.
            resource_id_param: Path parameter name for the resource ID (used with
                resource_model to look up project_id).
            body_project_field: JSON body field name containing a project UUID (e.g.,
                "project_id"). Used for create endpoints where the project context
                comes from the request body rather than the URL path.

        """
        self.resource_type = resource_type
        self.action = action
        self.project_param = project_param
        self.resource_model = resource_model
        self.resource_id_param = resource_id_param
        self.body_project_field = body_project_field

    async def _resolve_project_name(self, db: AsyncSession, project_id: str | UUID) -> str:
        """Look up project name by ID, returning empty string if not found."""
        result = await db.exec(
            select(Project.name).where(
                Project.id == (project_id if isinstance(project_id, UUID) else UUID(str(project_id))),
                Project.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        return result.first() or ""

    async def _resolve_project_from_resource(self, db: AsyncSession, resource_id: str) -> str:
        """Look up project name from a resource's project_id field."""
        if not self.resource_model or not resource_id:
            return ""
        model = self.resource_model
        try:
            rid = UUID(str(resource_id))
        except ValueError:
            raise RequestValidationError(
                [
                    {
                        "type": "uuid_parsing",
                        "loc": ("path", self.resource_id_param or "id"),
                        "msg": f"Invalid UUID format: {resource_id}",
                        "input": resource_id,
                    }
                ]
            ) from None
        res = await db.exec(
            select(model.project_id).where(model.id == rid)  # type: ignore[attr-defined]
        )
        proj_id = res.first()
        if not proj_id:
            return ""
        return await self._resolve_project_name(db, proj_id)

    async def _resolve_resource_project(self, request: Request, db: AsyncSession) -> tuple[str, str]:
        """Resolve resource_id and resource_project from the request context.

        Returns:
            Tuple of (resource_id, resource_project).

        """
        # Extract resource_id: use resource_id_param if specified, else default to "id" or "workflow_id"
        if self.resource_id_param:
            resource_id = request.path_params.get(self.resource_id_param, "")
        else:
            resource_id = request.path_params.get("id", request.path_params.get("workflow_id", ""))

        resource_project = ""

        # Option 1: project_id in path params
        if self.project_param:
            project_id = request.path_params.get(self.project_param, "")
            if project_id:
                resource_project = await self._resolve_project_name(db, project_id)
                if not resource_project:
                    from nexus.authz.exceptions import ProjectNotFoundError  # noqa: PLC0415

                    msg = f"Project {project_id} not found"
                    raise ProjectNotFoundError(msg)
                if self.resource_type == "project":
                    resource_id = str(project_id)

        # Option 2: look up project from the resource itself
        if not resource_project and self.resource_model and self.resource_id_param and resource_id:
            resource_project = await self._resolve_project_from_resource(db, resource_id)

        # Option 3: extract project_id from request body
        if not resource_project and self.body_project_field:
            body = await request.json()
            body_project_id = body.get(self.body_project_field)
            if body_project_id:
                resource_project = await self._resolve_project_name(db, body_project_id)
                if not resource_project:
                    from nexus.authz.exceptions import ProjectNotFoundError  # noqa: PLC0415

                    msg = f"Project {body_project_id} not found"
                    raise ProjectNotFoundError(msg)

        return str(resource_id) if resource_id else "", resource_project

    async def __call__(
        self,
        request: Request,
        current_user: User = Depends(get_current_user),  # noqa: B008
        db: AsyncSession = Depends(get_db),  # noqa: B008
    ) -> None:
        """Check if the current user is authorized.

        Args:
            request: FastAPI request.
            current_user: The authenticated user (ensures auth runs before authz).
            db: Database session.

        Raises:
            AuthorizationDeniedError: If the user is not authorized.

        """
        opa_client = get_opa_client(request)
        resource_id, resource_project = await self._resolve_resource_project(request, db)

        authz_request = AuthzRequest(
            user_id=current_user.id,
            action=self.action,
            resource_type=self.resource_type,
            resource_id=resource_id,
            resource_project=resource_project,
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        )

        authz_result: AuthzResult = await authorize(db, opa_client, authz_request)

        if not authz_result.allowed:
            logger.info(
                "Authorization denied",
                user_id=str(current_user.id),
                resource_type=self.resource_type,
                action=self.action,
                denied_by=authz_result.denied_by,
            )
            msg = f"Not authorized to perform {self.action} on {self.resource_type}"
            raise AuthorizationDeniedError(msg)


class ProjectScopeFilter:
    """FastAPI dependency that resolves which projects a user can access.

    Returns an AllowedProjectsResult that services can use to filter
    LIST queries to only include resources from authorized projects.

    Usage:
        @router.get("")
        async def list_credentials(
            allowed: AllowedProjectsResult = Depends(ProjectScopeFilter("credential", "read")),
        ):
            # Pass allowed to service for query filtering
            ...

    """

    def __init__(self, resource_type: str, action: str) -> None:
        """Initialize project scope filter.

        Args:
            resource_type: The resource type (e.g., "credential", "workflow").
            action: The action being performed (e.g., "read").

        """
        self.resource_type = resource_type
        self.action = action

    async def __call__(
        self,
        request: Request,
        current_user: User = Depends(get_current_user),  # noqa: B008
        db: AsyncSession = Depends(get_db),  # noqa: B008
    ) -> AllowedProjectsResult:
        """Resolve allowed projects for the current user.

        Args:
            request: FastAPI request.
            current_user: The authenticated user.
            db: Database session.

        Returns:
            AllowedProjectsResult with the set of accessible project IDs.

        """
        opa_client = get_opa_client(request)

        return await resolve_allowed_projects(
            db=db,
            opa_client=opa_client,
            user_id=current_user.id,
            resource_type=self.resource_type,
            action=self.action,
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        )


class VisibilityFilter:
    """FastAPI dependency that resolves what a user is allowed to see."""

    def __init__(self, resource_type: str, action: str) -> None:
        """Initialize visibility filter."""
        self.resource_type = resource_type
        self.action = action

    async def __call__(
        self,
        request: Request,
        current_user: User = Depends(get_current_user),  # noqa: B008
        db: AsyncSession = Depends(get_db),  # noqa: B008
    ) -> VisibilityResult:
        """Resolve visibility for the current user."""
        opa_client = get_opa_client(request)

        return await resolve_visibility(
            db=db,
            opa_client=opa_client,
            user_id=current_user.id,
            resource_type=self.resource_type,
            action=self.action,
            user_labels=current_user.labels,
            user_metadata=current_user.authz_metadata,
        )
