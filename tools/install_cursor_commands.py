#!/usr/bin/env python3
"""Sync Claude commands to Cursor commands.

This tool converts Claude command files from .claude/commands/ to Cursor format
in .cursor/commands/ with the speckit. prefix.

Format differences:
- Claude: Simple frontmatter + content
- Cursor: Frontmatter + User Input section + structured sections

Usage:
    python tools/sync_commands.py
"""

import sys
from pathlib import Path
from typing import ClassVar

# Constants
FRONTMATTER_PARTS_COUNT = 3


class CommandConverter:
    """Convert Claude commands to Cursor format."""

    # Speckit commands to sync
    SPECKIT_COMMANDS: ClassVar[set[str]] = {
        "analyze.md",
        "clarify.md",
        "constitution.md",
        "implement.md",
        "plan.md",
        "specify.md",
        "tasks.md",
    }

    def __init__(self, repo_root: Path) -> None:
        """Initialize the command converter.

        Args:
            repo_root: Path to the repository root directory

        """
        self.repo_root = repo_root
        self.claude_dir = repo_root / ".claude" / "commands"
        self.cursor_dir = repo_root / ".cursor" / "commands"

    def parse_frontmatter(self, content: str) -> tuple[dict[str, str], str]:
        """Parse YAML frontmatter from markdown content.

        Returns:
            Tuple of (frontmatter_dict, remaining_content)

        """
        frontmatter = {}
        body = content

        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= FRONTMATTER_PARTS_COUNT:
                # Parse the frontmatter section
                fm_lines = parts[1].strip().split("\n")
                for line in fm_lines:
                    if ":" in line:
                        key, value = line.split(":", 1)
                        frontmatter[key.strip()] = value.strip()
                body = parts[2].strip()

        return frontmatter, body

    def has_arguments(self, content: str) -> bool:
        """Check if content references $ARGUMENTS."""
        return "$ARGUMENTS" in content

    def add_user_input_section(self, content: str) -> str:
        """Add User Input section at the beginning of content.

        Handles two cases:
        1. Content already has inline $ARGUMENTS mentions - extract and format
        2. Content doesn't mention $ARGUMENTS - add optional section
        """
        user_input_section = """## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty)."""

        if "$ARGUMENTS" not in content:
            # Content doesn't use $ARGUMENTS, just prepend the section
            return f"{user_input_section}\n\n{content}"

        # Find where $ARGUMENTS appears and remove the intro section
        lines = content.split("\n")
        args_line_idx = None

        for i, line in enumerate(lines):
            if "$ARGUMENTS" in line:
                args_line_idx = i
                break

        if args_line_idx is None:
            # Shouldn't happen but handle gracefully
            return f"{user_input_section}\n\n{content}"

        # Find the next non-empty line after $ARGUMENTS
        start_idx = args_line_idx + 1
        while start_idx < len(lines) and not lines[start_idx].strip():
            start_idx += 1

        # Keep everything from that point onwards
        remaining = "\n".join(lines[start_idx:])

        return f"{user_input_section}\n\n{remaining}"

    def _is_step_marker(self, line: str) -> bool:
        """Check if line contains a step marker."""
        lower = line.lower()
        return any(marker in lower for marker in ["## steps", "steps:", "do this:", "given"])

    def _is_critical_rules_marker(self, line: str) -> bool:
        """Check if line contains a critical rules marker."""
        lower = line.lower()
        return any(marker in lower for marker in ["critical rules", "key rules", "important:"])

    def _is_guidelines_marker(self, line: str) -> bool:
        """Check if line contains a guidelines marker."""
        lower = line.lower()
        return any(marker in lower for marker in ["guidelines", "principles"])

    def _save_current_section(
        self,
        structured: list[str],
        current_section: list[str],
    ) -> list[str]:
        """Save current section to structured list and return empty list."""
        if current_section:
            structured.append("\n".join(current_section))
        return []

    def detect_and_structure_content(self, content: str) -> str:
        """Detect content structure and add appropriate section headers.

        Looks for:
        - Step-based content (## Steps or ## Outline)
        - Rules/guidelines (## Critical Rules, ## Guidelines)
        - Mixed content
        """
        lines = content.split("\n")

        # If content already has ## headers, assume it's structured
        if any(line.startswith("## ") for line in lines):
            return content

        # Detect major sections
        structured = []
        current_section = []

        for i, line in enumerate(lines):
            stripped = line.strip()

            # Detect section transitions
            if stripped.startswith("# ") and i > 0 and current_section:
                current_section = self._save_current_section(structured, current_section)

            # Check for implicit section markers
            if self._is_step_marker(stripped):
                section_name = "Steps" if "steps" in stripped.lower() else "Outline"

                if not stripped.startswith("##"):
                    current_section = self._save_current_section(structured, current_section)
                    structured.append(f"## {section_name}")
            elif self._is_critical_rules_marker(stripped):
                current_section = self._save_current_section(structured, current_section)
                structured.append("## Critical Rules")
                continue
            elif self._is_guidelines_marker(stripped):
                current_section = self._save_current_section(structured, current_section)
                structured.append("## Guidelines")
                continue

            current_section.append(line)

        # Add remaining content
        self._save_current_section(structured, current_section)

        result = "\n".join(structured)

        # If no structure was added, wrap in ## Outline
        if not any(line.startswith("## ") for line in result.split("\n")):
            result = f"## Outline\n\n{result}"

        return result

    def convert_command(self, content: str) -> str:
        """Convert a Claude command to Cursor format.

        Args:
            content: Full content of Claude command file

        Returns:
            Converted content in Cursor format

        """
        # Parse frontmatter
        frontmatter, body = self.parse_frontmatter(content)

        # Build new content
        parts = []

        # Add frontmatter
        if frontmatter:
            parts.append("---")
            for key, value in frontmatter.items():
                parts.append(f"{key}: {value}")
            parts.append("---")
            parts.append("")

        # Check if we need to add User Input section
        if self.has_arguments(body):
            body = self.add_user_input_section(body)

        # Structure the content if needed
        body = self.detect_and_structure_content(body)

        parts.append(body)

        return "\n".join(parts)

    def sync_commands(self) -> None:
        """Sync all Claude commands to Cursor format.

        Reads from .claude/commands/ and writes to .cursor/commands/
        with speckit. prefix.
        """
        if not self.claude_dir.exists():
            sys.stderr.write(f"Error: Claude commands directory not found: {self.claude_dir}\n")
            sys.exit(1)

        # Create cursor directory if needed
        self.cursor_dir.mkdir(parents=True, exist_ok=True)

        # Process only speckit commands
        all_files = list(self.claude_dir.glob("*.md"))
        claude_files = [f for f in all_files if f.name in self.SPECKIT_COMMANDS]

        if not claude_files:
            sys.stderr.write(f"No speckit command files found in {self.claude_dir}\n")
            return

        sys.stdout.write(f"Converting {len(claude_files)} speckit command(s)...\n")

        for claude_file in claude_files:
            # Read Claude command
            content = claude_file.read_text()

            # Convert to Cursor format
            converted = self.convert_command(content)

            # Generate Cursor filename
            cursor_filename = f"speckit.{claude_file.name}"
            cursor_file = self.cursor_dir / cursor_filename

            # Write Cursor command
            cursor_file.write_text(converted)

            sys.stdout.write(f"  ✓ {claude_file.name} → {cursor_filename}\n")

        sys.stdout.write(f"\nDone! Converted {len(claude_files)} command(s)\n")


def main() -> None:
    """Run the command converter to sync Claude commands to Cursor format."""
    # Find repository root (look for .claude directory)
    current = Path.cwd()
    repo_root = current

    while repo_root != repo_root.parent:
        if (repo_root / ".claude").exists():
            break
        repo_root = repo_root.parent
    else:
        sys.stderr.write("Error: Could not find repository root (no .claude directory)\n")
        sys.exit(1)

    converter = CommandConverter(repo_root)
    converter.sync_commands()


if __name__ == "__main__":
    main()
