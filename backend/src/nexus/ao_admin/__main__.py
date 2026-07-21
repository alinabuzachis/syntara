"""Backward-compat shim — real implementation lives in nexus.orchestrator_admin."""

from nexus.orchestrator_admin.__main__ import app

if __name__ == "__main__":
    app()
