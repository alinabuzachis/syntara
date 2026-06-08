# Authorization Audit Events

Audit instrumentation for the authorization domain (`src/nexus/authz/`).

## Domain Events

### RoleAssignmentEvent

Tracks role assignment and revocation — the core "who gets what permissions" operation.

| Field | Type | Description |
|-------|------|-------------|
| `assignment_id` | UUID | Role assignment being acted on |
| `principal_type` | str | `"user"` or `"group"` |
| `principal_id` | UUID | User or group receiving/losing the role |
| `principal_name` | str | Display name of the principal |
| `role_name` | str | Name of the role being assigned/revoked |
| `action` | str | `"assigned"` or `"revoked"` |
| `project_id` | UUID \| None | Project scope (None for global assignments) |
| `error_type` | str \| None | Error class name if the operation failed |

**Handler:** `RoleAssignmentHandler`
- Category: `SECURITY_EVENT`
- Action: `role_assigned`, `role_revoked`
- Severity: `ERROR` on failure; `INFO` otherwise
- Sets `resource_urn` as `urn:nexus:role-assignment:{assignment_id}`

### RoleLifecycleEvent

Tracks role create, update, and delete operations. On delete, captures how many assignments were cascade-deleted.

| Field | Type | Description |
|-------|------|-------------|
| `role_id` | UUID | Role being acted on |
| `role_name` | str | Name of the role |
| `action` | str | `"created"`, `"updated"`, or `"deleted"` |
| `project_id` | UUID \| None | Owning project (None for system roles) |
| `affected_assignments_count` | int | Assignments cascade-deleted (populated on delete) |
| `error_type` | str \| None | Error class name if the operation failed |

**Handler:** `RoleLifecycleHandler`
- Category: `SECURITY_EVENT`
- Action: `role_created`, `role_updated`, `role_deleted`
- Severity: `WARNING` when deleting a role that has assignments; `ERROR` on failure; `INFO` otherwise
- Sets `resource_urn` as `urn:nexus:role:{role_id}`

### PolicyLifecycleEvent

Tracks policy create, update, and delete operations. On delete, captures how many roles had the policy removed.

| Field | Type | Description |
|-------|------|-------------|
| `policy_id` | UUID | Policy being acted on |
| `policy_name` | str | Name of the policy |
| `action` | str | `"created"`, `"updated"`, or `"deleted"` |
| `project_id` | UUID \| None | Owning project (None for system policies) |
| `affected_roles_count` | int | Roles that referenced this policy (populated on delete) |
| `error_type` | str \| None | Error class name if the operation failed |

**Handler:** `PolicyLifecycleHandler`
- Category: `SECURITY_EVENT`
- Action: `policy_created`, `policy_updated`, `policy_deleted`
- Severity: `WARNING` when deleting a policy referenced by roles; `ERROR` on failure; `INFO` otherwise
- Sets `resource_urn` as `urn:nexus:policy:{policy_id}`

## Instrumentation Layers

| Layer | Status | Details |
|-------|--------|---------|
| 1. Middleware | Automatic | All authorization endpoints captured by `AuditMiddleware` |
| 2. `@audit` | Active | All 10 state-changing endpoints (policy/role/assignment CRUD) |
| 3. CRUD | Pending | Models inherit `BaseResource`, ready for AAP-73776 |
| 4. Domain Events | Active | `RoleAssignmentEvent`, `RoleLifecycleEvent`, `PolicyLifecycleEvent` |

## Audit Trail Per Operation

**Role assign:** 3 events
1. `role_assigned` (RoleAssignmentEvent, SECURITY_EVENT, INFO)
2. `create_role_assignment` (@audit decorator, SECURITY_EVENT)
3. `request_completed` (AuditMiddleware, 201)

**Role revoke:** 3 events
1. `role_revoked` (RoleAssignmentEvent, SECURITY_EVENT, INFO)
2. `delete_role_assignment` (@audit decorator, SECURITY_EVENT)
3. `request_completed` (AuditMiddleware, 204)

**Policy/role create or update:** 3 events
1. `policy_created`/`role_created`/etc. (domain event, SECURITY_EVENT, INFO)
2. `create_policy`/`create_role`/etc. (@audit decorator, SECURITY_EVENT)
3. `request_completed` (AuditMiddleware, 201 or 200)

**Role delete with cascading assignments:** 3 events
1. `role_deleted` (RoleLifecycleEvent, SECURITY_EVENT, WARNING, affected_assignments_count=N)
2. `delete_role` (@audit decorator, SECURITY_EVENT)
3. `request_completed` (AuditMiddleware, 204)

**Policy delete affecting roles:** 3 events
1. `policy_deleted` (PolicyLifecycleEvent, SECURITY_EVENT, WARNING, affected_roles_count=N)
2. `delete_policy` (@audit decorator, SECURITY_EVENT)
3. `request_completed` (AuditMiddleware, 204)
