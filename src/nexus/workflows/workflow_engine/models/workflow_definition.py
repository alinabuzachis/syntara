"""Activity executor configuration models for V2 workflows.

This module contains Pydantic models for activity executor configurations.
These are used by V2 workflow activities for config validation.
"""

import re
import uuid
from enum import Enum, IntEnum, StrEnum
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


class ActivityName(StrEnum):
    """Temporal activity names for V2 workflows."""

    # Triggers
    MANUAL_TRIGGER = "manual_trigger"
    SCHEDULED_TRIGGER = "scheduled_trigger"
    WEBHOOK_TRIGGER = "webhook_trigger"
    EDA_TRIGGER = "eda_trigger"
    # Control nodes
    CONDITION = "condition"
    CONVERGE = "converge"
    LOOP = "loop"
    # Executor nodes
    AAP_JOB_TEMPLATE = "execute_aap_job_template_activity"
    AAP_WORKFLOW_JOB_TEMPLATE = "execute_aap_workflow_job_template_activity"
    AGENTIC = "execute_agentic_activity"
    APPROVAL = "execute_approval_activity"
    HTTP_REQUEST = "execute_http_request_activity"
    SCRIPT = "execute_script_activity"
    # Internal
    CREDENTIAL_RESOLUTION = "resolve_workflow_credentials"
    ACTIVITY_MONITORING = "register_activity_monitoring"


# Enums
class NodeType(str, Enum):
    """Node types for V2 workflows (used by telemetry)."""

    # Triggers
    MANUAL_TRIGGER = "manual_trigger"
    SCHEDULED_TRIGGER = "scheduled_trigger"
    WEBHOOK_TRIGGER = "webhook_trigger"
    EDA_TRIGGER = "eda_trigger"
    # Control nodes
    CONDITION = "condition"
    CONVERGE = "converge"
    LOOP = "loop"
    # Executor nodes
    AAP_JOB_TEMPLATE = "aap_job_template"
    AAP_WORKFLOW_JOB_TEMPLATE = "aap_workflow_job_template"
    AGENTIC = "agentic"
    APPROVAL = "approval"
    HTTP_REQUEST = "http_request"
    SCRIPT = "script"


class LoopType(StrEnum):
    """Loop sub-types for V2 workflows."""

    FOR_EACH = "for_each"
    DO_WHILE = "do_while"


class ForEachLoopState(BaseModel):
    """State for a for_each loop iteration."""

    model_config = ConfigDict(frozen=False)

    type: LoopType = LoopType.FOR_EACH
    items: list[Any]
    current_index: int = 0


class DoWhileLoopState(BaseModel):
    """State for a do_while loop iteration."""

    model_config = ConfigDict(frozen=False)

    type: LoopType = LoopType.DO_WHILE
    condition: str | None
    max_iterations: int | None = None
    current_index: int = 0


LoopState = ForEachLoopState | DoWhileLoopState


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
        timeout: Timeout for script execution in seconds (runtime setting: workflow_engine.script_timeout_seconds)

    """

    language: ScriptLanguage
    code: str = Field(min_length=1, description="Script code to execute")
    environment: dict[str, str] = Field(default_factory=dict, description="Environment variables")
    timeout: int = Field(
        ge=1,
        le=3600,
        description="Timeout in seconds (runtime setting: workflow_engine.script_timeout_seconds)",
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

    method: HTTPMethod = Field(description="HTTP method")
    url: str = Field(description="Request URL")
    headers: dict[str, Any] = Field(default_factory=dict)
    body: dict[str, Any] | str | None = None
    query_params: dict[str, Any] = Field(default_factory=dict)
    authentication: Authentication | None = None
    credential_id: str | None = Field(
        default=None,
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


class AgenticExecutorConfig(TemplateAwareBaseModel, populate_by_name=True):
    """Configuration for agentic executor.

    Attributes:
        prompt: The prompt template for the agent
        agent: Optional agent identifier for routing
        model: Optional model identifier
        timeout: Timeout in seconds (runtime setting: workflow_engine.agentic_timeout_seconds)
        file_ids: List of file IDs to include as context for the agent (max 10)

    """

    prompt: str = Field(description="Prompt template for the agent")
    agent: str | None = None
    model: str | None = None
    credential_id: str | None = Field(
        default=None,
        description="Nexus credential UUID for LLM provider authentication",
    )
    timeout: int = Field(
        ge=1,
        le=3600,
        description="Timeout in seconds (runtime setting: workflow_engine.agentic_timeout_seconds)",
    )
    file_ids: list[str] = Field(
        default_factory=list,
        max_length=10,
        description="File IDs for agent context",
    )
    response_schema: dict[str, Any] | str | None = Field(
        default=None,
        alias="responseSchema",
        description="JSON Schema for structured output. When defined, agent output conforms to this schema.",
    )

    @field_validator("prompt")
    @classmethod
    def validate_prompt_security(cls, v: str) -> str:
        """Validate prompt content for security.

        Prompt length is validated at runtime by the agentic activity
        against the ``workflow_engine.max_prompt_length`` setting.
        """
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

    @field_validator("response_schema")
    @classmethod
    def validate_response_schema_structure(cls, v: dict[str, Any] | str | None) -> dict[str, Any] | str | None:
        """Validate response_schema is a valid JSON schema object.

        Template expressions (str matching ${...}) bypass this validator via
        TemplateAwareBaseModel's wrap validator and arrive here as str.
        Non-template values arrive as dict or None.
        """
        if v is None or isinstance(v, str):
            return v
        if "type" not in v:
            msg = "response_schema must include a 'type' field"
            raise SafeValueError(msg)
        return v


class AAPVerbosity(IntEnum):
    """AAP job verbosity levels (0-5)."""

    NORMAL = 0
    VERBOSE = 1
    MORE_VERBOSE = 2
    DEBUG = 3
    CONNECTION_DEBUG = 4
    WINRM_DEBUG = 5


class AAPJobType(str, Enum):
    """AAP job type values."""

    RUN = "run"
    CHECK = "check"


class AAPResourceReferenceMixin(BaseModel):
    """Mixin for AAP executor configs with common fields and resource reference validation.

    Provides shared fields used by both AAP job template and workflow job template configs,
    including authentication, organization/inventory references, prompt-on-launch overrides,
    and label support.
    """

    # Authentication
    credential_id: str | None = Field(
        default=None,
        description="Nexus credential UUID for AAP API authentication. Separate from legacy credentials list.",
    )

    # Organization and inventory references
    organization_id: int | None = Field(
        default=None,
        ge=1,
        description="AAP organization ID (takes precedence over organization_name)",
        alias="organizationId",
    )
    organization_name: str | None = Field(
        default=None,
        description="AAP organization name (used with template_name or inventory_name)",
    )
    inventory_id: int | None = Field(
        default=None,
        ge=1,
        description="Override default inventory by ID (mutually exclusive with inventory_name)",
    )
    inventory_name: str | None = Field(
        default=None,
        description="Override default inventory by name (requires organization_name)",
    )

    # Prompt-on-launch overrides (common to both job and workflow job templates)
    extra_vars: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra variables to pass to job/workflow job",
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
    )
    labels: list[str] | None = Field(
        default=None,
        description=(
            "AAP label names to append to template's default labels. "
            "Names are resolved to IDs at launch time. "
            "New labels that don't exist in AAP will be created automatically. "
            "Note: Labels are APPENDED to template defaults, not replaced."
        ),
    )

    # Execution settings
    timeout: int = Field(
        default=constants.DEFAULT_AAP_TIMEOUT_SECONDS,
        ge=1,
        description="Timeout for execution in seconds (default from APP_AAP_TIMEOUT_SECONDS)",
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


class AAPJobTemplateExecutorConfig(AAPResourceReferenceMixin, TemplateAwareBaseModel):
    """Configuration for AAP Job Template executor.

    Inherits common AAP fields from AAPResourceReferenceMixin (credential_id, organization,
    inventory, extra_vars, limit, tags, skip_tags, labels, timeout).
    """

    # Job template reference
    job_template_id: int | None = Field(
        default=None,
        ge=1,
        description="AAP job template ID to launch",
    )
    job_template_name: str | None = Field(
        default=None,
        description="AAP job template name (used with organization_name)",
    )

    # Job-specific credentials (workflow jobs don't support this)
    job_credentials: list[int] | None = Field(
        default=None,
        description="List of AAP credential IDs to use (takes precedence over credential_names)",
    )
    credential_names: list[str] | None = Field(
        default=None,
        description="List of AAP credential names to use (requires organization_name, resolved at launch time)",
        alias="credentialNames",
    )

    # Job-specific prompt-on-launch fields
    verbosity: AAPVerbosity = Field(
        default=AAPVerbosity.NORMAL,
        description="Job verbosity level (0-5)",
    )
    job_type: AAPJobType | None = Field(
        default=None,
        description="Job type override: 'run' or 'check' (dry run)",
    )
    forks: int | None = Field(
        default=None,
        ge=0,
        description="Number of parallel forks for job execution",
    )
    job_slicing: int | None = Field(
        default=None,
        ge=1,
        description="Number of job slices",
    )
    diff_mode: bool | None = Field(
        default=None,
        description="Enable diff mode for playbook runs",
    )

    # Deferred prompt-on-launch fields (require ID resolution)
    execution_environment: str | None = Field(
        default=None,
        description="Execution environment override (deferred — requires ID resolution)",
    )
    instance_group_id: int | None = Field(
        default=None,
        ge=1,
        description="Override instance group by ID (takes precedence over instance_group_name)",
    )
    instance_group_name: str | None = Field(
        default=None,
        description="Override instance group by name (requires organization_name for lookup)",
    )

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


class AAPWorkflowJobTemplateExecutorConfig(AAPResourceReferenceMixin, TemplateAwareBaseModel):
    """Configuration for AAP Workflow Job Template executor.

    Inherits common AAP fields from AAPResourceReferenceMixin (credential_id, organization,
    inventory, extra_vars, limit, tags, skip_tags, labels, timeout).
    """

    # Workflow job template reference
    workflow_job_template_id: int | None = Field(
        default=None,
        ge=1,
        description="AAP workflow job template ID to launch",
    )
    workflow_job_template_name: str | None = Field(
        default=None,
        description="AAP workflow job template name (used with organization_name)",
    )

    # Workflow-specific prompt-on-launch field (not available for regular job templates)
    scm_branch: str | None = Field(
        default=None,
        description="SCM branch override for projects in workflow",
    )

    @model_validator(mode="after")
    def validate_references(self) -> "AAPWorkflowJobTemplateExecutorConfig":
        """Validate workflow job template and inventory references."""
        # Validate workflow job template reference
        self._validate_id_or_name_reference(
            self.workflow_job_template_id,
            self.workflow_job_template_name,
            self.organization_name,
            AAPResourceType.WORKFLOW_JOB_TEMPLATES.field_prefix,
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
