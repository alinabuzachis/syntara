"""Unit tests for the `check_path_sequence` helpers."""

from collections.abc import Iterator
from pathlib import Path

import pytest

from tools.ci.check_path_sequence import (
    CheckIssue,
    DirectoryEntriesProvider,
    PathSequenceChecker,
    RegexPrefixNumberExtractor,
)


class StubEntriesProvider(DirectoryEntriesProvider):
    """Test double returning predefined paths."""

    def __init__(self, names: list[str]) -> None:
        """Store the fake entry names to iterate over."""
        self._entries = [Path(name) for name in names]

    def entries(self, _path: Path) -> Iterator[Path]:
        """Yield the predefined entries irrespective of the requested path."""
        yield from self._entries


@pytest.mark.parametrize(
    "names",
    [
        ["001-alpha.txt", "002-bravo"],
        ["010-foo", "011-bar", "012-baz"],
    ],
)
def test_check_passes_when_numbers_are_contiguous(names: list[str]) -> None:
    """Checker succeeds for contiguous numbering."""
    checker = PathSequenceChecker(
        extractor=RegexPrefixNumberExtractor(),
        entries_provider=StubEntriesProvider(names),
    )
    outcome = checker.check(Path("dummy/location"))

    assert outcome.ok
    assert outcome.issues == []


def test_check_ignores_names_without_numeric_prefix() -> None:
    """Names lacking numeric prefixes are ignored."""
    checker = PathSequenceChecker(
        extractor=RegexPrefixNumberExtractor(),
        entries_provider=StubEntriesProvider(["readme.md", "001-first", "misc"]),
    )
    outcome = checker.check(Path("dummy/location"))

    assert outcome.ok
    assert outcome.issues == []


def test_check_detects_missing_numbers() -> None:
    """Missing sequence numbers are reported as issues."""
    checker = PathSequenceChecker(
        extractor=RegexPrefixNumberExtractor(),
        entries_provider=StubEntriesProvider(["001-a", "003-c"]),
    )
    outcome = checker.check(Path("dummy/location"))

    assert not outcome.ok
    (issue,) = outcome.issues
    assert issue == CheckIssue(description="Missing sequence number 002 before 003-c")


def test_check_detects_duplicates() -> None:
    """Duplicate sequence numbers are reported."""
    checker = PathSequenceChecker(
        extractor=RegexPrefixNumberExtractor(),
        entries_provider=StubEntriesProvider(["001-a", "001-b", "002-c"]),
    )
    outcome = checker.check(Path("dummy/location"))

    assert not outcome.ok
    (issue,) = outcome.issues
    assert issue.description == "Duplicate sequence numbers detected: 001 (001-a, 001-b)"


def test_strict_requires_sequence_starting_at_one() -> None:
    """Strict mode enforces the 001 start."""
    checker = PathSequenceChecker(
        extractor=RegexPrefixNumberExtractor(),
        entries_provider=StubEntriesProvider(["010-a", "011-b"]),
    )
    outcome = checker.check(Path("dummy/location"), strict=True)

    assert not outcome.ok
    (issue,) = outcome.issues
    assert issue.description == "Strict mode requires sequence to start at 001 but found 010"
