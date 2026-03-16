# Feature Specification: Installation ID

**Feature Branch**: `035-installation-id`
**Created**: 2026-03-13
**Status**: Draft
**Input**: User description: "This spec covers the installation_id, an unique UUID stored in the database used to identify an installation. This installation_id will be used by the telemetry."
**Jira**: [ANSTRAT-1748](ANSTRAT-1748)

## Supersedes

This specification supersedes the `entitlement_id` aspects of the following specs:

- **030-workflow-runtime-telemetry** — previously used `entitlement_id` as the installation identifier for workflow telemetry events
- **031-segment-analytics-integration** — previously consumed `entitlement_id` from configuration for Segment analytics
- **032-api-analytics-events** — previously relied on `entitlement_id` for API analytics event attribution

All references to `entitlement_id` as the primary installation identifier in these specs are replaced by the database-persisted `installation_id` defined here. The `entitlement_id` becomes an optional, supplementary field (see FR-006).

## Context

Per discussion on ANSTRAT-1748 (2026-03-12), Nexus can now be deployed standalone without a co-located AAP instance. This means the `entitlement_id` (which depends on AAP's `subscription_id`) cannot always be obtained. The agreed approach is:

1. Introduce an `installation_id` — a UUID generated and stored in the database to identify each Nexus installation
2. Make the `entitlement_id` optional — it remains useful when AAP is present but is no longer required
3. Derive the Segment `anonymousId` from a hash of the `installation_id` combined with the database host name and database name — this uniquely identifies an Automation Orchestrator and Automation Gateway pair for telemetry grouping and segmentation

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Installation Identification (Priority: P1)

During database initialization, a unique UUID is generated and stored as the installation ID. Every Nexus component can then read this identifier and use it for telemetry. Unlike the previous `entitlement_id` approach, this works for both AAP-integrated and standalone deployments without any manual configuration.

**Why this priority**: The installation ID is the foundational building block for all telemetry. Without a stable identifier persisted in the database, the system cannot reliably distinguish between installations.

**Independent Test**: Can be verified by initializing the database and confirming the telemetry subsystem reads and uses the resulting installation ID.

**Acceptance Scenarios**:

1. **Given** an initialized database, **When** the installation table is queried, **Then** exactly one record exists containing a valid UUID.
2. **Given** a running Nexus instance, **When** a telemetry event is emitted, **Then** the event includes the installation ID from the database.

---

### User Story 2 - Telemetry Integration with Derived Telemetry Identifier (Priority: P2)

The telemetry system derives a unique telemetry identifier by combining the `installation_id` with the database connection coordinates (host name and database name). This derived identifier uniquely identifies an Automation Orchestrator and Automation Gateway pair for telemetry grouping and segmentation purposes. This ensures that telemetry data is consistently attributed even across restarts, configuration changes, or standalone deployments where no `entitlement_id` is available.

**Why this priority**: Telemetry attribution is the primary consumer of the installation ID. The derivation approach with database coordinates prevents accidental correlation when a dev/stage environment is based on a production database snapshot.

**Independent Test**: Can be tested by verifying that telemetry events include a consistent derived telemetry identifier, and that changing the database connection coordinates produces a different identifier.

**Acceptance Scenarios**:

1. **Given** a Nexus instance with a database-persisted installation ID, **When** any telemetry event is sent, **Then** the telemetry identifier is derived from the installation ID combined with the database connection coordinates.
2. **Given** two Nexus instances sharing the same database, **When** telemetry events are sent from both, **Then** both produce the same telemetry identifier.
3. **Given** a database snapshot restored to a different host, **When** telemetry events are sent, **Then** the telemetry identifier differs from the original environment (preventing cross-environment correlation).

---

### User Story 3 - Optional Entitlement ID (Priority: P3)

When Nexus is deployed alongside an AAP instance, the `entitlement_id` (AAP subscription identifier) can optionally be provided. When present, it is included in telemetry events as supplementary context for Red Hat to correlate telemetry with subscription data. When absent (standalone deployments), telemetry functions normally using only the `installation_id`.

**Why this priority**: The entitlement ID adds business value by linking telemetry to subscriptions, but it is not required for telemetry to function. Making it optional enables standalone deployments without breaking telemetry.

**Independent Test**: Can be tested by configuring Nexus with and without an entitlement ID and verifying that telemetry events are sent in both cases, with the entitlement ID included only when configured.

**Acceptance Scenarios**:

1. **Given** a Nexus instance with an `entitlement_id` configured, **When** telemetry events are sent, **Then** the events include both the derived telemetry identifier and the `entitlement_id`.
2. **Given** a standalone Nexus instance without an `entitlement_id`, **When** telemetry events are sent, **Then** the events include only the derived telemetry identifier and telemetry functions normally.

---

### Edge Cases

- What happens if the installation record is manually deleted from the database? The next database initialization creates a new installation ID, effectively treating the instance as a new installation for telemetry purposes.
- What happens if multiple application instances start concurrently against the same database? The database initialization ensures only one installation ID exists; all instances read the same record.
- What happens if a production database snapshot is used in a dev/stage environment? The derived telemetry identifier changes because the database connection coordinates differ, preventing telemetry cross-contamination. The `installation_id` in the database remains the same, which is a known trade-off.
- What happens if the database host name or database name changes (e.g., DNS failover, infrastructure migration, container rescheduling)? The derived telemetry identifier changes. The system SHOULD log the new telemetry identifier at startup so operators have visibility into the change. The `installation_id` itself remains stable in the database.
- What happens to existing installations that were using `entitlement_id` for telemetry? After upgrade, telemetry events use the new derived telemetry identifier. The `entitlement_id`, if still configured, continues to be included as a supplementary field, allowing the analytics backend to correlate old and new telemetry streams via the shared `entitlement_id`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Database initialization MUST generate a unique UUID and insert it as the installation ID when no installation record exists.
- **FR-002**: System MUST persist the installation ID in the database so it survives application restarts.
- **FR-003**: System MUST ensure only one installation ID exists in the database at any time.
- **FR-004**: System MUST derive a stable telemetry identifier from the installation ID and the database connection coordinates (host name and database name), ensuring distinct environments produce distinct identifiers.
- **FR-005**: System MUST use the derived telemetry identifier for all telemetry events.
- **FR-006**: System MUST treat the `entitlement_id` as optional. When configured, it is included in telemetry events as a supplementary field. When absent, telemetry functions using only the derived telemetry identifier.
- **FR-007**: System MUST NOT require any manual configuration for the installation ID to be generated and used for telemetry.
- **FR-008**: System SHOULD log the derived telemetry identifier at startup so operators can detect changes caused by infrastructure modifications (e.g., database host migration).

### Key Entities

- **Installation**: Represents a single Nexus deployment. Contains a unique UUID identifier. Only one record exists per database. Created during database initialization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every Nexus installation has a unique, stable UUID persisted in the database after first startup.
- **SC-002**: The installation ID remains unchanged across application restarts (100% consistency).
- **SC-003**: All telemetry events include a derived telemetry identifier based on the installation ID and database connection coordinates.
- **SC-004**: No manual configuration is required to generate or maintain the installation ID.
- **SC-005**: Telemetry functions correctly in standalone deployments without an `entitlement_id`.
- **SC-006**: Database snapshots restored to different environments produce distinct telemetry identifiers, preventing telemetry cross-contamination.
- **SC-007**: Existing installations that upgrade to the new system continue to include `entitlement_id` (when configured) alongside the new telemetry identifier, preserving correlation capability.

## Assumptions

- The database is the authoritative source for the installation ID. The `NEXUS_ENTITLEMENT_ID` environment variable is no longer the primary installation identifier; it becomes an optional supplementary field.
- A single database corresponds to a single Nexus installation. Multiple application instances sharing the same database are considered part of the same installation.
- UUID v4 (random) is used for generating installation IDs, following standard practices for unique identifier generation.
- The installation ID is not considered sensitive data and does not require encryption at rest beyond standard database security.
- The derivation function used for the telemetry identifier is a collision-resistant hash. The combination of installation ID + database connection coordinates provides sufficient uniqueness for telemetry segmentation.
- Nexus can be deployed standalone (without AAP), which is why the `entitlement_id` must be optional.
