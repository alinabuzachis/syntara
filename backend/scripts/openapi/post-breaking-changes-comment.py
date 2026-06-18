#!/usr/bin/env python3
"""Post or update GitHub PR comment for breaking changes check results.

This script formats the breaking changes check results and posts/updates
a PR comment using the GitHub API via gh CLI.

Usage:
    ./post-breaking-changes-comment.py --results results.json --pr-number 123
    ./post-breaking-changes-comment.py --results results.json --pr-number 123 --repo owner/repo

Environment variables:
    GITHUB_TOKEN - GitHub API token (optional, gh CLI handles auth)
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Dict


def escape_markdown(text: str) -> str:
    """Escape markdown/HTML to prevent injection attacks."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#039;")
        .replace("`", "&#96;")
    )


def format_breaking_changes_comment(
    results: Dict, repo_owner: str, repo_name: str
) -> str:
    """Format breaking changes results as a GitHub comment.

    Args:
        results: Output from check-breaking-changes.py
        repo_owner: Repository owner
        repo_name: Repository name

    Returns:
        Formatted markdown comment
    """
    has_breaking = results["has_breaking_changes"]
    breaking_changes = results["breaking_changes"]
    all_changes = results["all_changes"]
    acknowledged = results["acknowledged"]
    ack_insufficient = results["ack_insufficient"]
    justification = results["justification"]

    escaped_breaking = escape_markdown(breaking_changes)
    escaped_all = escape_markdown(all_changes)
    escaped_justification = escape_markdown(justification)

    lines = []

    if has_breaking:
        if acknowledged:
            lines.append("### Breaking Changes Detected (Acknowledged)\n")
            lines.append("The developer has acknowledged these breaking changes with justification:\n")
            lines.append(f"```\n{escaped_justification}\n```\n")
            lines.append("**Reviewer:** Please verify:")
            lines.append("1. The justification is valid and necessary")
            lines.append(
                "2. Frontend contracts are regenerated in this PR (`make gen-contracts`)"
            )
            lines.append("3. Migration path is clear for API consumers\n")
        elif ack_insufficient:
            lines.append("### Breaking Changes Detected (Insufficient Acknowledgment)\n")
            lines.append("Breaking changes require explicit acknowledgment with detailed justification.\n")
            lines.append(f"**Your acknowledgment is too brief:**\n```\n{escaped_justification}\n```\n")
            lines.append("Please update your PR description with a detailed explanation (minimum 20 characters).\n")
        else:
            lines.append("### Breaking Changes Detected (Not Acknowledged)\n")
            lines.append("This PR introduces **breaking changes** that will affect existing API consumers.\n")
            lines.append("**Action Required:** Add to your PR description:")
            lines.append("```")
            lines.append("breaking-change-ack: <detailed justification explaining why this breaking change is necessary and how consumers should migrate>")
            lines.append("```\n")

        lines.append("---\n")
        lines.append("### Breaking Changes Detected\n")
        lines.append(f"```\n{escaped_breaking}\n```\n")

        if all_changes and all_changes != breaking_changes:
            lines.append("<details>")
            lines.append("<summary>All Changes (including non-breaking)</summary>\n")
            lines.append(f"```\n{escaped_all}\n```")
            lines.append("</details>\n")

        lines.append("---\n")
        lines.append("### What This Means\n")
        lines.append("**Breaking changes** remove or modify existing API contracts in ways that break existing consumers:")
        lines.append("- Removed endpoints or fields")
        lines.append("- Changed field types (e.g., string → number)")
        lines.append("- Changed required/optional status")
        lines.append("- Removed enum values\n")

        lines.append("**Before merging, you must:**\n")
        lines.append("1. **Acknowledge the breaking change** in your PR description")
        lines.append("2. **Regenerate frontend contracts** — run `make gen-contracts` and include the updated types in this PR")
        lines.append("3. **Document the migration path** for API consumers\n")

        lines.append(f"See [docs/openapi-breaking-changes.md](https://github.com/{repo_owner}/{repo_name}/blob/devel/docs/openapi-breaking-changes.md) for details.\n")
    else:
        lines.append("### No Breaking Changes Detected\n")
        lines.append("This PR modifies the OpenAPI spec but does **not** introduce breaking changes.\n")

        if all_changes and all_changes.strip():
            lines.append("**Changes detected:**")
            lines.append(f"```\n{escaped_all}\n```\n")

        lines.append("**Reminder:** Even for non-breaking changes, run `make gen-contracts` to update ")
        lines.append("the frontend TypeScript types. See the **OpenAPI Contract Regeneration Check** for guidance.\n")

    lines.append("---")
    lines.append(f"*Automated check from [`ci-backend.yml`](https://github.com/{repo_owner}/{repo_name}/blob/devel/.github/workflows/ci-backend.yml)*")

    return "\n".join(lines)


def post_or_update_comment(pr_number: str, comment_body: str, repo: str) -> None:
    """Post or update PR comment using gh CLI.

    Args:
        pr_number: Pull request number
        comment_body: Comment markdown content
        repo: Repository in owner/repo format
    """
    # Find existing comment
    list_cmd = [
        "gh", "api",
        f"repos/{repo}/issues/{pr_number}/comments",
        "--paginate",
        "--jq", '.[] | select(.body | contains("Breaking Changes Detected")) | .id',
    ]

    result = subprocess.run(list_cmd, capture_output=True, text=True)

    if result.returncode == 0 and result.stdout.strip():
        # Update existing comment
        comment_id = result.stdout.strip().split('\n')[0]  # Take first match
        update_cmd = [
            "gh", "api",
            f"repos/{repo}/issues/comments/{comment_id}",
            "-X", "PATCH",
            "-f", f"body={comment_body}",
        ]
        subprocess.run(update_cmd, check=True)
        print(f"Updated comment {comment_id} on PR #{pr_number}")
    else:
        # Create new comment
        create_cmd = [
            "gh", "pr", "comment", pr_number,
            "--repo", repo,
            "--body", comment_body,
        ]
        subprocess.run(create_cmd, check=True)
        print(f"Created new comment on PR #{pr_number}")


def main():
    parser = argparse.ArgumentParser(
        description="Post breaking changes check results as GitHub PR comment"
    )

    parser.add_argument(
        "--results",
        required=True,
        help="Path to JSON results file from check-breaking-changes.py",
    )
    parser.add_argument(
        "--pr-number",
        required=True,
        help="Pull request number",
    )
    parser.add_argument(
        "--repo",
        help="Repository in owner/repo format (auto-detected from gh if not provided)",
    )

    args = parser.parse_args()

    # Load results
    results = json.loads(Path(args.results).read_text())

    # Get repo if not provided
    if args.repo:
        repo = args.repo
    else:
        # Auto-detect from gh
        result = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
            capture_output=True,
            text=True,
            check=True,
        )
        repo = result.stdout.strip()

    repo_owner, repo_name = repo.split("/")

    # Format comment
    comment_body = format_breaking_changes_comment(results, repo_owner, repo_name)

    # Post or update comment
    post_or_update_comment(args.pr_number, comment_body, repo)


if __name__ == "__main__":
    main()
