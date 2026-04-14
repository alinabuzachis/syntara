"""Activity executor configuration models for V2 workflows.

This module contains Pydantic models for activity executor configurations.
These are used by V2 workflow activities for config validation.
"""

import re
import uuid
from enum import Enum
from http import HTTPMethod
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator
from pydantic.functional_validators import ModelWrapValidatorHandler

from nexus.core.exceptions import SafeValueError
from nexus.workflows.workflow_engine import constants
from nexus.workflows.workflow_engine.models.aap_types import AAPResourceType

# Template expression pattern - matches ${...} expressions
TEMPLATE_PATTERN = re.compile(r"\$\{[^}]+\}")


class TemplateAwareBaseModel(BaseModel):
    """Base model that allows template expressions in any field.

    Template expressions like ${input.field} or ${workflow.vars.count} bypass
    type validation and constraints, allowing them to be stored as strings and
    evaluated at runtime during workflow execution.

    Non-template values are validated normally with full type checking and
    Field constraints (ge, le, min_length, etc.).
    """

    model_config = ConfigDict(validate_assignment=True)

    @field_validator("*", mode="wrap")
    @classmethod
    def allow_template_strings(
        cls,
        value: Any,  # noqa: ANN401
        handler: ModelWrapValidatorHandler[Any],
        info: ValidationInfo,  # noqa: ARG003
    ) -> Any:  # noqa: ANN401
        """Allow template expressions to bypass validation for any field."""
        # Template expression - return directly, bypass all validators
        if isinstance(value, str) and TEMPLATE_PATTERN.search(value):
            return value

        # For non-template values, run normal validation
        return handler(value)


# Enums
class NodeType(str, Enum):
    """Node types for V2 workflows (used by telemetry)."""

    # Triggers
    MANUAL_TRIGGER = "manual_trigger"
    # Control nodes
    CONDITION = "condition"
    CONVERGE = "converge"
    LOOP = "loop"
    # Executor nodes
    AAP_JOB_TEMPLATE = "aap_job_template"
    AGENTIC = "agentic"
    APPROVAL = "approval"
    HTTP_REQUEST = "http_request"
    SCRIPT = "script"


class ActivityTerminalStatus(str, Enum):
    """Terminal activity execution statuses for telemetry events."""

    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class WorkflowTerminalStatus(str, Enum):
    """Terminal workflow execution statuses for telemetry events."""

    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ScriptLanguage(str, Enum):
    """Supported script languages for script executor."""

    BASH = "bash"
    PYTHON = "python"


class AuthenticationType(str, Enum):
    """Supported authentication types for API requests."""

    BASIC = "basic"
    BEARER = "bearer"
    API_KEY = "api_key"
    OAUTH2 = "oauth2"


# Executor configuration models
class ScriptExecutorConfig(TemplateAwareBaseModel):
    """Configuration for script executor.

    Attributes:
        language: Script language (bash or python)
        code: Script code to execute
        environment: Optional environment variables for script execution
        timeout: Timeout for script execution in seconds (default from APP_SCRIPT_TIMEOUT_SECONDS)

    """

    language: ScriptLanguage
    code: str = Field(min_length=1, description="Script code to execute")
    environment: dict[str, str] = Field(default_factory=dict, description="Environment variables")
    timeout: int = Field(
        default=constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS,
        ge=1,
        le=3600,
        description="Timeout in seconds (default from APP_SCRIPT_TIMEOUT_SECONDS)",
    )


class Authentication(TemplateAwareBaseModel):
    """Authentication configuration for API requests."""

    type: AuthenticationType = Field(description="Authentication type")
    credentials: str = Field(
        description="Reference to stored credentials",
        pattern=r"^\$\{secrets\.[a-zA-Z0-9_]+\}$",
    )


class APIExecutorConfig(TemplateAwareBaseModel):
    """Configuration for API executor (http_request activity)."""

    model_config = ConfigDict(populate_by_name=True)

    method: HTTPMethod = Field(description="HTTP method")
    url: str = Field(description="Request URL")
    headers: dict[str, Any] = Field(default_factory=dict)
    body: dict[str, Any] | str | None = None
    query_params: dict[str, Any] = Field(default_factory=dict, alias="queryParams")
    authentication: Authentication | None = None
    credential_id: str | None = Field(
        default=None,
        alias="credentialId",
        description="Nexus credential UUID for authentication. Takes priority over authentication field.",
    )
    timeout: int | None = Field(default=None, ge=1, description="Timeout in seconds")

    @field_validator("url")
    @classmethod
    def validate_url_scheme(cls, v: str) -> str:
        """Restrict URL to http/https schemes to prevent SSRF."""
        if TEMPLATE_PATTERN.search(v):
            return v
        parsed = urlparse(v)
        if parsed.scheme and parsed.scheme not in ("http", "https"):
            msg = f"URL scheme '{parsed.scheme}' is not allowed. Only http:// and https:// are supported."
            raise SafeValueError(msg)
        return v


class AgenticExecutorConfig(TemplateAwareBaseModel):
    """Configuration for agentic executor.

    Attributes:
        prompt: The prompt template for the agent
        agent: Optional agent identifier for routing
        model: Optional model identifier
        timeout: Timeout for agent invocation in seconds (default from APP_AGENTIC_TIMEOUT_SECONDS, max: 3600)
        file_ids: List of file IDs to include as context for the agent (max 10)

    """

    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(description="Prompt template for the agent")
    agent: str | None = None
    model: str | None = None
    credential_id: str | None = Field(
        default=None,
        alias="credentialId",
        description="Nexus credential UUID for LLM provider authentication",
    )
    timeout: int = Field(
        default=constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS,
        ge=1,
        le=3600,
        description="Timeout in seconds (default from APP_AGENTIC_TIMEOUT_SECONDS)",
    )
    file_ids: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="File IDs for agent context",
        alias="fileIds",
    )

    @field_validator("prompt")
    @classmethod
    def validate_prompt_security(cls, v: str) -> str:
        """Validate prompt length and content for security."""
        if len(v) > constants.MAX_PROMPT_LENGTH:
            msg = f"Prompt exceeds maximum length ({len(v)} > {constants.MAX_PROMPT_LENGTH} characters)"
            raise SafeValueError(msg)
        if "\0" in v:
            msg = "Prompt contains null bytes"
            raise SafeValueError(msg)
        return v

    @field_validator("file_ids")
    @classmethod
    def validate_file_ids_format(cls, v: list[str]) -> list[str]:
        """Validate each file_id is a valid UUID format (unless it's a template expression)."""
        for file_id in v:
            if isinstance(file_id, str) and TEMPLATE_PATTERN.search(file_id):
                continue
            try:
                uuid.UUID(file_id)
            except ValueError as err:
                msg = f"Invalid file_id format: '{file_id}'. Must be a valid UUID."
                raise SafeValueError(msg) from err
        return v


class AAPJobTemplateExecutorConfig(TemplateAwareBaseModel):
    """Configuration for AAP Job Template executor."""

    model_config = ConfigDict(populate_by_name=True)

    credential_id: str | None = Field(
        default=None,
        alias="credentialId",
        description="Nexus credential UUID for AAP API authentication. Separate from legacy credentials list.",
    )
    job_template_id: int | None = Field(
        default=None,
        ge=1,
        description="AAP job template ID to launch",
        alias="jobTemplateId",
    )
    inventory_id: int | None = Field(
        default=None,
        ge=1,
        description="Override default inventory by ID (mutually exclusive with inventory_name)",
        alias="inventoryId",
    )
    inventory_name: str | None = Field(
        default=None,
        description="Override default inventory by name (requires organization_name)",
        alias="inventoryName",
    )
    credentials: list[int] | None = Field(
        default=None,
        description="List of credential IDs to use",
    )
    extra_vars: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra variables to pass to job",
        alias="extraVars",
    )
    limit: str | None = Field(
        default=None,
        description="Limit job execution to specific hosts",
    )
    tags: str | None = Field(
        default=None,
        description="Ansible tags to run (comma-separated)",
    )
    skip_tags: str | None = Field(
        default=None,
        description="Ansible tags to skip (comma-separated)",
        alias="skipTags",
    )
    verbosity: int = Field(
        default=0,
        ge=0,
        le=5,
        description="Job verbosity level (0-5)",
    )
    timeout: int = Field(
        default=constants.DEFAULT_AAP_TIMEOUT_SECONDS,
        ge=1,
        description="Timeout for job execution in seconds (default from APP_AAP_TIMEOUT_SECONDS)",
    )
    job_template_name: str | None = Field(
        default=None,
        description="AAP job template name (used with organization_name)",
        alias="jobTemplateName",
    )
    organization_name: str | None = Field(
        default=None,
        description="AAP organization name (used with job_template_name or inventory_name)",
        alias="organizationName",
    )

    def _validate_id_or_name_reference(
        self,
        id_value: int | str | None,
        name_value: str | None,
        org_value: str | None,
        resource_type: str,
        *,
        required: bool = True,
    ) -> None:
        """Validate resource reference by ID or name."""
        # Skip validation if any value is a template expression
        is_id_template = isinstance(id_value, str) and TEMPLATE_PATTERN.search(id_value)
        is_name_template = isinstance(name_value, str) and TEMPLATE_PATTERN.search(name_value)
        is_org_template = isinstance(org_value, str) and TEMPLATE_PATTERN.search(org_value)

        if is_id_template or is_name_template or is_org_template:
            return

        has_id = id_value is not None
        has_name = bool(name_value)

        # Name requires organization (when ID not provided)
        if not has_id and has_name and not org_value:
            msg = f"organization_name is required when using {resource_type}_name"
            raise SafeValueError(msg)

        # Require either ID or name
        if required and not has_id and not has_name:
            msg = f"Either {resource_type}_id or {resource_type}_name must be specified"
            raise SafeValueError(msg)

    @model_validator(mode="after")
    def validate_references(self) -> "AAPJobTemplateExecutorConfig":
        """Validate job template and inventory references."""
        # Validate job template reference
        self._validate_id_or_name_reference(
            self.job_template_id,
            self.job_template_name,
            self.organization_name,
            AAPResourceType.JOB_TEMPLATES.field_prefix,
            required=True,
        )

        # Validate inventory reference (optional)
        self._validate_id_or_name_reference(
            self.inventory_id,
            self.inventory_name,
            self.organization_name,
            AAPResourceType.INVENTORIES.field_prefix,
            required=False,
        )

        return self
