"""Entry point for credential CLI tools.

Usage: uv run python -m nexus.credentials.cli rotate-keys [options]
"""

from nexus.credentials.cli.rotate_keys import main

if __name__ == "__main__":
    main()
