#!/usr/bin/env python3
"""Post or update GitHub PR comment for companion PR check results.

This script formats the companion PR check results and posts/updates
a PR comment using the GitHub API via gh CLI.

Usage:
    ./post-companion-pr-comment.py --results results.json --pr-number 123
    ./post-companion-pr-comment.py --results results.json --pr-number 123 --repo owner/repo

Environment variables:
    GITHUB_TOKEN - GitHub API token (optional, gh CLI handles auth)
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Dict


def format_companion_pr_comment(results: Dict, repo_owner: str, repo_name: str) -> str:
    """Format companion PR check results as a GitHub comment.

    Args:
        results: Output from check-companion-pr.py
        repo_owner: Repository owner
        repo_name: Repository name

    Returns:
        Formatted markdown comment
    """
    message = results["message"]

    lines = ["### OpenAPI Companion PR Check\n"]
    lines.append(message)
    lines.append("\n---")
    lines.append(f"*Automated check from [`ci.yml`](https://github.com/{repo_owner}/{repo_name}/blob/main/.github/workflows/ci.yml)*")

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
        "gh", "pr", "view", pr_number,
        "--repo", repo,
        "--json", "comments",
        "--jq", '.comments[] | select(.body | contains("OpenAPI spec changed")) | .id'
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
        description="Post companion PR check results as GitHub PR comment"
    )

    parser.add_argument(
        "--results",
        required=True,
        help="Path to JSON results file from check-companion-pr.py",
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
    comment_body = format_companion_pr_comment(results, repo_owner, repo_name)

    # Post or update comment
    post_or_update_comment(args.pr_number, comment_body, repo)


if __name__ == "__main__":
    main()
