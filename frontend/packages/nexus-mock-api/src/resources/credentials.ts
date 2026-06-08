import type { CredentialsAPI } from '@ansible/nexus-contracts'

type CredentialRead = CredentialsAPI.components['schemas']['CredentialRead']
type CredentialTypeRead = CredentialsAPI.components['schemas']['CredentialTypeRead']

// Type assertion needed because the contract types `inputs` as Record<string, never>,
// but the runtime JSON contains field schema objects. The UI casts with `as Record<string, unknown>`.
type FieldDef = {
  id: string
  label: string
  type: string
  secret?: boolean
  help_text?: string
  choices?: string[]
  default?: unknown
  multiline?: boolean
}

function typeInputs(fields: FieldDef[], required: string[] = []) {
  return { fields, required } as CredentialTypeRead['inputs']
}

function typeInjectors(extra_vars: Record<string, string>) {
  return { env: {}, file: {}, extra_vars } as CredentialTypeRead['injectors']
}

export const credentialTypes: CredentialTypeRead[] = [
  {
    id: 'ctype-bearer',
    name: 'HTTP Bearer Token',
    description: 'Bearer token authentication for HTTP APIs',
    inputs: typeInputs(
      [{ id: 'token', type: 'string', label: 'Token', secret: true, help_text: 'Bearer token value' }],
      ['token']
    ),
    injectors: typeInjectors({ auth_type: 'bearer', bearer_token: '{{token}}' }),
    managed: true,
    credential_count: 1,
    created_at: '2025-06-01T09:00:00Z',
    updated_at: '2025-06-01T09:00:00Z',
    labels: {},
  },
  {
    id: 'ctype-basic',
    name: 'HTTP Basic Auth',
    description: 'Username and password authentication for HTTP APIs',
    inputs: typeInputs(
      [
        { id: 'username', type: 'string', label: 'Username', secret: false, help_text: 'Username for authentication' },
        { id: 'password', type: 'string', label: 'Password', secret: true, help_text: 'Password for authentication' },
      ],
      ['username', 'password']
    ),
    injectors: typeInjectors({ auth_type: 'basic', basic_username: '{{username}}', basic_password: '{{password}}' }),
    managed: true,
    credential_count: 2,
    created_at: '2025-06-01T09:00:00Z',
    updated_at: '2025-06-01T09:00:00Z',
    labels: {},
  },
  {
    id: 'ctype-aap',
    name: 'Ansible Automation Platform',
    description: 'Authentication for Ansible Automation Platform Controller API',
    inputs: typeInputs(
      [
        { id: 'host', type: 'string', label: 'AAP Host', secret: false, help_text: 'AAP Controller hostname or URL' },
        {
          id: 'username',
          type: 'string',
          label: 'Username',
          secret: false,
          help_text: 'AAP username (optional if using token)',
        },
        {
          id: 'password',
          type: 'string',
          label: 'Password',
          secret: true,
          help_text: 'AAP password (optional if using token)',
        },
        {
          id: 'oauth_token',
          type: 'string',
          label: 'OAuth Token',
          secret: true,
          help_text: 'AAP OAuth2 token (preferred over username/password)',
        },
        {
          id: 'verify_ssl',
          type: 'boolean',
          label: 'Verify SSL',
          secret: false,
          default: true,
          help_text: 'Verify SSL certificates',
        },
      ],
      ['host']
    ),
    injectors: typeInjectors({
      auth_type: 'aap',
      aap_host: '{{host}}',
      aap_username: '{{username}}',
      aap_password: '{{password}}',
      aap_oauth_token: '{{oauth_token}}',
      aap_verify_ssl: '{{verify_ssl}}',
    }),
    managed: true,
    credential_count: 0,
    created_at: '2025-06-01T09:00:00Z',
    updated_at: '2025-06-01T09:00:00Z',
    labels: {},
  },
  {
    id: 'ctype-llm',
    name: 'LLM Provider',
    description: 'API key authentication for LLM providers (OpenAI, Anthropic, etc.)',
    inputs: typeInputs(
      [
        {
          id: 'provider',
          type: 'string',
          label: 'Provider',
          secret: false,
          choices: ['openai', 'anthropic', 'openrouter', 'azure_openai', 'other'],
          help_text: 'LLM provider (optional — used for routing)',
        },
        { id: 'api_key', type: 'string', label: 'API Key', secret: true, help_text: 'API key for the LLM provider' },
        {
          id: 'base_url',
          type: 'string',
          label: 'Base URL',
          secret: false,
          help_text: 'Optional custom base URL (overrides provider default)',
        },
      ],
      ['api_key']
    ),
    injectors: typeInjectors({
      auth_type: 'api_key',
      llm_provider: '{{provider}}',
      llm_api_key: '{{api_key}}',
      llm_base_url: '{{base_url}}',
    }),
    managed: true,
    credential_count: 0,
    created_at: '2025-06-01T09:00:00Z',
    updated_at: '2025-06-01T09:00:00Z',
    labels: {},
  },
  {
    id: 'ctype-ssh',
    name: 'SSH Key',
    description: 'SSH private key authentication without passphrase',
    inputs: typeInputs(
      [
        { id: 'username', type: 'string', label: 'Username', secret: false, help_text: 'SSH username' },
        {
          id: 'ssh_private_key',
          type: 'string',
          label: 'Private key',
          secret: true,
          help_text: 'Paste private key contents (OpenSSH format, no passphrase)',
          multiline: true,
        },
      ],
      ['username', 'ssh_private_key']
    ),
    injectors: typeInjectors({
      auth_type: 'ssh',
      ssh_username: '{{username}}',
      ssh_private_key: '{{ssh_private_key}}',
    }),
    managed: true,
    credential_count: 0,
    created_at: '2025-06-01T09:00:00Z',
    updated_at: '2025-06-01T09:00:00Z',
    labels: {},
  },
]

// Workflow references for credential detail pages
export const credentialWorkflows: Record<string, { id: string; name: string }[]> = {
  'cred-001': [
    { id: 'wf-001', name: 'Production Deployment Pipeline' },
    { id: 'wf-002', name: 'Nightly Health Check' },
  ],
}

/** TODO: Revert to CredentialRead[] once project_id is added to the OpenAPI spec */
export const credentials: (CredentialRead & { project_id?: string })[] = [
  {
    id: 'cred-001',
    name: 'Production API Auth',
    description: 'Basic auth for production API access',
    credential_type_id: 'ctype-basic',
    inputs: { username: 'admin', password: '$encrypted$' },
    enabled: true,
    created_at: '2025-07-10T14:30:00Z',
    updated_at: '2025-07-10T14:30:00Z',
    created_by: 'user-001',
    labels: {},
    deleted_at: null,
    deleted_by: null,
    project_id: 'p-001',
  },
  {
    id: 'cred-002',
    name: 'Staging API Auth',
    description: 'Basic auth for staging environment',
    credential_type_id: 'ctype-basic',
    inputs: { username: 'deploy', password: '$encrypted$' },
    enabled: true,
    created_at: '2025-07-12T10:00:00Z',
    updated_at: '2025-07-12T10:00:00Z',
    created_by: 'user-001',
    labels: {},
    deleted_at: null,
    deleted_by: null,
    project_id: 'p-001',
  },
  {
    id: 'cred-003',
    name: 'GitHub API Token',
    description: 'Bearer token for GitHub API access',
    credential_type_id: 'ctype-bearer',
    inputs: { token: '$encrypted$' },
    enabled: false,
    created_at: '2025-08-01T08:00:00Z',
    updated_at: '2025-08-05T16:45:00Z',
    created_by: 'user-002',
    labels: {},
    deleted_at: null,
    deleted_by: null,
    project_id: 'p-002',
  },
]
