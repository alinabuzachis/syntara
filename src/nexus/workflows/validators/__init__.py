"""Workflow validation module.

This module provides validation for workflow definitions and metadata.
"""

from .workflow_definition import WorkflowValidator

# Convenience singleton instance for easy usage
workflow_validator = WorkflowValidator()

__all__ = [
    "WorkflowValidator",
    "workflow_validator",
]
