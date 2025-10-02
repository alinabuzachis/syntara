"""Integration tests for the `check_path_sequence` CLI entry point."""

# Ruff S603 warns about subprocess usage; the calls below use fully controlled
# arguments to run the CLI under test and are safe in this context.

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve().parents[3] / "tools" / "ci" / "check_path_sequence.py"


def test_cli_passes_for_contiguous_sequence(tmp_path: Path) -> None:
    """CLI exits successfully when numbering is contiguous."""
    (tmp_path / "001-first.txt").write_text("content")
    (tmp_path / "002-second").mkdir()
    (tmp_path / "readme.md").write_text("ignore")

    result = subprocess.run(  # noqa: S603
        [sys.executable, str(SCRIPT_PATH), str(tmp_path)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 0
    assert "PASSED" in result.stdout
    assert result.stderr == ""


def test_cli_reports_missing_numbers(tmp_path: Path) -> None:
    """CLI flags missing numbers in the sequence."""
    (tmp_path / "001-first.txt").write_text("content")
    (tmp_path / "003-second").mkdir()

    result = subprocess.run(  # noqa: S603
        [sys.executable, str(SCRIPT_PATH), str(tmp_path)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 1
    assert "Missing sequence number 002 before 003-second" in result.stderr


def test_cli_reports_strict_start_requirement(tmp_path: Path) -> None:
    """Strict mode enforces sequences to start at 001."""
    (tmp_path / "010-first.txt").write_text("content")
    (tmp_path / "011-second.txt").write_text("content")

    result = subprocess.run(  # noqa: S603
        [sys.executable, str(SCRIPT_PATH), "--strict", str(tmp_path)],
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode == 1
    assert "Strict mode requires sequence to start at 001" in result.stderr
