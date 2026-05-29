"""Admin CLI entry point for Nexus administrative operations.

Usage::

    uv run python -m nexus.admin revoke-all-sessions
    uv run python -m nexus.admin revoke-all-sessions --yes

    uv run python -m nexus.admin revoke-user-sessions --username alice
    uv run python -m nexus.admin revoke-user-sessions --username alice --yes

    uv run python -m nexus.admin revoke-idp-sessions --idp-name "Corporate Okta"
    uv run python -m nexus.admin revoke-idp-sessions --idp-name "Corporate Okta" --yes
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import UTC, datetime
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable

import structlog

logger = structlog.stdlib.get_logger(__name__)

_HELP_SKIP_CONFIRM = "Skip confirmation prompt"


def _get_actor() -> str:
    """Return the OS login name of the user running the CLI."""
    try:
        return os.getlogin()
    except OSError:
        return "admin-cli"


def _register_audit_handlers() -> None:
    """Register auth-domain audit handlers with the dispatcher."""
    import nexus.auth.audit  # noqa: PLC0415
    from nexus.audit.discovery import discover_handlers  # noqa: PLC0415
    from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415

    auth_audit_registry = discover_handlers(nexus.auth.audit)
    AuditEventDispatcher.register(auth_audit_registry)


def _init_audit_writer() -> None:
    """Initialise the audit event writer so CLI audit events are persisted to the audit DB."""
    from nexus.audit.services.writer import get_audit_writer, init_audit_writer  # noqa: PLC0415
    from nexus.core.database.audit_session import AuditSessionLocal  # noqa: PLC0415

    if get_audit_writer() is None:
        init_audit_writer(session_factory=AuditSessionLocal)


async def _drain_audit_writer() -> None:
    """Block until all in-flight audit writes have completed."""
    from nexus.audit.services.writer import get_audit_writer  # noqa: PLC0415

    writer = get_audit_writer()
    if writer is not None:
        await writer.drain()


async def _revoke_all_tokens(actor: str) -> None:
    """Set the global revocation timestamp and emit an audit event."""
    _register_audit_handlers()
    _init_audit_writer()

    from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
    from nexus.auth.models.global_revocation_timestamp import GlobalRevocationTimestamp  # noqa: PLC0415
    from nexus.core.database.session import AsyncSessionLocal  # noqa: PLC0415

    now = datetime.now(UTC)
    timestamp_str = now.isoformat()

    from sqlalchemy import update as sa_update  # noqa: PLC0415

    async with AsyncSessionLocal() as session:
        stmt = (
            sa_update(GlobalRevocationTimestamp)
            .where(GlobalRevocationTimestamp.id == 1)  # type: ignore[arg-type]
            .values(revoked_before=now, updated_at=now)
        )
        result = await session.exec(stmt)
        if result.rowcount == 0:
            # Row doesn't exist yet — insert the singleton
            from sqlmodel import select  # noqa: PLC0415

            existing = (await session.exec(select(GlobalRevocationTimestamp))).one_or_none()
            if existing is None:
                session.add(GlobalRevocationTimestamp(id=1, revoked_before=now, updated_at=now))
        await session.commit()

        logger.info(
            "Global revocation timestamp set",
            timestamp=timestamp_str,
            actor=actor,
        )

        # Emit audit event inside the session scope so a crash between
        # commit and dispatch does not silently lose the audit record.
        from nexus.auth.audit.global_revocation import GlobalRevocationEvent  # noqa: PLC0415

        try:
            AuditEventDispatcher.dispatch(
                GlobalRevocationEvent(
                    actor_username=actor,
                    actor_source="cli",
                    revocation_timestamp=timestamp_str,
                )
            )
        except Exception:
            logger.exception(
                "Audit dispatch failed for global revocation",
                timestamp=timestamp_str,
                actor=actor,
            )

    await _drain_audit_writer()

    print(  # noqa: T201
        f"Global revocation timestamp set to {timestamp_str}\n"
        f"All tokens issued before this time are now invalid.\n"
        f"Actor: {actor}",
    )


async def _revoke_user_sessions(username: str, actor: str) -> None:
    """Revoke all sessions for a specific user."""
    _register_audit_handlers()
    _init_audit_writer()

    # Look up the user by username (case-insensitive)
    from sqlmodel import select  # noqa: PLC0415

    from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
    from nexus.auth.audit.session_revocation import SessionRevocationEvent  # noqa: PLC0415
    from nexus.auth.session import create_session_store  # noqa: PLC0415
    from nexus.core.database.session import AsyncSessionLocal  # noqa: PLC0415
    from nexus.core.models import User  # noqa: PLC0415

    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(User).filter(
                User.username == username.lower(),  # type: ignore[arg-type]
                User.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        user = result.one_or_none()

        if not user:
            print(f"ERROR: User '{username}' not found.")  # noqa: T201
            sys.exit(1)

        # Revoke all sessions and increment token version
        store = create_session_store(session)
        revoked_count = await store.revoke_all_for_user(user.id)
        await store.increment_token_version(user.id)
        await session.commit()

        logger.info(
            "Revoked all sessions for user",
            username=user.username,
            user_id=str(user.id),
            sessions_revoked=revoked_count,
            actor=actor,
        )

        # Emit audit event inside the session scope so a crash between
        # commit and dispatch does not silently lose the audit record.
        try:
            AuditEventDispatcher.dispatch(
                SessionRevocationEvent(
                    actor_username=actor,
                    actor_source="cli",
                    target_type="user",
                    target_identifier=user.username,
                    sessions_revoked=revoked_count,
                )
            )
        except Exception:
            logger.exception(
                "Audit dispatch failed for user session revocation",
                username=user.username,
                user_id=str(user.id),
                sessions_revoked=revoked_count,
                actor=actor,
            )

    await _drain_audit_writer()

    print(  # noqa: T201
        f"Revoked {revoked_count} session(s) for user '{user.username}'.\n"
        f"The user will need to re-authenticate.\n"
        f"Actor: {actor}",
    )


async def _revoke_idp_sessions(idp_name: str, actor: str) -> None:
    """Revoke all sessions authenticated via a specific identity provider."""
    _register_audit_handlers()
    _init_audit_writer()

    # Look up the identity provider by name
    from sqlmodel import select  # noqa: PLC0415

    from nexus.audit.dispatcher import AuditEventDispatcher  # noqa: PLC0415
    from nexus.auth.audit.session_revocation import SessionRevocationEvent  # noqa: PLC0415
    from nexus.auth.session import create_session_store  # noqa: PLC0415
    from nexus.core.database.session import AsyncSessionLocal  # noqa: PLC0415
    from nexus.identity_providers.models.identity_provider import IdentityProvider  # noqa: PLC0415

    async with AsyncSessionLocal() as session:
        result = await session.exec(
            select(IdentityProvider).filter(
                IdentityProvider.name == idp_name,  # type: ignore[arg-type]
                IdentityProvider.deleted_at.is_(None),  # type: ignore[union-attr]
            )
        )
        provider = result.one_or_none()

        if not provider:
            print(f"ERROR: Identity provider '{idp_name}' not found.")  # noqa: T201
            sys.exit(1)

        # Revoke all sessions for this IdP
        store = create_session_store(session)
        revoked_count = await store.revoke_by_idp(str(provider.id))
        await session.commit()

        logger.info(
            "Revoked all sessions for identity provider",
            idp_name=provider.name,
            idp_id=str(provider.id),
            sessions_revoked=revoked_count,
            actor=actor,
        )

        # Emit audit event inside the session scope so a crash between
        # commit and dispatch does not silently lose the audit record.
        try:
            AuditEventDispatcher.dispatch(
                SessionRevocationEvent(
                    actor_username=actor,
                    actor_source="cli",
                    target_type="idp",
                    target_identifier=provider.name,
                    sessions_revoked=revoked_count,
                )
            )
        except Exception:
            logger.exception(
                "Audit dispatch failed for IdP session revocation",
                idp_name=provider.name,
                idp_id=str(provider.id),
                sessions_revoked=revoked_count,
                actor=actor,
            )

    await _drain_audit_writer()

    print(  # noqa: T201
        f"Revoked {revoked_count} session(s) for identity provider '{provider.name}'.\n"
        f"Users who authenticated via this provider will need to re-authenticate.\n"
        f"Actor: {actor}",
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m nexus.admin",
        description="Nexus administrative operations.",
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # --- revoke-all-sessions ---
    revoke_parser = subparsers.add_parser(
        "revoke-all-sessions",
        help="Invalidate all sessions and tokens issued before the current time",
    )
    revoke_parser.add_argument(
        "--yes",
        action="store_true",
        default=False,
        help=_HELP_SKIP_CONFIRM,
    )

    # --- revoke-user-sessions ---
    user_parser = subparsers.add_parser(
        "revoke-user-sessions",
        help="Revoke all sessions for a specific user",
    )
    user_parser.add_argument(
        "--username",
        required=True,
        help="Username of the user whose sessions should be revoked",
    )
    user_parser.add_argument(
        "--yes",
        action="store_true",
        default=False,
        help=_HELP_SKIP_CONFIRM,
    )

    # --- revoke-idp-sessions ---
    idp_parser = subparsers.add_parser(
        "revoke-idp-sessions",
        help="Revoke all sessions authenticated via a specific identity provider",
    )
    idp_parser.add_argument(
        "--idp-name",
        required=True,
        help="Name of the identity provider whose sessions should be revoked",
    )
    idp_parser.add_argument(
        "--yes",
        action="store_true",
        default=False,
        help=_HELP_SKIP_CONFIRM,
    )

    return parser


def _confirm_or_abort(warning: str, *, skip: bool) -> None:
    """Print a warning and prompt for confirmation; abort on decline."""
    if skip:
        return
    print(warning)  # noqa: T201
    confirmation = input("Continue? [y/N]: ").strip().lower()
    if confirmation != "y":
        print("Aborted.")  # noqa: T201
        sys.exit(0)


def revoke_all_sessions(args: argparse.Namespace) -> None:
    """CLI handler for ``revoke-all-sessions``: confirm then set the global revocation timestamp."""
    _confirm_or_abort(
        "WARNING: This will invalidate ALL active sessions.\nAll users will need to re-authenticate.\n",
        skip=args.yes,
    )
    asyncio.run(_revoke_all_tokens(actor=_get_actor()))


def _run_revoke_user_sessions(args: argparse.Namespace) -> None:
    _confirm_or_abort(
        f"WARNING: This will revoke ALL sessions for user '{args.username}'.\nThe user will need to re-authenticate.\n",
        skip=args.yes,
    )
    asyncio.run(_revoke_user_sessions(username=args.username, actor=_get_actor()))


def _run_revoke_idp_sessions(args: argparse.Namespace) -> None:
    _confirm_or_abort(
        f"WARNING: This will revoke ALL sessions authenticated via '{args.idp_name}'.\n"
        f"Users who authenticated via this provider will need to re-authenticate.\n",
        skip=args.yes,
    )
    asyncio.run(_revoke_idp_sessions(idp_name=args.idp_name, actor=_get_actor()))


_COMMANDS: dict[str, tuple[Callable[[argparse.Namespace], None], str]] = {
    "revoke-all-sessions": (revoke_all_sessions, "Global session revocation failed"),
    "revoke-user-sessions": (_run_revoke_user_sessions, "User session revocation failed"),
    "revoke-idp-sessions": (_run_revoke_idp_sessions, "IdP session revocation failed"),
}


def main() -> None:
    """Parse arguments and execute the admin command."""
    parser = _build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    handler, error_msg = _COMMANDS[args.command]
    try:
        handler(args)
    except Exception:
        logger.exception(error_msg)
        sys.exit(1)


if __name__ == "__main__":
    main()
