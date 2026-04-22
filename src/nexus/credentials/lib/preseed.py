"""Preseed GA managed credential types.

Creates 5 managed credential types if they don't exist, updates them
in place if they do. Uses INSERT ... ON CONFLICT DO UPDATE for atomicity —
safe under concurrent execution.

Registered in the unified seeder (``nexus.core.seed``) and invoked via
``uv run python -m nexus.seed``.
"""

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import structlog
from sqlalchemy.dialects.postgresql import insert
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.credentials.models.credential_type import CredentialType

logger = structlog.stdlib.get_logger(__name__)

_UPSERT_UPDATE_FIELDS = (
    "description",
    "inputs",
    "injectors",
    "managed",
    "updated_at",
)

GA_CREDENTIAL_TYPES: list[dict[str, Any]] = [
    {
        "name": "HTTP Bearer Token",
        "description": "Bearer token authentication for HTTP APIs",
        "inputs": {
            "fields": [
                {
                    "id": "token",
                    "label": "Token",
                    "type": "string",
                    "secret": True,
                    "help_text": (
                        "The bearer token used for API authentication."
                        " Sent in the Authorization header as 'Bearer <token>'."
                    ),
                    "placeholder": "Enter bearer token",
                },
            ],
            "required": ["token"],
        },
        "injectors": {
            "extra_vars": {"auth_type": "bearer", "bearer_token": "{{token}}"},
            "env": {},
            "file": {},
        },
    },
    {
        "name": "HTTP Basic Auth",
        "description": "Username and password authentication for HTTP APIs",
        "inputs": {
            "fields": [
                {
                    "id": "username",
                    "label": "Username",
                    "type": "string",
                    "secret": False,
                    "help_text": "Username for HTTP Basic Authentication.",
                    "placeholder": "Enter username",
                },
                {
                    "id": "password",
                    "label": "Password",
                    "type": "string",
                    "secret": True,
                    "help_text": "Password for HTTP Basic Authentication. Encrypted at rest.",
                    "placeholder": "Enter password",
                },
            ],
            "required": ["username", "password"],
        },
        "injectors": {
            "extra_vars": {
                "auth_type": "basic",
                "basic_username": "{{username}}",
                "basic_password": "{{password}}",
            },
            "env": {},
            "file": {},
        },
    },
    {
        "name": "Ansible Automation Platform",
        "description": "Authentication token for Ansible Automation Platform",
        "inputs": {
            "fields": [
                {
                    "id": "host",
                    "label": "AAP Host",
                    "type": "string",
                    "secret": False,
                    "help_text": "AAP Controller hostname or URL (e.g., https://controller.example.com)",
                    "placeholder": "https://controller.example.com",
                },
                {
                    "id": "username",
                    "label": "Username",
                    "type": "string",
                    "secret": False,
                    "help_text": "AAP username (optional if using OAuth token)",
                    "placeholder": "Enter AAP username",
                },
                {
                    "id": "password",
                    "label": "Password",
                    "type": "string",
                    "secret": True,
                    "help_text": "AAP password (optional if using OAuth token)",
                    "placeholder": "Enter AAP password",
                },
                {
                    "id": "oauth_token",
                    "label": "OAuth Token",
                    "type": "string",
                    "secret": True,
                    "help_text": "AAP OAuth2 token (preferred over username/password)",
                    "placeholder": "Enter OAuth2 token",
                },
                {
                    "id": "verify_ssl",
                    "label": "Verify SSL",
                    "type": "boolean",
                    "secret": False,
                    "default": True,
                    "help_text": "Verify SSL certificates when connecting to AAP",
                },
            ],
            "required": ["host"],
        },
        "injectors": {
            "extra_vars": {
                "auth_type": "aap",
                "aap_host": "{{host}}",
                "aap_username": "{{username}}",
                "aap_password": "{{password}}",
                "aap_oauth_token": "{{oauth_token}}",
                "aap_verify_ssl": "{{verify_ssl}}",
            },
            "env": {},
            "file": {},
        },
    },
    {
        "name": "LLM Provider",
        "description": "API credentials for LLM providers (OpenAI, Anthropic, etc.)",
        "inputs": {
            "fields": [
                {
                    "id": "provider",
                    "label": "Provider",
                    "type": "string",
                    "secret": False,
                    "choices": ["openai", "anthropic", "openrouter", "azure_openai", "other"],
                    "help_text": "LLM provider name (optional — used for API routing)",
                },
                {
                    "id": "api_key",
                    "label": "API Key",
                    "type": "string",
                    "secret": True,
                    "help_text": "API key for the LLM provider service",
                    "placeholder": "Enter API key",
                },
                {
                    "id": "base_url",
                    "label": "Base URL",
                    "type": "string",
                    "secret": False,
                    "help_text": "Custom base URL (overrides provider default, leave empty to use default)",
                    "placeholder": "https://api.example.com/v1",
                },
            ],
            "required": ["api_key"],
        },
        "injectors": {
            "extra_vars": {
                "auth_type": "api_key",
                "llm_provider": "{{provider}}",
                "llm_api_key": "{{api_key}}",
                "llm_base_url": "{{base_url}}",
            },
            "env": {},
            "file": {},
        },
    },
    {
        "name": "SSH Key",
        "description": "SSH private key for authentication (non-passphrase-protected)",
        "inputs": {
            "fields": [
                {
                    "id": "username",
                    "label": "Username",
                    "type": "string",
                    "secret": False,
                    "help_text": "SSH username for remote host authentication.",
                    "placeholder": "Enter SSH username",
                },
                {
                    "id": "ssh_private_key",
                    "label": "Private key",
                    "type": "string",
                    "secret": True,
                    "multiline": True,
                    "help_text": "SSH private key in PEM format (must not have a passphrase).",
                    "placeholder": "-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----",
                },
            ],
            "required": ["username", "ssh_private_key"],
        },
        "injectors": {
            "extra_vars": {
                "auth_type": "ssh",
                "ssh_username": "{{username}}",
                "ssh_private_key": "{{ssh_private_key}}",
            },
            "env": {},
            "file": {},
        },
    },
]


async def preseed_credential_types(session: AsyncSession) -> None:
    """Upsert GA managed credential types into the database.

    Uses INSERT ... ON CONFLICT DO UPDATE for atomicity — safe under
    concurrent execution. The upsert targets the unique constraint
    on ``CredentialType.name``.

    Args:
        session: An open async database session. This function commits
            the transaction before returning.

    """
    now = datetime.now(UTC)

    rows = [
        {
            "id": uuid4(),
            "name": type_def["name"],
            "description": type_def["description"],
            "inputs": type_def["inputs"],
            "injectors": type_def["injectors"],
            "managed": True,
            "labels": {},
            "created_at": now,
            "updated_at": now,
        }
        for type_def in GA_CREDENTIAL_TYPES
    ]

    stmt = insert(CredentialType).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["name"],
        set_={col: stmt.excluded[col] for col in _UPSERT_UPDATE_FIELDS},
    )

    await session.execute(stmt)
    await session.commit()

    logger.info("credential_types.preseed.complete", count=len(rows))
