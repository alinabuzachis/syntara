"""Response models for AAP proxy endpoints."""

from pydantic import BaseModel


class AAPOrganization(BaseModel):
    """AAP organization resource."""

    id: int
    name: str


class AAPJobTemplate(BaseModel):
    """AAP job template resource."""

    id: int
    name: str
    description: str | None = None


class AAPJobTemplateDetail(BaseModel):
    """AAP job template with prompt-on-launch capabilities."""

    id: int
    name: str
    description: str | None = None
    url: str | None = None
    # Prompt-on-launch flags
    ask_job_type_on_launch: bool = False
    ask_inventory_on_launch: bool = False
    ask_credential_on_launch: bool = False
    ask_variables_on_launch: bool = False
    ask_limit_on_launch: bool = False
    ask_tags_on_launch: bool = False
    ask_skip_tags_on_launch: bool = False
    ask_verbosity_on_launch: bool = False
    ask_diff_mode_on_launch: bool = False
    ask_forks_on_launch: bool = False
    ask_job_slice_count_on_launch: bool = False
    ask_execution_environment_on_launch: bool = False
    ask_instance_groups_on_launch: bool = False
    ask_labels_on_launch: bool = False
    ask_timeout_on_launch: bool = False
    ask_scm_branch_on_launch: bool = False
    survey_enabled: bool = False


class AAPInventory(BaseModel):
    """AAP inventory resource."""

    id: int
    name: str
    description: str | None = None


class AAPExecutionEnvironment(BaseModel):
    """AAP execution environment resource."""

    id: int
    name: str
    description: str | None = None


class AAPCredential(BaseModel):
    """AAP credential resource.

    Only ``id`` and ``name`` are exposed — descriptions are omitted to avoid
    leaking infrastructure details (e.g. "prod-aws-root-key") to all users.
    """

    id: int
    name: str


class AAPInstanceGroup(BaseModel):
    """AAP instance group resource."""

    id: int
    name: str


class AAPListResponse[T](BaseModel):
    """Paginated list response from AAP Controller."""

    count: int
    results: list[T]
