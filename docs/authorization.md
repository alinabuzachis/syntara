# Authorization

Nexus uses [Open Policy Agent (OPA)](https://www.openpolicyagent.org/) for policy-based authorization. The system supports both Role-Based Access Control (RBAC) and Attribute-Based Access Control (ABAC) with project-scoped multi-tenancy.

## Architecture

```
Request → Authentication → PermissionChecker → Policy Resolver → OPA → Allow/Deny
```

1. **Authentication**: Identifies the user via `get_current_user()`
2. **PermissionChecker**: FastAPI dependency that extracts resource type, action, and project context from the request
3. **Policy Resolver**: Resolves the user's effective policies from the database (via roles, groups, and project assignments)
4. **OPA**: Evaluates the Rego policy against the resolved policies and request context
5. **Decision**: Allow (200) or deny (403 Forbidden)

Authorization is **deny-by-default** — requests are denied unless an explicit allow policy matches.

## Key Concepts

### Policies

A policy contains one or more **statements** that define what actions are allowed or denied:

```json
{
  "name": "workflow:read:any",
  "statements": [
    {
      "effect": "allow",
      "actions": ["workflow:read"],
      "scope": "any"
    }
  ]
}
```

- **effect**: `"allow"` or `"deny"`. Deny takes precedence over allow.
- **actions**: List of `"resource_type:action"` strings. Supports wildcards like `"workflow:*"`.
- **scope**: Controls where the policy applies:
  - `"any"` — applies globally to all resources
  - `"self"` — applies only to the user's own resource (e.g., `user:read` on own user record)
  - `"project"` — applies only within a specific project (set via project role assignments)

### Roles

A role bundles a set of policies via a `role_policies` join table (many-to-many):

```json
{
  "name": "user",
  "policies": ["workflow:read:any", "workflow:create:any", "execution:run:any"]
}
```

### Groups

Groups organize users. The `authenticated` group implicitly includes all authenticated users. Users can be added to additional groups for fine-grained access.

### Projects

Projects provide resource isolation. Resources belong to projects, and users can have different roles in different projects.

## Built-in Roles

Defined in `BUILTIN_ROLES_REGISTRY` in `src/nexus/authz/role_conventions.py`:

| Role | Builtin | Description | Key Permissions |
|------|---------|-------------|-----------------|
| `admin` | yes | Full system access | All policies |
| `auditor` | yes | Read-only with audit visibility | Read workflows, executions, approvals, policies, roles |
| `user` | yes | Standard user | CRUD workflows, run executions, read/update self, create projects |
| `project-admin` | yes | Full access within a project | Manage project, assign roles, CRUD workflows/executions |
| `project-user` | yes | Standard access within a project | Read project, CRUD workflows, run executions |
| `project-auditor` | yes | Read-only within a project | Read project, workflows, executions |
| `default` | no | Baseline for all authenticated users (editable) | Read/update self, create projects |

Policies are assigned to roles via the `roles` parameter on `PermissionChecker` (for route-scoped policies) or `PolicyInfo.roles` (for extra policies). These declarations drive the auto-generated migrations.

Role-to-policy relationships are stored in a `role_policies` join table (many-to-many), providing referential integrity and normalized queries.

## Database Schema

The authorization system uses these tables:

| Table | Model | Location | Description |
|-------|-------|----------|-------------|
| `policies` | `Policy` | `src/nexus/authz/models/policy.py` | IAM-style policies with JSONB statements |
| `roles` | `Role` | `src/nexus/authz/models/role.py` | Named roles (builtin or custom) |
| `role_policies` | `RolePolicyLink` | `src/nexus/authz/models/role.py` | Many-to-many join table linking roles to policies |
| `groups` | `Group` | `src/nexus/core/models/group.py` | User groups with labels |
| `user_groups` | *(association table)* | `src/nexus/core/models/group.py` | User-to-group membership (SQLAlchemy Table) |
| `user_role_assignments` | `UserRoleAssignment` | `src/nexus/authz/models/assignments.py` | User-to-role with optional `project_id` for scoping |
| `group_role_assignments` | `GroupRoleAssignment` | `src/nexus/authz/models/assignments.py` | Group-to-role with optional `project_id` for scoping |
| `projects` | `Project` | `src/nexus/authz/models/project.py` | Resource isolation boundaries |

Both assignment tables use a **nullable `project_id`** column with conditional unique indexes to handle global and project-scoped assignments in a single table.

## How Roles Are Assigned

Roles reach users through multiple paths:

```
User
├── Direct: UserRoleAssignment (project_id=NULL) → Role → Policies (global scope)
├── Direct: UserRoleAssignment (project_id=X)    → Role → Policies (project scope)
├── Groups:
│   └── GroupMembership → Group → GroupRoleAssignment (project_id=NULL) → Role → Policies (global)
│   └── GroupMembership → Group → GroupRoleAssignment (project_id=X)    → Role → Policies (project)
```

Both `UserRoleAssignment` and `GroupRoleAssignment` use a nullable `project_id` column to distinguish scope:

- **`project_id IS NULL`** → global assignment, policies apply system-wide
- **`project_id IS NOT NULL`** → project-scoped assignment, policies apply only within that project

## Default Bootstrap State

On first boot, Alembic migrations seed policies and roles via `POLICY_OPS` / `ROLE_OPS` (the same ops the migration generator produces). The seed module (`src/nexus/authz/seed.py`) replays these migration ops and then creates:

- `authenticated` group (builtin, implicit — all users belong to it)
- `admins` group (builtin)
- `default` project
- `admin` user (member of `admins` group)
- `default` role → `authenticated` group via `GroupRoleAssignment` with `project_id=NULL` (global)
- `admin` role → `admins` group via `GroupRoleAssignment` with `project_id=NULL` (global)
- `project-user` role → `authenticated` group via `GroupRoleAssignment` with `project_id=<default project>` (project-scoped)

This means every authenticated user can immediately read/update their own profile, create projects, and work with workflows/executions in the `default` project.

There are two seeding paths:
- `seed_authz_data()` — full seed that replays migration ops (requires sync connection for asyncpg greenlet compatibility). Used by tests.
- `seed_groups_project_admin()` — lightweight seed that only creates groups, project, and assignments. Used at app startup after migrations have already run.

## Protecting API Endpoints

Use the `PermissionChecker` dependency on your router endpoints:

```python
from nexus.authz.dependencies import PermissionChecker

# Simple check: user must have workflow:create permission
# The roles parameter declares which built-in roles receive this policy automatically
@router.post("", dependencies=[Depends(PermissionChecker(
    "workflow", "create",
    roles=["admin", "user", "project-admin", "project-user"],
))])
async def create_workflow(...):
    ...

# Project-scoped check: resolves project from path parameter
@router.put(
    "/{project_id}",
    dependencies=[Depends(PermissionChecker(
        "project", "update",
        project_param="project_id",
        roles=["admin", "project-admin"],
    ))]
)
async def update_project(...):
    ...

# Resource lookup: resolves project from the resource's project_id field
@router.delete(
    "/{workflow_id}",
    dependencies=[Depends(PermissionChecker(
        "workflow", "delete",
        resource_model=Workflow,
        resource_id_param="workflow_id",
        roles=["admin", "user", "project-admin", "project-user"],
    ))]
)
async def delete_workflow(...):
    ...

# Body-based: extracts project_id from the request body
@router.post(
    "",
    dependencies=[Depends(PermissionChecker(
        "workflow", "create",
        body_project_field="project_id",
        roles=["admin", "user", "project-admin", "project-user"],
    ))]
)
async def create_workflow_in_project(...):
    ...
```

The `roles` parameter is not used at runtime — it declares which built-in roles should receive the policy when the migration generator runs (see below).

### Filtering List Endpoints by Project

Use `ProjectScopeFilter` to restrict list queries to projects the user can access:

```python
from nexus.authz.dependencies import ProjectScopeFilter
from nexus.authz.engine import AllowedProjectsResult

@router.get("")
async def list_workflows(
    allowed: AllowedProjectsResult = Depends(ProjectScopeFilter("workflow", "read")),
):
    # Use allowed.project_ids to filter your query
    ...
```

## Conditions (ABAC)

Policies support optional conditions for attribute-based matching. All specified conditions must match (AND logic):

```json
{
  "name": "workflow:read:dev-only",
  "statements": [
    {
      "effect": "allow",
      "actions": ["workflow:read"],
      "scope": "any",
      "conditions": {
        "resource_labels": {"env": "dev"},
        "resource_labels_not": {"env": "prod"},
        "user_labels": {"team": "platform"},
        "user_metadata": {"clearance": "high"},
        "group_labels": {"department": "engineering"}
      }
    }
  ]
}
```

| Condition | Matches Against |
|-----------|----------------|
| `resource_labels` | Labels on the resource being accessed |
| `resource_labels_not` | Inverted — resource must NOT have these label values |
| `user_labels` | Labels on the requesting user |
| `user_metadata` | Metadata on the requesting user |
| `resource_metadata` | Metadata on the resource |
| `group_labels` | Labels on any group the user belongs to |

If a condition key is absent from the policy, it is not checked (backward compatible).

## OPA Policy Logic

The Rego policy (`src/nexus/authz/rego/authz.rego`) implements deny-first evaluation:

1. **Deny check**: If any policy with `effect: "deny"` matches the action, scope, and conditions → **denied**
2. **Allow check**: If no deny matched AND any policy with `effect: "allow"` matches → **allowed**
3. **Default**: If neither matched → **denied** (deny-by-default)

The OPA response includes:
- `allow` / `deny` — boolean decision
- `matched_policy` — name of the first allow policy that matched
- `denied_by` — name of the first deny policy that fired
- `denial_reason` — `"policy_deny"` if explicitly denied
- `allowed_projects` — set of project names the user can access (for list filtering)

## Query Endpoints

The `/authz` router provides introspection endpoints (all POST):

| Endpoint | Description |
|----------|-------------|
| `POST /authz/can-i` | Check if current user can perform an action |
| `POST /authz/who-can` | List users who can perform an action (debug) |
| `POST /authz/what-can-i` | List all permissions for the current user |

## Policy and Role Auto-Generation

Policies and roles are managed through Alembic migrations. The system automatically discovers new policies and roles and generates the corresponding migration code.

### How It Works

1. **Route scanning**: The route scanner inspects all `NexusRouter` routes for `PermissionChecker` and `ProjectScopeFilter` dependencies, extracting `(resource_type, action, roles)` tuples as `PolicyInfo` objects.

2. **Extra policies registry**: Policies that can't be discovered from routes (self-scoped, audit, etc.) are declared in `EXTRA_POLICIES_REGISTRY` in `src/nexus/authz/role_conventions.py`.

3. **Role registry**: All built-in roles are declared in `BUILTIN_ROLES_REGISTRY` in the same file.

4. **Migration generation**: When you run `alembic revision --autogenerate`, the Alembic hook compares discovered policies/roles against those already tracked in existing migrations. New ones get a generated migration with `POLICY_OPS` and/or `ROLE_OPS`.

### Adding a New Policy

For route-based policies, just add `PermissionChecker` with `roles` to your endpoint — the migration generator picks it up automatically:

```python
@router.post("", dependencies=[Depends(PermissionChecker(
    "credential", "create",
    roles=["admin", "user", "project-admin"],
))])
async def create_credential(...):
    ...
```

For non-route policies (e.g., self-scoped or audit), add to `EXTRA_POLICIES_REGISTRY`:

```python
# In src/nexus/authz/role_conventions.py
EXTRA_POLICIES_REGISTRY: list[PolicyInfo] = [
    ...
    PolicyInfo("credential", "read", scope="self", roles=("admin", "user")),
]
```

Then run:
```bash
uv run alembic revision --autogenerate -m "add credential policies"
```

### Adding a New Role

Add a `RoleInfo` to `BUILTIN_ROLES_REGISTRY`:

```python
# In src/nexus/authz/role_conventions.py
BUILTIN_ROLES_REGISTRY: list[RoleInfo] = [
    ...
    RoleInfo("credential-manager", "Manages credentials across projects"),
]
```

Then run `alembic revision --autogenerate` to generate the migration.

## CLI Tools

The `tools/authz_cli.py` script provides commands for managing authorization data during development:

```bash
# Seed built-in data
uv run tools/authz_cli.py seed-builtin

# User management (authenticates as admin by default)
uv run tools/authz_cli.py create-user alice --email alice@test.com --full-name "Alice" --password secret
uv run tools/authz_cli.py list-users

# Group management
uv run tools/authz_cli.py create-group platform-team
uv run tools/authz_cli.py add-group-member platform-team alice

# Role assignment (global)
uv run tools/authz_cli.py assign-role user --user alice           # direct user→role
uv run tools/authz_cli.py assign-role user --group platform-team  # group→role

# Role assignment (project-scoped)
uv run tools/authz_cli.py assign-role project-admin --user bob --project staging

# Project management (as a specific user)
uv run tools/authz_cli.py --username alice --password secret create-project staging

# Permission checks (as a specific user)
uv run tools/authz_cli.py --username alice --password secret can-i read workflow wf-1
uv run tools/authz_cli.py --username alice --password secret what-can-i
```

## Local Development Setup

Authorization requires OPA running alongside the API:

```bash
# Start all services (includes OPA)
make run-all

# Or start just OPA
podman-compose up opa
```

OPA runs on port 8181 and loads Rego policies from `src/nexus/authz/rego/`.

### Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `APP_OPA_URL` | `http://localhost:8181` | OPA server URL |
| `APP_AUTHZ_DEFAULT_PROJECT` | `default` | Default project name |

## Testing

```bash
# Run all authz tests
make test-all

# Unit tests (Rego policy logic via opa eval)
uv run pytest tests/unit/authz/ -v

# Integration tests (API-level authz enforcement)
uv run pytest tests/integration/api/test_authz*.py -v
```

Unit tests validate the Rego policy directly using `opa eval`. Integration tests exercise the full stack with a mock OPA client.
