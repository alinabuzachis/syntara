"""CLI tool to validate file formatting (whitespace, EOF, line endings)."""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

# File patterns to check
FILE_PATTERNS = [
    "**/*.py",
    "**/*.yaml",
    "**/*.yml",
    "**/*.md",
    "**/*.toml",
    "**/*.json",
    "**/*.sh",
    "**/*.txt",
]

# Directories to exclude
EXCLUDE_PATTERNS = [
    ".venv",
    ".git",
    ".claude",
    ".cursor",
    "htmlcov",
    "*.egg-info",
    ".pytest_cache",
    ".ruff_cache",
    ".mypy_cache",
    "dist",
    "build",
    "__pycache__",
]

# Maximum file size to check (500KB)
MAX_FILE_SIZE = 500 * 1024


@dataclass(frozen=True)
class CheckIssue:
    """Represents a single formatting issue found in a file."""

    description: str
    line_number: int | None = None


@dataclass(frozen=True)
class CheckOutcome:
    """Result generated after validating a file."""

    path: Path
    ok: bool
    issues: Sequence[CheckIssue]

    @property
    def message(self) -> str:
        """Return a colored status message describing the outcome."""
        if self.ok:
            return f"check_file_formatting: {self.path} - {GREEN}PASSED{RESET}"

        issue_details = []
        for issue in self.issues:
            if issue.line_number is not None:
                issue_details.append(f"  Line {issue.line_number}: {issue.description}")
            else:
                issue_details.append(f"  {issue.description}")

        details = "\n".join(issue_details)
        return f"check_file_formatting: {self.path} - {RED}ERROR{RESET}:\n{details}"


class FileFormattingChecker:
    """Validates file formatting rules."""

    def __init__(self, markdown_linebreak_ext: str = "md") -> None:
        """Initialize the checker with configuration."""
        self.markdown_linebreak_ext = markdown_linebreak_ext

    def check_trailing_whitespace(self, path: Path, content: str) -> list[CheckIssue]:
        """Check for trailing whitespace, allowing markdown line breaks."""
        issues: list[CheckIssue] = []
        lines = content.splitlines(keepends=True)

        for line_num, line in enumerate(lines, start=1):
            # Skip empty lines (they don't have trailing whitespace by definition)
            if not line.strip():
                continue

            # Check if line has trailing whitespace
            if line.rstrip("\r\n") != line.rstrip("\r\n").rstrip():
                # Allow two spaces before newline in markdown files (markdown line break)
                if path.suffix[1:] == self.markdown_linebreak_ext and line.rstrip("\r\n").endswith("  "):
                    continue

                issues.append(
                    CheckIssue(
                        description="Trailing whitespace found",
                        line_number=line_num,
                    )
                )

        return issues

    def check_eof_newline(self, content: str) -> list[CheckIssue]:
        """Check that file ends with a newline."""
        if not content:
            # Empty files are OK
            return []

        if not content.endswith(("\n", "\r\n")):
            return [CheckIssue(description="File does not end with a newline")]

        return []

    def check_line_endings(self, content: str) -> list[CheckIssue]:
        """Check for consistent LF line endings (no CRLF)."""
        if "\r\n" in content:
            return [CheckIssue(description="File contains CRLF line endings (should be LF only)")]

        if "\r" in content:
            return [CheckIssue(description="File contains CR line endings (should be LF only)")]

        return []

    def check_file(self, path: Path) -> CheckOutcome:
        """Validate all formatting rules for a single file."""
        # Skip if file is too large
        if path.stat().st_size > MAX_FILE_SIZE:
            return CheckOutcome(path=path, ok=True, issues=[])

        # Try to read as text
        try:
            content = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, PermissionError):
            # Skip binary files or files we can't read
            return CheckOutcome(path=path, ok=True, issues=[])

        issues: list[CheckIssue] = []

        # Run all checks
        issues.extend(self.check_trailing_whitespace(path, content))
        issues.extend(self.check_eof_newline(content))
        issues.extend(self.check_line_endings(content))

        return CheckOutcome(path=path, ok=not issues, issues=issues)

    def check_repository(self, root: Path, file_paths: Sequence[Path] | None = None) -> int:
        """Check all files in repository or specific file paths.

        Returns exit code: 0 if all checks pass, 1 if any fail.
        """
        paths_to_check = list(file_paths) if file_paths else self._discover_files(root)

        if not paths_to_check:
            sys.stdout.write(f"{YELLOW}No files found to check{RESET}\n")
            return 0

        failed_count = 0
        passed_count = 0

        for path in sorted(paths_to_check):
            outcome = self.check_file(path)
            stream = sys.stdout if outcome.ok else sys.stderr

            if outcome.ok:
                passed_count += 1
            else:
                failed_count += 1
                stream.write(f"{outcome.message}\n")

        # Print summary
        if failed_count > 0:
            sys.stderr.write(
                f"\n{RED}FAILED{RESET}: {failed_count} file(s) with formatting issues, {passed_count} file(s) passed\n"
            )
            return 1

        sys.stdout.write(f"\n{GREEN}SUCCESS{RESET}: All {passed_count} file(s) passed formatting checks\n")
        return 0

    def _discover_files(self, root: Path) -> list[Path]:
        """Discover all files matching patterns, excluding specified directories."""
        discovered: set[Path] = set()

        for pattern in FILE_PATTERNS:
            for path in root.glob(pattern):
                # Skip if in excluded directory
                if self._is_excluded(path, root):
                    continue

                # Only include files (not directories)
                if path.is_file():
                    discovered.add(path)

        return sorted(discovered)

    def _is_excluded(self, path: Path, root: Path) -> bool:
        """Check if path should be excluded based on patterns."""
        relative_path = path.relative_to(root)
        path_parts = relative_path.parts

        for exclude_pattern in EXCLUDE_PATTERNS:
            # Handle wildcard patterns
            if exclude_pattern.startswith("*"):
                if any(part.endswith(exclude_pattern[1:]) for part in path_parts):
                    return True
            # Handle directory patterns
            elif exclude_pattern in path_parts:
                return True

        return False


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments and return the resulting namespace."""
    parser = argparse.ArgumentParser(
        description="Validate file formatting (trailing whitespace, EOF newlines, line endings).",
    )
    parser.add_argument(
        "paths",
        nargs="*",
        type=Path,
        help="Specific file paths to check (if omitted, auto-discover files in repository).",
    )
    parser.add_argument(
        "--markdown-linebreak-ext",
        default="md",
        help="File extension for markdown files where '  \\n' line breaks are allowed (default: md).",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=Path.cwd(),
        help="Root directory for file discovery (default: current directory).",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    """Execute the CLI entry point and return a process exit code."""
    args = parse_args(argv)
    root_path = args.root.resolve()

    if not root_path.exists():
        sys.stderr.write(f"check_file_formatting: {root_path} - {RED}ERROR{RESET}: Path does not exist.\n")
        return 1

    if not root_path.is_dir():
        sys.stderr.write(f"check_file_formatting: {root_path} - {RED}ERROR{RESET}: Root path is not a directory.\n")
        return 1

    # Convert provided paths to absolute
    file_paths = [p.resolve() for p in args.paths] if args.paths else None

    # Validate provided paths exist
    if file_paths:
        for path in file_paths:
            if not path.exists():
                sys.stderr.write(f"check_file_formatting: {path} - {RED}ERROR{RESET}: File does not exist.\n")
                return 1

    checker = FileFormattingChecker(markdown_linebreak_ext=args.markdown_linebreak_ext)
    return checker.check_repository(root_path, file_paths)


if __name__ == "__main__":
    sys.exit(main())
