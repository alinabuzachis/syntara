"""Guardrail: fail if nexus source modules were imported before coverage starts.

pytest11 entry-point plugins are imported during plugin discovery, which happens
BEFORE pytest_load_initial_conftests (where pytest-cov starts its tracer). Any
nexus.* modules imported at entry-point load time are invisible to coverage.py —
their def/class lines never get traced, producing phantom coverage gaps.

Usage — load this module as an early plugin:
    pytest -p nexus_test_sdk.check_early_imports --cov ...
"""

import sys

import pytest


@pytest.hookimpl(tryfirst=True)
def pytest_load_initial_conftests(early_config, parser, args):
    nexus_modules = sorted(m for m in sys.modules if m.startswith("nexus."))
    if not nexus_modules:
        return

    raise pytest.UsageError(
        f"\n{'=' * 72}\n"
        f"EARLY IMPORT DETECTED — coverage will miss these modules\n"
        f"{'=' * 72}\n\n"
        f"{len(nexus_modules)} nexus.* module(s) are already in sys.modules at\n"
        f"pytest_load_initial_conftests time. pytest-cov starts its tracer in\n"
        f"this same hook, so these modules' def/class lines will never be\n"
        f"recorded by coverage.py.\n\n"
        f"Root cause: a pytest11 entry-point plugin imports nexus.* at module\n"
        f"scope. Entry points are loaded during plugin discovery, before any\n"
        f"hooks fire.\n\n"
        f"Imported modules:\n"
        + "\n".join(f"  - {m}" for m in nexus_modules[:30])
        + (f"\n  ... and {len(nexus_modules) - 30} more" if len(nexus_modules) > 30 else "")
        + f"\n{'=' * 72}"
    )
