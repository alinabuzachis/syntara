"""Generate JSON schemas from telemetry Pydantic models.

This script generates JSON schemas from Pydantic event models and writes
them to src/nexus/schemas/telemetry/. Used by `make generate-telemetry-schemas`

Usage:
    python tools/generate_telemetry_schemas.py [--validate]
"""

import json
import logging
import sys
from pathlib import Path

from nexus.telemetry.events.activity_execution import ActivityExecutionEvent
from nexus.telemetry.events.workflow_execution import (
    WorkflowExecutionCompletedEvent,
    WorkflowExecutionStartEvent,
)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)

# Schema output directory
SCHEMA_DIR = Path("src/nexus/schemas/telemetry")

# Mapping of Pydantic model classes to output schema filenames
MODEL_SCHEMA_MAP = {
    "WorkflowExecutionStartEvent": "workflow_execution_started.json",
    "WorkflowExecutionCompletedEvent": "workflow_execution_completed.json",
    "ActivityExecutionEvent": "activity_execution.json",
}


def get_event_models() -> dict[str, type]:
    """Return all telemetry event model classes.

    Returns:
        Dictionary mapping class name to class.

    """
    return {
        "WorkflowExecutionStartEvent": WorkflowExecutionStartEvent,
        "WorkflowExecutionCompletedEvent": WorkflowExecutionCompletedEvent,
        "ActivityExecutionEvent": ActivityExecutionEvent,
    }


def generate_schemas() -> dict[str, dict]:
    """Generate JSON schemas from Pydantic models.

    Returns:
        Dictionary mapping filename to JSON schema dict.

    """
    models = get_event_models()
    schemas = {}
    for class_name, model_cls in models.items():
        filename = MODEL_SCHEMA_MAP[class_name]
        schema = model_cls.model_json_schema()
        schemas[filename] = schema
    return schemas


def write_schemas(schemas: dict[str, dict]) -> None:
    """Write JSON schemas to disk.

    Args:
        schemas: Dictionary mapping filename to JSON schema dict.

    """
    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    for filename, schema in schemas.items():
        filepath = SCHEMA_DIR / filename
        filepath.write_text(json.dumps(schema, indent=2) + "\n")
        logger.info("  Generated: %s", filepath)


def validate_schemas() -> bool:
    """Validate that on-disk schemas match current Pydantic models.

    Returns:
        True if schemas are in sync, False otherwise.

    """
    schemas = generate_schemas()
    all_valid = True

    for filename, expected_schema in schemas.items():
        filepath = SCHEMA_DIR / filename
        if not filepath.exists():
            logger.info("  MISSING: %s", filepath)
            all_valid = False
            continue

        actual_schema = json.loads(filepath.read_text())
        if actual_schema != expected_schema:
            logger.info("  OUT OF SYNC: %s", filepath)
            all_valid = False
        else:
            logger.info("  OK: %s", filepath)

    return all_valid


def main() -> None:
    """Entry point for schema generation/validation."""
    validate_only = "--validate" in sys.argv

    if validate_only:
        logger.info("Validating telemetry schemas...")
        if validate_schemas():
            logger.info("All schemas are in sync.")
        else:
            logger.info("Schema validation FAILED. Run 'make generate-telemetry-schemas' to update.")
            sys.exit(1)
    else:
        logger.info("Generating telemetry schemas...")
        schemas = generate_schemas()
        write_schemas(schemas)
        logger.info("Schema generation complete.")


if __name__ == "__main__":
    main()
