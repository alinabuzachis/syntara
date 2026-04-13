#!/usr/bin/env python3
"""Comprehensive Alembic migration validation using testcontainers.

Spins up a temporary PostgreSQL container (via Podman or Docker) and runs
four migration checks:
  1. Migration chain integrity (alembic history)
  2. No multiple heads (alembic heads)
  3. Pending changes detection (alembic upgrade head + alembic check)
  4. Full downgrade/upgrade round-trip
"""

import os
import sys
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.util.exc import CommandError
from testcontainers.postgres import PostgresContainer  # type: ignore[import-untyped]

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
POSTGRES_IMAGE = os.getenv("POSTGRES_IMAGE", "quay.io/sclorg/postgresql-15-c9s")

RED = "\033[91m"
GREEN = "\033[92m"
BLUE = "\033[94m"
RESET = "\033[0m"


def _get_alembic_config(db_url: str) -> Config:
    alembic_cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option(
        "script_location",
        str(PROJECT_ROOT / "src" / "nexus" / "core" / "database" / "migrations"),
    )
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)
    return alembic_cfg


def check_migration_chain(cfg: Config) -> None:
    """Walk the full revision history and exit with an error if the chain is broken."""
    print(f"\n{BLUE}📋 Step 1: Validating migration chain...{RESET}")
    try:
        script = ScriptDirectory.from_config(cfg)
        # Walking the full revision history will raise if the chain is broken
        list(script.walk_revisions())
    except Exception as exc:
        print(f"{RED}❌ Migration chain is broken!{RESET}", file=sys.stderr)
        print(f"   {exc}", file=sys.stderr)
        print("\nThis usually means:", file=sys.stderr)
        print("  - A migration file was deleted", file=sys.stderr)
        print("  - A migration references a missing parent", file=sys.stderr)
        print("  - Merge conflicts weren't properly resolved", file=sys.stderr)
        sys.exit(1)
    print(f"{GREEN}✅ Migration chain is valid{RESET}")


def check_multiple_heads(cfg: Config) -> None:
    """Detect and report multiple migration heads, exiting with an error if found."""
    print(f"\n{BLUE}📋 Step 2: Checking for multiple heads...{RESET}")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    if len(heads) > 1:
        print(f"{RED}❌ Multiple migration heads detected ({len(heads)} heads)!{RESET}", file=sys.stderr)
        print("\nMigration heads:", file=sys.stderr)
        for head in heads:
            print(f"  {head}", file=sys.stderr)
        print("\nMerge them with: alembic merge -m 'merge heads' <rev1> <rev2>", file=sys.stderr)
        sys.exit(1)
    print(f"{GREEN}✅ No multiple heads detected{RESET}")


def check_pending_migrations(cfg: Config) -> None:
    """Apply migrations to head and verify no un-generated changes exist in models."""
    print(f"\n{BLUE}📋 Step 3: Applying migrations and checking for pending changes...{RESET}")
    print("   Upgrading to head...")
    try:
        command.upgrade(cfg, "head")
    except Exception as exc:
        print(f"{RED}❌ Failed to upgrade to head{RESET}", file=sys.stderr)
        print(f"   {exc}", file=sys.stderr)
        sys.exit(1)

    print("   Checking for pending migrations...")
    try:
        command.check(cfg)
    except CommandError as exc:
        print(f"{RED}❌ Pending migrations detected or models don't match migrations!{RESET}", file=sys.stderr)
        print(f"   {exc}", file=sys.stderr)
        print("\nThis usually means:", file=sys.stderr)
        print("  - Models were changed without creating a migration", file=sys.stderr)
        print("  - Run 'alembic revision --autogenerate -m \"description\"' to create migration", file=sys.stderr)
        sys.exit(1)
    print(f"{GREEN}✅ No pending migrations, models match migrations{RESET}")


def check_downgrade_upgrade(cfg: Config) -> None:
    """Downgrade to base then upgrade to head to verify round-trip consistency."""
    print(f"\n{BLUE}📋 Step 4: Testing downgrade/upgrade consistency...{RESET}")
    print("   Downgrading to base (removing all migrations)...")
    try:
        command.downgrade(cfg, "base")
    except Exception as exc:
        print(f"{RED}❌ Downgrade to base failed!{RESET}", file=sys.stderr)
        print(f"   {exc}", file=sys.stderr)
        print("\nThis usually means:", file=sys.stderr)
        print("  - A downgrade() function in one of the migrations is broken", file=sys.stderr)
        print("  - Missing or incorrect downgrade logic", file=sys.stderr)
        sys.exit(1)

    print("   Upgrading back to head...")
    try:
        command.upgrade(cfg, "head")
    except Exception as exc:
        print(f"{RED}❌ Upgrade to head failed after downgrade!{RESET}", file=sys.stderr)
        print(f"   {exc}", file=sys.stderr)
        sys.exit(1)

    print(f"{GREEN}✅ Full downgrade/upgrade cycle successful{RESET}")


def main() -> None:
    """Run all migration checks, spinning up a testcontainer for DB-backed steps."""
    print(f"{BLUE}🔍 Running comprehensive migration checks...{RESET}")

    # Steps 1-2 only read migration files from disk — no DB needed.
    # Run them first so we fail fast before spinning up a container.
    cfg_no_db = _get_alembic_config("sqlite://")
    check_migration_chain(cfg_no_db)
    check_multiple_heads(cfg_no_db)

    print(f"\n   Using image: {POSTGRES_IMAGE}")
    pg_container = PostgresContainer(POSTGRES_IMAGE)
    # sclorg images require POSTGRESQL_* env vars instead of POSTGRES_*
    if "sclorg" in POSTGRES_IMAGE:
        pg_container.with_env("POSTGRESQL_USER", pg_container.username)
        pg_container.with_env("POSTGRESQL_PASSWORD", pg_container.password)
        pg_container.with_env("POSTGRESQL_DATABASE", pg_container.dbname)
    with pg_container as pg:
        db_url = pg.get_connection_url(driver="asyncpg")
        cfg = _get_alembic_config(db_url)

        check_pending_migrations(cfg)
        check_downgrade_upgrade(cfg)

    print(f"\n{GREEN}✅ All migration checks passed!{RESET}")


if __name__ == "__main__":
    main()
