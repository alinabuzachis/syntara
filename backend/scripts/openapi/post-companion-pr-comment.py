#!/usr/bin/env python3
"""Post or update GitHub PR comment for contract regeneration check results.

This script formats the contract check results and posts/updates
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
    """Format contract check results as a GitHub comment.

    Args:
        results: Output from check-companion-pr.py
        repo_owner: Repository owner
        repo_name: Repository name

    Returns:
        Formatted markdown comment
    """
    message = results["message"]

    lines = ["### OpenAPI Contract Regeneration Check\n"]
    lines.append(message)
    lines.append("\n---")
    lines.append(f"*Automated check from [`ci-backend.yml`](https://github.com/{repo_owner}/{repo_name}/blob/devel/.github/workflows/ci-backend.yml)*")

    return "\n".join(lines)


COMMENT_MARKER = "OpenAPI Contract Regeneration Check"


def post_or_update_comment(pr_number: str, comment_body: str, repo: str) -> None:
    """Post or update PR comment using gh CLI.

    Args:
        pr_number: Pull request number
        comment_body: Comment markdown content
        repo: Repository in owner/repo format
    """
    list_cmd = [
        "gh", "pr", "view", pr_number,
        "--repo", repo,
        "--json", "comments",
        "--jq", f'.comments[] | select(.body | contains("{COMMENT_MARKER}")) | .databaseId'
    ]

    result = subprocess.run(list_cmd, capture_output=True, text=True)

    if result.returncode == 0 and result.stdout.strip():
        comment_id = result.stdout.strip().split('\n')[0]
        update_cmd = [
            "gh", "api",
            f"repos/{repo}/issues/comments/{comment_id}",
            "-X", "PATCH",
            "-f", f"body={comment_body}",
        ]
        subprocess.run(update_cmd, check=True)
        print(f"Updated comment {comment_id} on PR #{pr_number}")
    else:
        create_cmd = [
            "gh", "pr", "comment", pr_number,
            "--repo", repo,
            "--body", comment_body,
        ]
        subprocess.run(create_cmd, check=True)
        print(f"Created new comment on PR #{pr_number}")


def main():
    parser = argparse.ArgumentParser(
        description="Post contract regeneration check results as GitHub PR comment"
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

    results = json.loads(Path(args.results).read_text())

    if args.repo:
        repo = args.repo
    else:
        result = subprocess.run(
            ["gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
            capture_output=True,
            text=True,
            check=True,
        )
        repo = result.stdout.strip()

    repo_owner, repo_name = repo.split("/")

    comment_body = format_companion_pr_comment(results, repo_owner, repo_name)

    post_or_update_comment(args.pr_number, comment_body, repo)


if __name__ == "__main__":
    main()
