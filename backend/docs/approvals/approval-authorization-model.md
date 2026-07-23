# Approval Authorization Model

## Overview

The approvals component implements a **two-layer authorization model** that combines RBAC permission checks with explicit approver list validation. This design ensures that:

1. Only users with the `approval:decide` permission can approve requests (RBAC layer)
2. Among those users, only designated approvers or group members can act on specific approvals (approver list layer)
3. Service principals (S2S callers) bypass both layers for workflow engine operations
4. Information leakage is prevented through careful ordering of authorization checks
5. Race conditions are handled via database-level optimistic locking

This document details the authorization logic, security properties, and implementation patterns used throughout the approvals service.

---

## Two-Layer Authorization Model

### Layer 1: RBAC Permission Check

All approval decision operations require the `approval:decide` permission evaluated by the OPA-based authorization engine. This permission can be granted:

- **System-level**: User can approve any approval request in the system
- **Project-scoped**: User can approve requests within specific projects

The service constructs an `AuthzRequest` with the user's identity, the `decide` action on the `approval` resource type, and the project scope (if any). The OPA evaluator returns an allow/deny decision. If the user lacks the permission, authorization fails immediately before reaching the approver list check.

### Layer 2: Approver List Check

After passing the RBAC check, the system validates whether the user is in the approval's designated approver list. There are three cases:

**Case 1: No approvers configured** (empty lists)

When both `approver_user_records` and `approver_group_records` are empty, any user with `approval:decide` permission can approve. This is the pure RBAC fallback.

**Case 2: Approver users configured**

The service checks whether the user's UUID appears in the approval's `approver_user_records` junction table.

**Case 3: Approver groups configured**

The service queries the group membership service to determine if the user belongs to any group in the `approver_group_records` junction table. Authorization succeeds if the user is in the user list OR is a member of any designated group.

---

## Security Properties

### Information Leakage Prevention

Authorization checks are performed **before** status checks to prevent information disclosure through error message differences.

The `decide()` method checks authorization first: if the user is not an authorized approver, it raises `ApprovalNotAuthorizedError` (403). Only after authorization passes does it check whether the approval is still pending, raising `ApprovalAlreadyDecidedError` (409) if not.

**Why this matters**: If status were checked first, an unauthorized user could determine whether an approval is pending vs. decided by observing the exception type (403 vs 409), leaking business state to unauthorized parties.

### Race Condition Handling (TOCTOU)

The service uses **two distinct locking strategies** depending on the operation:

**Single decisions** use **optimistic locking**. The service issues an `UPDATE ... WHERE id = :id AND status = 'pending'` statement. This atomic SQL pattern acts as the optimistic lock: only the first concurrent decision modifies a row (`rowcount == 1`). Any subsequent concurrent decision finds zero rows affected (`rowcount == 0`), triggering a rollback and an `ApprovalAlreadyDecidedError`.

**Batch decisions** (`batch_decide`) use **pessimistic locking** via `SELECT ... FOR UPDATE` (`approval_service.py`). This row-level lock prevents interleaving between concurrent batches that overlap on the same approval IDs — a scenario where optimistic locking would cause excessive retries.

**How it works**: The `UPDATE` statement includes `WHERE status = PENDING` in addition to the ID filter. If two users decide simultaneously:

1. Both pass authorization and status checks
2. First user's `UPDATE` succeeds (1 row affected)
3. Second user's `UPDATE` finds no matching rows (status is no longer PENDING)
4. `rowcount == 0` triggers a rollback and `AlreadyDecidedError`

### Transactional Integrity

Approval creation and approver list population occur within a **single database transaction**. If any foreign key constraint fails (invalid user_id or group_id), the entire transaction is rolled back with no orphaned records.

The `create()` method inserts the approval record, flushes to obtain its ID, then inserts rows into the `approval_approver_users` and `approval_approver_groups` junction tables within the same transaction. On commit, the database's foreign key constraints validate all user and group UUIDs. If any FK constraint fails (invalid UUID), an `IntegrityError` is caught, the transaction is rolled back, and the error is mapped to a `ValueError` (400) -- no orphaned records are left behind.

**FK constraint violations** indicate programming errors (passing non-existent UUIDs), not normal user input. The upstream workflow engine resolves approvers before calling the API, so only valid UUIDs should reach this point under normal operation.

---

## Service Principal Access

Service principals (cert-authenticated S2S callers) **bypass both authorization layers**. This allows the workflow engine to perform administrative operations like canceling approvals when a workflow is terminated.

The authorization check compares the caller's UUID against the set of known service principal IDs (derived deterministically from their certificate CNs). If the caller is a recognized service principal, authorization succeeds immediately without consulting OPA or the approver list.

**Why this is safe**: Service principals are authenticated via mTLS certificates and have immutable UUIDs derived from their certificate CN. They represent trusted internal system components (e.g., the Temporal workflow worker), not external users.

---

## Batch Authorization

The `batch_decide` endpoint performs **per-approval authorization checks** rather than a single system-level check. This enables users with **project-scoped** `approval:decide` permission to batch approve requests within their authorized projects.

The `batch_decide` endpoint (`POST /batch`) processes each decision independently. If some decisions fail due to authorization or validation errors, the successful ones are still recorded. The response includes detailed results for each decision.

**Implementation**: The `_process_single_decision` method calls `_is_user_authorized_approver` for each approval in the batch, performing both the RBAC check and the approver list check. As with single decisions, authorization is checked before status to prevent information leakage.

**Note**: The `batch_decide` endpoint does **not** have an endpoint-level `RequirePermission` dependency. Instead, the `_is_user_authorized_approver` method encapsulates both the RBAC permission check and the approver list check, and is called per-approval inside the service. This design supports users who have project-scoped (not just system-level) `approval:decide` permissions.

---

## Approver Junction Tables

### Table Structure

Two many-to-many junction tables link approvals to authorized approvers:

**`approval_approver_users`** — Links approval requests to individual users

This table has a composite primary key of `(approval_id, user_id)`, with foreign keys to `approval_requests.id` and `users.id` respectively. Both foreign keys use `CASCADE` on delete.

**`approval_approver_groups`** — Links approval requests to groups (any group member can approve)

This table has a composite primary key of `(approval_id, group_id)`, with foreign keys to `approval_requests.id` and `groups.id` respectively. Both foreign keys use `CASCADE` on delete.

### Foreign Key Column Names

**CRITICAL**: The FK column names are `approval_id`, **not** `approval_request_id`.

```sql
-- Correct FK column names
approval_approver_users.approval_id → approval_requests.id
approval_approver_groups.approval_id → approval_requests.id
```

### Cascade Behavior

Both junction tables use `ondelete="CASCADE"`:

- Deleting an approval request automatically removes all associated approver records
- Deleting a user removes them from all approval approver lists
- Deleting a group removes it from all approval approver lists

This ensures referential integrity without orphaned junction records.

---

## Error Handling

### Exception Types

The service raises specific exceptions for different authorization and validation failures:

- **`ApprovalNotAuthorizedError`** -- Raised when a user attempts to decide an approval they are not authorized for. Carries the `approval_id` and `user_id` for logging. Mapped to a 403 response via a dedicated error handler.

- **`ApprovalAlreadyDecidedError`** -- Raised when attempting to decide an already-decided approval. Carries the `approval_id` and `current_status`. Mapped to a 409 response.

- **`ApprovalNotFoundError`** -- Raised when an approval request is not found. Carries the `approval_id`. Mapped to a 404 response.

### Exception Ordering in Decision Flow

The `decide()` method raises exceptions in this order:

1. `ApprovalNotFoundError` (404) — Approval doesn't exist
2. `ApprovalNotAuthorizedError` (403) — User not authorized (checked **before** status)
3. `ApprovalAlreadyDecidedError` (409) — Approval already decided

**Security note**: Authorization is checked before status to prevent information leakage (see "Information Leakage Prevention" above).

### Defensive Programming: Relationship Loading

The `_is_user_authorized_approver` method includes a **defensive check** to ensure relationships were eagerly loaded before accessing them in an async context.

The method uses SQLAlchemy's instance inspector to verify that the `approver_user_records` and `approver_group_records` relationships were eagerly loaded before accessing them. If either relationship is unloaded, a `RuntimeError` is raised with a message directing the caller to use `_get_approval_by_id()` or `selectinload()`. This catches programmer errors early with a clear diagnostic, rather than allowing a cryptic `MissingGreenlet` error in the async context.

**Why this matters**: Accessing SQLAlchemy relationships without eager loading in an async context raises `MissingGreenlet` errors. This defensive check catches programmer errors at runtime with a clear message.

---

## Summary

The approvals authorization model provides defense-in-depth through:

1. **Two-layer checks**: RBAC permission + explicit approver list validation
2. **Information leakage prevention**: Authorization checked before status
3. **Race condition handling**: Database-level optimistic locking via `WHERE status=PENDING`
4. **Transactional integrity**: Atomic creation with FK validation
5. **Service principal bypass**: Trusted S2S callers skip both layers
6. **Project-scoped batch operations**: Per-approval authorization in batch_decide
7. **Defensive programming**: Runtime checks for relationship loading

This model balances security, flexibility, and operational correctness for approval workflows in a distributed system.
