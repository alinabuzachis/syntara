"""Backward-compat shim — real implementation lives in nexus.orchestrator_admin."""

from nexus.orchestrator_admin import app

__all__ = ["app"]
