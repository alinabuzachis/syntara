"""rename config to parameters in workflow_definition JSONB

Revision ID: 433e243396da
Revises: ffc5b31c7ef4
Create Date: 2026-06-09

This migration renames the "config" key to "parameters" in all node and trigger
definitions stored in the workflow_definition JSONB column of workflow_versions.
This aligns the database schema with the refactored model where node/trigger
configuration is now called parameters.

For each element in the "nodes" and "triggers" arrays, if "config" exists and
"parameters" does not, we rename "config" to "parameters". This preserves
existing workflow definitions while supporting the new naming convention.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "433e243396da"
down_revision: str | Sequence[str] | None = "af63ce50dceb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    connection = op.get_bind()

    # Rename config -> parameters in nodes array
    connection.execute(
        sa.text("""
            UPDATE workflow_versions
            SET workflow_definition = jsonb_set(
                workflow_definition,
                '{nodes}',
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN node ? 'config' AND NOT (node ? 'parameters')
                            THEN (node || jsonb_build_object('parameters', node -> 'config')) - 'config'
                            ELSE node
                        END
                    )
                    FROM jsonb_array_elements(workflow_definition -> 'nodes') AS node
                )
            )
            WHERE workflow_definition ? 'nodes'
            AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(workflow_definition -> 'nodes') AS node
                WHERE node ? 'config'
            )
        """)
    )

    # Rename config -> parameters in triggers array
    connection.execute(
        sa.text("""
            UPDATE workflow_versions
            SET workflow_definition = jsonb_set(
                workflow_definition,
                '{triggers}',
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN trigger_node ? 'config' AND NOT (trigger_node ? 'parameters')
                            THEN (trigger_node || jsonb_build_object('parameters', trigger_node -> 'config')) - 'config'
                            ELSE trigger_node
                        END
                    )
                    FROM jsonb_array_elements(workflow_definition -> 'triggers') AS trigger_node
                )
            )
            WHERE workflow_definition ? 'triggers'
            AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(workflow_definition -> 'triggers') AS trigger_node
                WHERE trigger_node ? 'config'
            )
        """)
    )


def downgrade() -> None:
    """Downgrade schema."""
    connection = op.get_bind()

    # Reverse the migration: rename parameters -> config in nodes array
    connection.execute(
        sa.text("""
            UPDATE workflow_versions
            SET workflow_definition = jsonb_set(
                workflow_definition,
                '{nodes}',
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN node ? 'parameters' AND NOT (node ? 'config')
                            THEN (node || jsonb_build_object('config', node -> 'parameters')) - 'parameters'
                            ELSE node
                        END
                    )
                    FROM jsonb_array_elements(workflow_definition -> 'nodes') AS node
                )
            )
            WHERE workflow_definition ? 'nodes'
            AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(workflow_definition -> 'nodes') AS node
                WHERE node ? 'parameters'
            )
        """)
    )

    # Reverse the migration: rename parameters -> config in triggers array
    connection.execute(
        sa.text("""
            UPDATE workflow_versions
            SET workflow_definition = jsonb_set(
                workflow_definition,
                '{triggers}',
                (
                    SELECT jsonb_agg(
                        CASE
                            WHEN trigger_node ? 'parameters' AND NOT (trigger_node ? 'config')
                            THEN (trigger_node || jsonb_build_object(
                                'config', trigger_node -> 'parameters')) - 'parameters'
                            ELSE trigger_node
                        END
                    )
                    FROM jsonb_array_elements(workflow_definition -> 'triggers') AS trigger_node
                )
            )
            WHERE workflow_definition ? 'triggers'
            AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(workflow_definition -> 'triggers') AS trigger_node
                WHERE trigger_node ? 'parameters'
            )
        """)
    )
