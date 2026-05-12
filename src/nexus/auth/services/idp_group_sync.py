"""IdP group sync service for OIDC login.

Handles syncing Nexus group memberships based on identity provider
group mapping configuration during OIDC authentication flows.
"""

from fnmatch import fnmatch
from typing import Any
from uuid import UUID

import jmespath
import structlog
from sqlalchemy import delete as sa_delete
from sqlmodel import col, select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.constants import FieldLimits
from nexus.core.models import Group, User, UserIdentity
from nexus.core.models.group import user_groups, user_idp_groups
from nexus.identity_providers.models.identity_provider_configuration import (
    OIDCConfiguration,
    OIDCIdpType,
)
from nexus.identity_providers.models.idp_group_mapping import IdpGroupMappingEntry
from nexus.settings.cache.settings_cache import get_runtime_settings

logger = structlog.stdlib.get_logger(__name__)


def extract_idp_group_values(
    jmespath_expr: str,
    raw_merged_claims: dict[str, Any],
    user_id: UUID,
) -> set[str] | None:
    """Extract group values from claims using JMESPath. Returns None on error."""
    logger.debug(
        "Evaluating JMESPath expression for group sync",
        expression=jmespath_expr,
        user_id=str(user_id),
    )
    try:
        raw_groups = jmespath.search(jmespath_expr, raw_merged_claims)
    except (ValueError, TypeError, jmespath.exceptions.JMESPathError):
        logger.warning("JMESPath expression failed during group sync", expression=jmespath_expr, user_id=str(user_id))
        return None

    if not isinstance(raw_groups, list):
        raw_groups = [raw_groups] if raw_groups else []
    return {str(g) for g in raw_groups if g is not None}


def match_group_entries(
    mapping_entries: list[IdpGroupMappingEntry],
    idp_group_values: set[str],
) -> set[UUID]:
    """Match IdP group values against mapping entries, supporting glob wildcards.

    Entries can use ``*``, ``?``, and ``[seq]`` patterns (fnmatch syntax).
    For example, ``admin*`` matches ``admin-prod`` and ``admin-staging``.
    A bare ``*`` matches every group value.
    """
    desired: set[UUID] = set()
    for entry in mapping_entries:
        pattern = entry.idp_group_value
        if pattern == "*":
            logger.warning(
                "Wildcard '*' mapping matches all IdP groups — all provider users added to group",
                nexus_group_id=str(entry.nexus_group_id),
            )
            desired.add(entry.nexus_group_id)
            continue
        for value in idp_group_values:
            if fnmatch(value, pattern):
                desired.add(entry.nexus_group_id)
                break  # no need to check more values for this entry
    return desired


def _is_valid_group_name(name: str) -> bool:
    """Check if an IdP group name is valid for auto-creation (same rules as local groups)."""
    return 0 < len(name) <= FieldLimits.NAME_MAX_LENGTH


async def _resolve_auto_create_groups(
    db: AsyncSession,
    idp_group_values: set[str],
    user_id: UUID,
) -> set[UUID]:
    """Find or create Nexus groups by name for auto-create mode.

    For each IdP group value, look up a Nexus group with that name.
    If none exists, create it. Uses a single flush for all new groups.
    Group names are validated; login is denied if the token exceeds the
    configured ``authentication.max_auto_create_groups`` limit (0 = no limit).
    """
    if not idp_group_values:
        return set()

    cache = get_runtime_settings()
    max_groups = await cache.get_int("authentication.max_auto_create_groups")
    if max_groups > 0 and len(idp_group_values) > max_groups:
        logger.warning(
            "Too many IdP groups in token for auto-create, skipping auto-create for this provider",
            count=len(idp_group_values),
            limit=max_groups,
            user_id=str(user_id),
        )
        return set()

    # Filter out invalid group names
    valid_names = {name for name in idp_group_values if _is_valid_group_name(name)}
    skipped = idp_group_values - valid_names
    if skipped:
        logger.warning(
            "Skipped invalid IdP group names during auto-create",
            skipped=list(skipped),
            user_id=str(user_id),
        )

    if not valid_names:
        return set()

    # Batch-lookup existing groups by name
    result = await db.execute(
        select(Group).filter(
            col(Group.name).in_(valid_names),
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    existing_groups = {g.name: g for g in result.scalars().all()}

    desired: set[UUID] = set()
    new_groups: list[Group] = []
    for group_name in valid_names:
        group = existing_groups.get(group_name)
        if not group:
            group = Group(name=group_name, created_by=user_id, source="idp")
            db.add(group)
            new_groups.append(group)
        else:
            desired.add(group.id)

    if new_groups:
        await db.flush()
        for group in new_groups:
            logger.info("Auto-created group from IdP", group_name=group.name, group_id=str(group.id))
            desired.add(group.id)

    return desired


async def _resolve_aap_role_groups(
    db: AsyncSession,
    raw_merged_claims: dict[str, Any],
    user_id: UUID,
    config: OIDCConfiguration,
) -> set[UUID] | None:
    """Map AAP ``aap_system_role`` claim to built-in group IDs.

    Validates that the token's ``iss`` claim matches the configured
    ``issuer_url`` before trusting AAP-specific claims.  Returns ``None``
    on issuer mismatch to signal that login should be denied.  Normal
    users get no explicit group assignment — they already have the
    ``user`` role via the implicit ``authenticated`` group.
    """
    token_issuer = raw_merged_claims.get("iss")
    if not isinstance(token_issuer, str) or token_issuer.rstrip("/") != config.issuer_url.rstrip("/"):
        logger.warning(
            "AAP role mapping denied: token issuer does not match configured issuer_url",
            token_issuer=token_issuer,
            expected_issuer=config.issuer_url,
            user_id=str(user_id),
        )
        return None

    role_to_group = {
        "system_administrator": "admins",
        "system_auditor": "auditors",
    }
    system_role = raw_merged_claims.get("aap_system_role")
    target_name = role_to_group.get(system_role) if isinstance(system_role, str) else None

    if not target_name:
        logger.debug(
            "AAP role mapping: normal user, no explicit group needed",
            user_id=str(user_id),
            aap_system_role=system_role,
        )
        return set()

    result = await db.execute(
        select(Group).filter(
            col(Group.name) == target_name,
            col(Group.is_builtin) == True,  # noqa: E712
            Group.deleted_at.is_(None),  # type: ignore[union-attr]
        )
    )
    group = result.scalars().first()
    if not group:
        logger.error(
            "Built-in group not found for AAP role mapping",
            group_name=target_name,
            user_id=str(user_id),
        )
        return None

    logger.debug(
        "AAP role mapping resolved group",
        group_name=target_name,
        group_id=str(group.id),
        user_id=str(user_id),
        aap_system_role=system_role,
    )
    return {group.id}


_DEFAULT_JMESPATH_EXPRESSION = "groups[*]"


def _resolve_jmespath_expression(config: OIDCConfiguration) -> str:
    """Determine the JMESPath expression to use for group extraction."""
    return config.group_jmespath_expression or _DEFAULT_JMESPATH_EXPRESSION


async def _resolve_claim_based_groups(
    db: AsyncSession,
    user: User,
    raw_merged_claims: dict[str, Any],
    config: OIDCConfiguration,
    provider_id: UUID,
    mapping_entries: list[IdpGroupMappingEntry],
) -> set[UUID] | None:
    """Resolve groups from JMESPath/auto-create/manual mapping. Returns None on extraction failure."""
    jmespath_expr = _resolve_jmespath_expression(config)
    idp_group_values = extract_idp_group_values(jmespath_expr, raw_merged_claims, user.id)
    if idp_group_values is None:
        logger.error(
            "JMESPath group extraction failed",
            expression=jmespath_expr,
            user_id=str(user.id),
            provider_id=str(provider_id),
        )
        return None

    if config.auto_create_groups:
        return await _resolve_auto_create_groups(db, idp_group_values, user.id)
    return match_group_entries(mapping_entries, idp_group_values)


async def sync_idp_groups(
    db: AsyncSession,
    user: User,
    identity: UserIdentity,
    raw_merged_claims: dict[str, Any],
    config: OIDCConfiguration,
) -> bool:
    """Sync Nexus group memberships based on IdP group mapping.

    Only touches groups managed by this specific identity provider.
    Manually-assigned groups are never affected.

    Returns:
        True if at least one group was resolved from this provider.
        False if no groups were resolved — the caller should deny login
        unless the user has groups from other sources.

    """
    aap_role_mapping = config.aap_role_mapping_enabled and config.idp_type == OIDCIdpType.AAP
    provider_id = identity.identity_provider_id

    # Load mapping entries from DB table
    mapping_entries_result = await db.execute(
        select(IdpGroupMappingEntry).where(IdpGroupMappingEntry.identity_provider_id == provider_id)
    )
    mapping_entries = list(mapping_entries_result.scalars().all())

    has_claim_based = config.auto_create_groups or bool(mapping_entries)
    if not has_claim_based and not aap_role_mapping:
        return False

    desired_group_ids: set[UUID] = set()

    if has_claim_based:
        result = await _resolve_claim_based_groups(db, user, raw_merged_claims, config, provider_id, mapping_entries)
        if result is None and not aap_role_mapping:
            return False
        if result is None and aap_role_mapping:
            logger.warning(
                "JMESPath extraction failed but login proceeding via AAP role mapping",
                user_id=str(user.id),
                provider_id=str(provider_id),
            )
        if result is not None:
            desired_group_ids = result

    aap_validated = False
    if aap_role_mapping:
        aap_group_ids = await _resolve_aap_role_groups(db, raw_merged_claims, user.id, config)
        if aap_group_ids is None:
            return False
        desired_group_ids = desired_group_ids | aap_group_ids
        aap_validated = True

    has_matched = len(desired_group_ids) > 0 or aap_validated

    await _apply_group_membership_diff(db, user.id, provider_id, desired_group_ids)

    return has_matched


async def _apply_group_membership_diff(
    db: AsyncSession,
    user_id: UUID,
    provider_id: UUID,
    desired_group_ids: set[UUID],
) -> None:
    """Diff desired groups against current IdP-managed groups and apply changes."""
    current_rows = await db.execute(
        select(user_idp_groups.c.group_id).where(
            user_idp_groups.c.user_id == user_id,
            user_idp_groups.c.identity_provider_id == provider_id,
        )
    )
    current_idp_group_ids: set[UUID] = {row[0] for row in current_rows}

    to_add = desired_group_ids - current_idp_group_ids
    to_remove = current_idp_group_ids - desired_group_ids

    if to_add:
        existing_rows = await db.execute(
            select(user_groups.c.group_id).where(
                user_groups.c.user_id == user_id,
                user_groups.c.group_id.in_(to_add),
            )
        )
        already_member: set[UUID] = {row[0] for row in existing_rows}
        new_memberships = to_add - already_member
        if new_memberships:
            await db.execute(
                user_groups.insert(),
                [{"user_id": user_id, "group_id": gid} for gid in new_memberships],
            )

    if to_remove:
        other_provider_rows = await db.execute(
            select(user_idp_groups.c.group_id).where(
                user_idp_groups.c.user_id == user_id,
                user_idp_groups.c.group_id.in_(to_remove),
                user_idp_groups.c.identity_provider_id != provider_id,
            )
        )
        kept_by_other: set[UUID] = {row[0] for row in other_provider_rows}
        removable = to_remove - kept_by_other
        if removable:
            await db.execute(
                sa_delete(user_groups).where(
                    user_groups.c.user_id == user_id,
                    user_groups.c.group_id.in_(removable),
                )
            )

    await db.execute(
        sa_delete(user_idp_groups).where(
            user_idp_groups.c.user_id == user_id,
            user_idp_groups.c.identity_provider_id == provider_id,
        )
    )
    if desired_group_ids:
        await db.execute(
            user_idp_groups.insert(),
            [{"user_id": user_id, "identity_provider_id": provider_id, "group_id": gid} for gid in desired_group_ids],
        )

    if to_add or to_remove:
        logger.info(
            "Synced IdP group memberships",
            user_id=str(user_id),
            provider_id=str(provider_id),
            added=len(to_add),
            removed=len(to_remove),
        )
