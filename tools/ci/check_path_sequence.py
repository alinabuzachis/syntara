"""CLI tool to validate numbered path entries for contiguous, duplicate-free sequences."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from itertools import pairwise
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

if TYPE_CHECKING:
    from collections.abc import Iterable, Sequence

GREEN = "\033[92m"
RED = "\033[91m"
RESET = "\033[0m"


def _leading_number_width(name: str) -> int:
    """Return the width of the leading numeric prefix in ``name``."""
    match = re.match(r"(\d+)", name)
    if not match:
        return 0
    return len(match.group(1))


@dataclass(frozen=True)
class CheckIssue:
    """Represents a single reason why a sequence check failed."""

    description: str


@dataclass(frozen=True)
class CheckOutcome:
    """Result generated after validating a path."""

    path: Path
    ok: bool
    issues: Sequence[CheckIssue]

    @property
    def message(self) -> str:
        """Return a colored status message describing the outcome."""
        if self.ok:
            return f"check_path_sequence: {self.path} - {GREEN}PASSED{RESET}"

        reasons = "; ".join(issue.description for issue in self.issues)
        return f"check_path_sequence: {self.path} - {RED}ERROR{RESET}: {reasons}"


class NumberExtractor(Protocol):
    """Extracts a numeric prefix from a filesystem entry name, if present."""

    def extract(self, name: str) -> int | None:
        """Return the extracted number or ``None`` when not found."""


class RegexPrefixNumberExtractor:
    """Extracts numbers appearing at the beginning of a string using a regex."""

    def __init__(self, pattern: str = r"^(\d+)") -> None:
        """Store the compiled regular expression used for extraction."""
        self._pattern = re.compile(pattern)

    def extract(self, name: str) -> int | None:
        """Return the leading integer found in ``name`` when present."""
        match = self._pattern.match(name)
        if not match:
            return None
        return int(match.group(1))


class DirectoryEntriesProvider:
    """Supplies directory entries for inspection."""

    def entries(self, path: Path) -> Iterable[Path]:
        """Yield files and directories directly contained in ``path``."""
        for entry in path.iterdir():
            # Files and directories are in-scope. Other types are ignored for now.
            if entry.is_file() or entry.is_dir():
                yield entry


class PathSequenceChecker:
    """Validates numbered entries within a directory."""

    def __init__(
        self,
        extractor: NumberExtractor,
        entries_provider: DirectoryEntriesProvider,
    ) -> None:
        """Initialize the checker with collaborators for extensibility."""
        self._extractor = extractor
        self._entries_provider = entries_provider

    def check(self, path: Path, *, strict: bool = False) -> CheckOutcome:
        """Validate the numbering sequence discovered under ``path``."""
        numbered_entries: dict[int, list[str]] = {}

        for entry in self._entries_provider.entries(path):
            number = self._extractor.extract(entry.name)
            if number is None:
                continue
            numbered_entries.setdefault(number, []).append(entry.name)

        if not numbered_entries:
            return CheckOutcome(path=path, ok=True, issues=[])

        issues: list[CheckIssue] = []
        numbers = sorted(numbered_entries)

        duplicates_issue = self._detect_duplicate_issue(numbered_entries)
        if duplicates_issue:
            issues.append(duplicates_issue)

        missing_issue = self._detect_missing_issue(numbers, numbered_entries)
        if missing_issue:
            issues.append(missing_issue)

        first_number = numbers[0]
        if strict and first_number != 1:
            issues.append(
                CheckIssue(description=(f"Strict mode requires sequence to start at 001 but found {first_number:03d}")),
            )

        return CheckOutcome(path=path, ok=not issues, issues=issues)

    @staticmethod
    def _detect_duplicate_issue(numbered_entries: dict[int, list[str]]) -> CheckIssue | None:
        duplicates = {number: names for number, names in numbered_entries.items() if len(names) > 1}
        if not duplicates:
            return None

        formatted_duplicates: list[str] = []
        for number, names in sorted(duplicates.items()):
            sorted_names = sorted(names)
            width = _leading_number_width(sorted_names[0])
            formatted_number = str(number).zfill(width) if width else str(number)
            formatted_duplicates.append(f"{formatted_number} ({', '.join(sorted_names)})")

        description = ", ".join(formatted_duplicates)
        return CheckIssue(description=f"Duplicate sequence numbers detected: {description}")

    @staticmethod
    def _detect_missing_issue(numbers: list[int], numbered_entries: dict[int, list[str]]) -> CheckIssue | None:
        for current, following in pairwise(numbers):
            if following - current <= 1:
                continue

            causing_name = sorted(numbered_entries[following])[0]
            width = _leading_number_width(causing_name)
            missing_number = str(current + 1).zfill(width) if width else str(current + 1)
            return CheckIssue(
                description=f"Missing sequence number {missing_number} before {causing_name}",
            )

        return None


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments and return the resulting namespace."""
    parser = argparse.ArgumentParser(
        description="Validate that numbered files and folders form a contiguous sequence.",
    )
    parser.add_argument(
        "path",
        type=Path,
        help="Directory containing numbered files or folders.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Require the sequence to start at 001 (ignored otherwise).",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Execute the CLI entry point and return a process exit code."""
    args = parse_args(argv)
    target_path = args.path.resolve()

    if not target_path.exists():
        sys.stderr.write(f"check_path_sequence: {target_path} - {RED}ERROR{RESET}: Path does not exist.\n")
        return 1

    if not target_path.is_dir():
        sys.stderr.write(f"check_path_sequence: {target_path} - {RED}ERROR{RESET}: Path is not a directory.\n")
        return 1

    checker = PathSequenceChecker(
        extractor=RegexPrefixNumberExtractor(),
        entries_provider=DirectoryEntriesProvider(),
    )
    outcome = checker.check(target_path, strict=args.strict)
    stream = sys.stdout if outcome.ok else sys.stderr
    stream.write(f"{outcome.message}\n")
    return 0 if outcome.ok else 1


if __name__ == "__main__":
    sys.exit(main())
