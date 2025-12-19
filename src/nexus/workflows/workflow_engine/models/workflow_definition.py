"""Pydantic models for YAML workflow definitions.

These models represent the structure of workflow definitions parsed from YAML.
They are used for validation and type-safe access to workflow configuration.
"""

import re
from enum import Enum
from http import HTTPMethod
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationInfo, field_validator, model_validator
from pydantic.functional_validators import ModelWrapValidatorHandler

from nexus.workflows.utils.activity_traversal import traverse_activities
from nexus.workflows.workflow_engine import constants

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
        """Allow template expressions to bypass validation for any field.

        Args:
            value: The input value to validate
            handler: The default validation handler
            info: Validation context information

        Returns:
            Template string as-is, or validated value from handler

        """
        # Template expression - return directly, bypass all validators
        if isinstance(value, str) and TEMPLATE_PATTERN.search(value):
            return value

        # For non-template values, run normal validation (type coercion + constraints)
        return handler(value)


# Enums for type-safe string constants
class BackoffStrategy(str, Enum):
    """Backoff strategies for retry policies."""

    FIXED = "fixed"
    EXPONENTIAL = "exponential"
    LINEAR = "linear"


class ActivityType(str, Enum):
    """Supported activity types."""

    TASK = "task"
    PARALLEL = "parallel"
    SEQUENCE = "sequence"
    CONDITION = "condition"
    LOOP = "loop"
    CONVERGE = "converge"


class LoopType(str, Enum):
    """Supported loop types."""

    FOR_EACH = "forEach"
    WHILE = "while"


class ConvergeStrategy(str, Enum):
    """Converge strategies for parallel execution."""

    ALL = "all"


class TimeoutAction(str, Enum):
    """Actions to take when a timeout occurs."""

    CONTINUE = "continue"
    FAIL = "fail"
    APPROVE = "approve"
    REJECT = "reject"


class RetryPolicy(TemplateAwareBaseModel):
    """Retry policy configuration for activities."""

    model_config = ConfigDict(populate_by_name=True)

    max_attempts: int = Field(
        default=3, ge=0, le=100, description="Maximum number of retry attempts", alias="maxAttempts"
    )
    backoff: BackoffStrategy = Field(
        default=BackoffStrategy.EXPONENTIAL, description="Backoff strategy: fixed, exponential, linear"
    )
    multiplier: float | None = Field(default=2.0, ge=1.0, le=10.0, description="Multiplier for exponential backoff")
    initial_interval: int = Field(default=1, ge=1, description="Initial interval in seconds", alias="initialInterval")
    max_interval: int | None = Field(default=None, ge=1, description="Maximum interval in seconds", alias="maxInterval")
    retryable_errors: list[str] | None = Field(
        default=None, description="List of error types or codes that should trigger retry", alias="retryableErrors"
    )


# Loop definitions
class ForEachLoopDefinition(TemplateAwareBaseModel):
    """ForEach loop configuration."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal[LoopType.FOR_EACH] = Field(description="Loop type")
    items: str = Field(description="Expression referencing array to iterate over (e.g., ${input.users})")
    item_variable: str = Field(default="item", description="Variable name for current item", alias="itemVariable")
    index_variable: str = Field(default="index", description="Variable name for current index", alias="indexVariable")
    do: list["Activity"] = Field(description="Activities to execute in each iteration", min_length=1)


class WhileLoopDefinition(TemplateAwareBaseModel):
    """While loop configuration."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal[LoopType.WHILE] = Field(description="Loop type")
    condition: str = Field(description="Condition expression to evaluate before each iteration", min_length=1)
    max_iterations: int = Field(
        default=1000,
        ge=1,
        le=constants.MAX_LOOP_ITERATIONS,
        description="Maximum number of iterations to prevent infinite loops",
        alias="maxIterations",
    )
    do: list["Activity"] = Field(description="Activities to execute in each iteration", min_length=1)


LoopDefinition = ForEachLoopDefinition | WhileLoopDefinition


# Task executor configurations
class ScriptLanguage(str, Enum):
    """Supported script languages for script executor."""

    BASH = "bash"
    PYTHON = "python"


class AuthenticationType(str, Enum):
    """Supported authentication types for API requests."""

    BASIC = "basic"
    BEARER = "bearer"
    API_KEY = "apiKey"
    OAUTH2 = "oauth2"


class ScriptExecutorConfig(TemplateAwareBaseModel):
    """Configuration for script executor.

    Attributes:
        language: Script language (bash or python)
        code: Script code to execute
        environment: Optional environment variables for script execution
        timeout: Timeout for script execution in seconds (default from NEXUS_SCRIPT_TIMEOUT_SECONDS)

    """

    language: ScriptLanguage
    code: str = Field(min_length=1, description="Script code to execute")
    environment: dict[str, str] = Field(default_factory=dict, description="Environment variables for script execution")
    timeout: int = Field(
        default=constants.DEFAULT_SCRIPT_TIMEOUT_SECONDS,
        ge=1,
        le=3600,
        description="Timeout in seconds (default from NEXUS_SCRIPT_TIMEOUT_SECONDS, max: 3600)",
    )


class Authentication(TemplateAwareBaseModel):
    """Authentication configuration for API requests.

    Attributes:
        type: Authentication type (basic, bearer, apiKey, oauth2)
        credentials: Reference to stored credentials (must use ${secrets.XXX} pattern)

    """

    type: AuthenticationType = Field(description="Authentication type")
    credentials: str = Field(
        description="Reference to stored credentials",
        pattern=r"^\$\{secrets\.[a-zA-Z0-9_]+\}$",
    )


class APIExecutorConfig(TemplateAwareBaseModel):
    """Configuration for API executor.

    Attributes:
        method: HTTP method to use
        url: Request URL
        headers: Optional request headers
        body: Optional request body (dict or string)
        query_params: Optional query parameters
        authentication: Optional authentication configuration
        timeout: Optional timeout in seconds

    """

    model_config = ConfigDict(populate_by_name=True)

    method: HTTPMethod = Field(description="HTTP method (GET, POST, PUT, PATCH, DELETE)")
    url: str = Field(description="Request URL")
    headers: dict[str, Any] = Field(default_factory=dict)
    body: dict[str, Any] | str | None = None
    query_params: dict[str, Any] = Field(default_factory=dict, alias="queryParams")
    authentication: Authentication | None = Field(default=None, description="Authentication configuration")
    timeout: int | None = Field(default=None, ge=1, description="Optional timeout in seconds")


class AgenticExecutorConfig(TemplateAwareBaseModel):
    """Configuration for agentic executor.

    Attributes:
        prompt: The prompt template for the agent
        agent: Optional agent identifier for routing
        model: Optional model identifier
        timeout: Timeout for agent invocation in seconds (default from NEXUS_AGENTIC_TIMEOUT_SECONDS, max: 3600)

    """

    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(description="Prompt template for the agent")
    agent: str | None = Field(default=None, description="Optional agent identifier")
    model: str | None = Field(default=None, description="Optional model identifier")
    timeout: int = Field(
        default=constants.DEFAULT_AGENTIC_TIMEOUT_SECONDS,
        ge=1,
        le=3600,
        description="Timeout in seconds (default from NEXUS_AGENTIC_TIMEOUT_SECONDS, max: 3600)",
    )


class AAPJobTemplateExecutorConfig(TemplateAwareBaseModel):
    """Configuration for AAP Job Template executor.

    Launches job templates in Ansible Automation Platform and polls for completion.

    Job templates can be referenced either by numeric ID or by name with organization.
    Exactly one reference method must be specified:
    - job_template_id (numeric ID), OR
    - job_template_name + organization_name

    Attributes:
        job_template_id: AAP job template ID to launch (mutually exclusive with name-based)
        job_template_name: AAP job template name (requires organization_name)
        organization_name: AAP organization name (requires job_template_name)
        inventory: Override default inventory (name or ID)
        credentials: List of credential IDs to use
        extra_vars: Extra variables to pass to job
        limit: Limit job execution to specific hosts
        tags: Ansible tags to run (comma-separated)
        skip_tags: Ansible tags to skip (comma-separated)
        verbosity: Job verbosity level (0-5)
        timeout: Timeout for job execution in seconds (default: 3600)

    """

    model_config = ConfigDict(populate_by_name=True)

    job_template_id: int | None = Field(
        default=None,
        ge=1,
        description="AAP job template ID to launch",
        alias="jobTemplateId",
    )
    inventory: int | None = Field(
        default=None,
        ge=1,
        description="Override default inventory (ID only)",
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
        description="Timeout for job execution in seconds (default from NEXUS_AAP_TIMEOUT_SECONDS)",
    )
    job_template_name: str | None = Field(
        default=None,
        description="AAP job template name (used with organization_name)",
        alias="jobTemplateName",
    )
    organization_name: str | None = Field(
        default=None,
        description="AAP organization name (used with job_template_name)",
        alias="organizationName",
    )

    @model_validator(mode="after")
    def validate_template_reference(self) -> Self:
        """Validate EITHER job_template_id OR (job_template_name + organization_name)."""
        # Strip whitespace from name fields
        # Use object.__setattr__ to avoid triggering validate_assignment recursion
        if self.job_template_name:
            object.__setattr__(self, "job_template_name", self.job_template_name.strip())
        if self.organization_name:
            object.__setattr__(self, "organization_name", self.organization_name.strip())

        has_id = self.job_template_id is not None
        has_name = bool(self.job_template_name)
        has_org = bool(self.organization_name)

        if has_id and (has_name or has_org):
            msg = "Cannot specify both job_template_id and job_template_name/organization_name"
            raise ValueError(msg)

        if has_name and not has_org:
            msg = "organization_name is required when using job_template_name"
            raise ValueError(msg)

        if has_org and not has_name:
            msg = "job_template_name is required when using organization_name"
            raise ValueError(msg)

        if not has_id and not has_name:
            msg = "Must specify either job_template_id or (job_template_name + organization_name)"
            raise ValueError(msg)

        return self


# Executor type enum
class ExecutorType(str, Enum):
    """Supported executor types for tasks."""

    SCRIPT = "script"
    API = "api"
    AGENTIC = "agentic"
    AAP_JOB_TEMPLATE = "aap_job_template"


# Union type for executor configs (strict - only typed configs allowed)
ExecutorConfig = ScriptExecutorConfig | APIExecutorConfig | AgenticExecutorConfig | AAPJobTemplateExecutorConfig


# Task definitions
class TaskDefinition(TemplateAwareBaseModel):
    """Definition for an executable task."""

    executor: ExecutorType = Field(description="Task executor type")
    config: ExecutorConfig = Field(description="Executor-specific configuration")
    inputs: dict[str, Any] | None = Field(default=None, description="Input parameters for the task")
    outputs: dict[str, str] | None = Field(
        default=None, description="Output mapping from the task (JSONPath expressions)"
    )


class ApprovalDefinition(TemplateAwareBaseModel):
    """Human approval configuration."""

    model_config = ConfigDict(populate_by_name=True)

    approvers: list[str] = Field(description="List of users or roles who can approve", min_length=1)
    prompt: str = Field(description="Approval prompt/question to display", min_length=1)
    timeout: int | None = Field(default=None, ge=1, description="Time to wait for approval in seconds")
    on_timeout: TimeoutAction = Field(
        default=TimeoutAction.FAIL, description="Action to take if approval times out", alias="onTimeout"
    )
    metadata: dict[str, Any] | None = Field(default=None, description="Additional context to display to approvers")


class ConvergeDefinition(TemplateAwareBaseModel):
    """Converge pattern configuration - waits for specific activities to complete."""

    model_config = ConfigDict(populate_by_name=True)

    branches: list[str] = Field(description="List of activity IDs to wait for", min_length=1)
    strategy: ConvergeStrategy = Field(
        default=ConvergeStrategy.ALL, description="Converge strategy (only 'all' is supported)"
    )
    timeout: int | None = Field(
        default=None, ge=1, description="Maximum time to wait for converge condition in seconds"
    )
    on_timeout: TimeoutAction = Field(
        default=TimeoutAction.FAIL, description="Action to take if timeout is reached", alias="onTimeout"
    )
    aggregate_outputs: bool = Field(
        default=True,
        description="Whether to aggregate outputs from completed branches into an object keyed by activity ID",
        alias="aggregateOutputs",
    )


# Activity definition (supports multiple types)
class Activity(TemplateAwareBaseModel):
    """Workflow activity definition.

    Activity types:
    - task: Execute a task (script, API call, connector, agentic)
    - parallel: Execute multiple activities in parallel
    - sequence: Execute multiple activities sequentially
    - condition: Conditional branching (if/then/else)
    - loop: Loop execution (forEach, while)
    - converge: Wait for multiple activities to complete
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(description="Unique identifier for the activity", pattern=r"^[a-zA-Z_][a-zA-Z0-9_]*$")
    name: str | None = Field(default=None, description="Human-readable activity name")
    type: ActivityType = Field(description="Activity type")
    requires_approval: bool = Field(
        default=False, description="Whether this activity requires human approval", alias="requiresApproval"
    )
    approval: ApprovalDefinition | None = Field(
        default=None, description="Human approval configuration (required if requiresApproval is true)"
    )
    retry_policy: RetryPolicy | None = Field(
        default=None, description="Retry policy for this activity", alias="retryPolicy"
    )
    timeout: int | None = Field(default=None, ge=1, description="Activity timeout in seconds")
    outputs: dict[str, dict[str, Any]] | None = Field(
        default=None, description="Output schema definition for this activity"
    )

    # Type-specific fields (conditionally required based on type)
    task: TaskDefinition | None = Field(default=None, description="Task definition (required for type=task)")
    branches: list["Activity"] | None = Field(
        default=None, description="Activities to execute in parallel (required for type=parallel)", min_length=2
    )
    steps: list["Activity"] | None = Field(
        default=None, description="Activities to execute sequentially (required for type=sequence)", min_length=1
    )
    condition: str | None = Field(
        default=None, description="Conditional expression (required for type=condition)", min_length=1
    )
    then: list["Activity"] | None = Field(
        default=None,
        description="Activities to execute if condition is true (required for type=condition)",
        min_length=1,
    )
    else_: list["Activity"] | None = Field(
        default=None, alias="else", description="Activities to execute if condition is false (for type=condition)"
    )
    loop: LoopDefinition | None = Field(default=None, description="Loop definition (required for type=loop)")
    converge: ConvergeDefinition | None = Field(
        default=None, description="Converge definition (required for type=converge)"
    )

    @field_validator("task")
    @classmethod
    def validate_task_required(cls, v: TaskDefinition | None, info: ValidationInfo) -> TaskDefinition | None:
        """Ensure task is provided when type=task."""
        if info.data.get("type") == "task" and v is None:
            msg = "task field is required when type='task'"
            raise ValueError(msg)
        return v

    @field_validator("branches")
    @classmethod
    def validate_branches_required(cls, v: list[Any] | None, info: ValidationInfo) -> list[Any] | None:
        """Ensure branches is provided when type=parallel."""
        if info.data.get("type") == "parallel" and v is None:
            msg = "branches field is required when type='parallel'"
            raise ValueError(msg)
        return v

    @field_validator("steps")
    @classmethod
    def validate_steps_required(cls, v: list[Any] | None, info: ValidationInfo) -> list[Any] | None:
        """Ensure steps is provided when type=sequence."""
        if info.data.get("type") == "sequence" and v is None:
            msg = "steps field is required when type='sequence'"
            raise ValueError(msg)
        return v

    @field_validator("then")
    @classmethod
    def validate_then_required(cls, v: list[Any] | None, info: ValidationInfo) -> list[Any] | None:
        """Ensure then and condition are provided when type=condition."""
        if info.data.get("type") == "condition":
            if v is None:
                msg = "then field is required when type='condition'"
                raise ValueError(msg)
            if not info.data.get("condition"):
                msg = "condition field is required when type='condition'"
                raise ValueError(msg)
        return v

    @field_validator("loop")
    @classmethod
    def validate_loop_required(cls, v: LoopDefinition | None, info: ValidationInfo) -> LoopDefinition | None:
        """Ensure loop is provided when type=loop."""
        if info.data.get("type") == "loop" and v is None:
            msg = "loop field is required when type='loop'"
            raise ValueError(msg)
        return v

    @field_validator("converge")
    @classmethod
    def validate_converge_required(
        cls, v: ConvergeDefinition | None, info: ValidationInfo
    ) -> ConvergeDefinition | None:
        """Ensure converge is provided when type=converge."""
        if info.data.get("type") == "converge" and v is None:
            msg = "converge field is required when type='converge'"
            raise ValueError(msg)
        return v


class WorkflowSpec(TemplateAwareBaseModel):
    """Workflow specification containing activities."""

    activities: list[Activity] = Field(description="List of workflow activities", min_length=1)

    @field_validator("activities")
    @classmethod
    def validate_unique_activity_ids(cls, activities: list[Activity]) -> list[Activity]:
        """Ensure all activity IDs are unique within the workflow.

        This validator recursively checks all activities, including nested activities
        in parallel branches, sequences, conditions, and loops.
        """
        # Collect all activity IDs using shared traversal utility
        all_ids_with_paths = traverse_activities(activities, lambda activity, path: (activity.id, path))

        # Check for duplicates
        seen_ids: dict[str, str] = {}
        for activity_id, path in all_ids_with_paths:
            if activity_id in seen_ids:
                msg = (
                    f"Duplicate activity ID '{activity_id}' found. "
                    f"First occurrence: {seen_ids[activity_id]}, "
                    f"Second occurrence: {path}. "
                    f"Activity IDs must be unique within a workflow."
                )
                raise ValueError(msg)
            seen_ids[activity_id] = path

        return activities


class InputParameter(TemplateAwareBaseModel):
    """Workflow input parameter definition."""

    type: Literal["string", "number", "integer", "boolean", "object", "array"] = Field(
        description="Parameter data type"
    )
    description: str | None = Field(default=None, description="Parameter description")
    required: bool = Field(default=False, description="Whether parameter is required")
    default: Any | None = Field(default=None, description="Default value if not provided")
    enum: list[Any] | None = Field(default=None, description="Allowed values for the parameter", min_length=1)
    pattern: str | None = Field(default=None, description="Regex pattern for string validation")
    minimum: float | None = Field(default=None, description="Minimum value for numeric parameters")
    maximum: float | None = Field(default=None, description="Maximum value for numeric parameters")


class ManualTrigger(TemplateAwareBaseModel):
    """Manual trigger - user initiates workflow execution."""

    model_config = ConfigDict(populate_by_name=True)

    type: Literal["manual"] = Field(description="Trigger type")
    requires_approval: bool = Field(
        default=False, description="Whether manual execution requires approval", alias="requiresApproval"
    )


Trigger = ManualTrigger


class Metadata(TemplateAwareBaseModel):
    """Workflow metadata."""

    name: str = Field(description="Workflow name", pattern=r"^[a-zA-Z0-9_-]+$", min_length=1, max_length=255)
    description: str = Field(description="Workflow description", min_length=1, max_length=1000)
    tags: list[str] | None = Field(default=None, description="Workflow tags for categorization")
    owner: str | None = Field(default=None, description="User or team responsible for the workflow")
    timeout: int | None = Field(
        default=None, ge=1, description="Maximum workflow execution time in seconds - applies to entire workflow"
    )


class WorkflowDefinition(TemplateAwareBaseModel):
    """Complete workflow definition parsed from YAML.

    This is the root model representing a complete workflow configuration.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        extra="forbid",  # Reject unknown fields
        validate_assignment=True,
    )

    schema_version: str = Field(
        description="Schema version (semver format)", pattern=r"^[0-9]+\.[0-9]+\.[0-9]+$", alias="schemaVersion"
    )
    version: int = Field(ge=1, description="Workflow version number")
    metadata: Metadata = Field(description="Workflow metadata")
    triggers: list[Trigger] = Field(description="Workflow triggers", min_length=1)
    inputs: dict[str, InputParameter] | None = Field(default=None, description="Workflow input parameters")
    variables: dict[str, Any] | None = Field(
        default=None, description="Workflow-level variables that can be referenced throughout the workflow"
    )
    secrets: dict[str, dict[str, Any]] | None = Field(
        default=None, description="Secret references for credentials and sensitive data"
    )
    workflow: WorkflowSpec = Field(description="Workflow specification with activities")


# Update forward references
Activity.model_rebuild()
ForEachLoopDefinition.model_rebuild()
WhileLoopDefinition.model_rebuild()
