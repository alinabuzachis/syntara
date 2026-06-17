#!/usr/bin/env python3
"""Check for companion UI PR when OpenAPI spec changes.

This script parses PR descriptions to detect companion UI PR links
or exception justifications, returning structured JSON output.

Usage:
    ./check-companion-pr.py --pr-body "$(cat pr_description.txt)"
    ./check-companion-pr.py --pr-body-file pr_description.txt

Returns:
    JSON with structure:
    {
        "has_companion": bool,
        "ui_pr_number": str | null,
        "has_exception": bool,
        "exception_justification": str | null,
        "exception_valid": bool,
        "severity": "notice" | "warning",
        "message": str
    }

Exit codes:
    0 - Always succeeds (companion check is informational, not blocking)
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, Optional


def escape_markdown(text: str) -> str:
    """Escape markdown/HTML to prevent injection attacks."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#039;")
        .replace("`", "&#96;")  # Escape backticks to prevent code block escape
    )


def check_companion_pr(pr_body: str) -> Dict[str, any]:
    """Check PR body for companion UI PR link or exception.

    Args:
        pr_body: PR description text

    Returns:
        Dict with detection results and formatted message
    """
    if not pr_body:
        return _build_warning_result(None, None)

    # Pattern to match UI PR links in various formats:
    # - syntara-orchestration/syntara-ui#123
    # - https://github.com/syntara-orchestration/syntara-ui/pull/123
    # - nexus-ui#123
    ui_pr_pattern = re.compile(
        r"(?:syntara-orchestration\/)?nexus-ui(?:#|\/pull\/)(\d+)", re.IGNORECASE
    )

    # Pattern to detect exception justification
    # Developer can write: "no-ui-pr: description-only change, no type impact"
    exception_pattern = re.compile(r"no-ui-pr\s*:\s*(.+)", re.IGNORECASE)

    ui_pr_match = ui_pr_pattern.search(pr_body)
    exception_match = exception_pattern.search(pr_body)

    if ui_pr_match:
        ui_pr_number = ui_pr_match.group(1)
        return _build_companion_result(ui_pr_number)
    elif exception_match:
        justification = exception_match.group(1).strip()
        return _build_exception_result(justification)
    else:
        return _build_warning_result(None, None)


def _build_companion_result(ui_pr_number: str) -> Dict[str, any]:
    """Build result when companion UI PR is detected."""
    message = (
        f"**Companion UI PR detected:** syntara-orchestration/syntara-ui#{ui_pr_number}\n\n"
        f"Please ensure the UI PR regenerates contracts from this backend change before merging."
    )

    return {
        "has_companion": True,
        "ui_pr_number": ui_pr_number,
        "has_exception": False,
        "exception_justification": None,
        "exception_valid": False,
        "severity": "notice",
        "message": message,
    }


def _build_exception_result(justification: str) -> Dict[str, any]:
    """Build result when exception is claimed."""
    escaped_justification = escape_markdown(justification)

    # Check if justification is too short (likely not a real justification)
    if len(justification) < 10:
        message = (
            f"**Exception claimed but justification is too brief**\n\n"
            f"You've marked this as `no-ui-pr` but the justification is insufficient:\n"
            f"```\n{escaped_justification}\n```\n\n"
            f"Please provide a detailed explanation (e.g., \"description-only change, "
            f"no type impact — verified via contract regen\")."
        )

        return {
            "has_companion": False,
            "ui_pr_number": None,
            "has_exception": True,
            "exception_justification": justification,
            "exception_valid": False,
            "severity": "warning",
            "message": message,
        }

    # Valid exception
    message = (
        f"**Exception: No companion UI PR needed**\n\n"
        f"Justification provided:\n```\n{escaped_justification}\n```\n\n"
        f"Reviewer: Please verify this justification is valid."
    )

    return {
        "has_companion": False,
        "ui_pr_number": None,
        "has_exception": True,
        "exception_justification": justification,
        "exception_valid": True,
        "severity": "notice",
        "message": message,
    }


def _build_warning_result(ui_pr_number: Optional[str], justification: Optional[str]) -> Dict[str, any]:
    """Build result when neither companion nor exception is found."""
    message = (
        f"**OpenAPI spec changed — companion UI PR recommended**\n\n"
        f"This PR modifies `src/nexus/schemas/openapi.yaml`. "
        f"When the OpenAPI spec changes, the UI's generated contracts (`nexus-ui/packages/nexus-contracts/`) "
        f"need to be updated to stay in sync.\n\n"
        f"### Action Required\n\n"
        f"1. **Create a companion UI PR** that regenerates contracts from this backend change:\n"
        f"   - Link it in this PR description: `syntara-orchestration/syntara-ui#<number>`\n"
        f"   - The UI PR should update `nexus-backend.json` to pin this backend commit\n"
        f"   - Run `npm run gen` to regenerate contracts\n\n"
        f"2. **OR, if this is a spec-only change** (description, examples, metadata) with no type impact:\n"
        f"   - Add to PR description: `no-ui-pr: <justification>`\n"
        f"   - Example: `no-ui-pr: description-only change, no type impact — verified via contract regen`\n\n"
        f"### Why This Matters\n\n"
        f"- **Additive changes** (new endpoints, new fields) make types available to UI developers\n"
        f"- **Breaking changes** (removed/changed fields) cause TypeScript errors or runtime failures\n"
        f"- **Coordinated features** require both backend and UI changes to ship together\n\n"
        f"See [AAP-77399](AAP-77399) and "
        f"[AAP-77396](AAP-77396) for context.\n\n"
        f"---\n"
        f"This is an **informational warning**, not a blocker. The reviewer will verify the decision."
    )

    return {
        "has_companion": False,
        "ui_pr_number": None,
        "has_exception": False,
        "exception_justification": None,
        "exception_valid": False,
        "severity": "warning",
        "message": message,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Check for companion UI PR in OpenAPI spec changes"
    )

    # Input options
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        "--pr-body",
        help="PR description text",
    )
    input_group.add_argument(
        "--pr-body-file",
        help="File containing PR description",
    )

    # Output options
    parser.add_argument(
        "--output",
        "-o",
        help="Output file (default: stdout)",
    )
    parser.add_argument(
        "--format",
        choices=["json", "text"],
        default="json",
        help="Output format (default: json)",
    )

    args = parser.parse_args()

    # Get PR body
    if args.pr_body:
        pr_body = args.pr_body
    else:
        pr_body = Path(args.pr_body_file).read_text()

    # Check for companion PR
    result = check_companion_pr(pr_body)

    # Output
    if args.format == "json":
        output_text = json.dumps(result, indent=2)
    else:
        # Text format
        output_text = result["message"]

    # Write output
    if args.output:
        Path(args.output).write_text(output_text)
    else:
        print(output_text)

    # Always exit 0 (companion check is informational)
    sys.exit(0)


if __name__ == "__main__":
    main()
