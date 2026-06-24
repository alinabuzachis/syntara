"""Unit tests for the set_admin_password bootstrap tool (AAP-79855)."""

import importlib.util
import sys
from io import StringIO
from pathlib import Path
from types import ModuleType
from unittest.mock import AsyncMock, patch

_SCRIPT = Path(__file__).resolve().parents[3] / "tools" / "set_admin_password.py"


def _load_script() -> ModuleType:
    """Load set_admin_password.py directly, bypassing tools/__init__.py."""
    spec = importlib.util.spec_from_file_location("set_admin_password", _SCRIPT)
    assert spec is not None
    assert spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestSetAdminPasswordValidation:
    """Password complexity is enforced before hashing."""

    def test_weak_password_rejected(self) -> None:
        mod = _load_script()

        with patch.object(sys, "stdin", StringIO("weak\n")):
            result = mod.main()

        assert result == 1

    def test_short_password_rejected(self) -> None:
        mod = _load_script()

        with patch.object(sys, "stdin", StringIO("Short123!\n")):
            result = mod.main()

        assert result == 1

    def test_strong_password_accepted(self) -> None:
        mod = _load_script()

        with (
            patch.object(sys, "stdin", StringIO("ValidPassword123!\n")),
            patch.object(mod, "set_admin_password", AsyncMock()),
            patch.object(mod.asyncio, "run"),
        ):
            result = mod.main()

        assert result == 0
