"""Tests for principal migration consistency."""

from nexus.core.database.migrations.versions.a0b1c2d3e4f5_add_principals_table import (
    _OWNED_TABLES,
)
from nexus.core.models.base.user_owned import UserOwnedResource


def test_owned_tables_covers_all_user_owned_resource_subclasses() -> None:
    """Every concrete UserOwnedResource subclass must appear in the migration's _OWNED_TABLES.

    If this fails, a new UserOwnedResource subclass was added without updating
    the principal migration's FK retargeting list.
    """
    concrete_tables: set[str] = set()
    queue = list(UserOwnedResource.__subclasses__())
    while queue:
        cls = queue.pop()
        tablename = getattr(cls, "__tablename__", None)
        if (
            isinstance(tablename, str)
            and getattr(cls, "__table__", None) is not None
            and not tablename.startswith("mock_")
        ):
            concrete_tables.add(tablename)
        queue.extend(cls.__subclasses__())

    owned_set = set(_OWNED_TABLES)
    missing = concrete_tables - owned_set
    assert not missing, (
        f"Tables {missing} inherit from UserOwnedResource but are missing "
        f"from the principal migration's _OWNED_TABLES list. "
        f"Add them to a0b1c2d3e4f5_add_principals_table.py."
    )
