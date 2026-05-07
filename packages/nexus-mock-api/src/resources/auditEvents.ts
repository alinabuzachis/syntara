export interface AuditEventMock {
  id: string
  created_at: string
  updated_at: string
  labels: Record<string, string>
  event_category: string
  event_severity: 'info' | 'warning' | 'error' | 'critical'
  event_status: 'success' | 'error' | null
  event_action: string
  actor_id: string | null
  actor_type: 'user' | 'system' | 'service' | null
  actor_username: string | null
  source_component: string
  resource_urn: string | null
  resource_name: string | null
  workflow_id: string | null
  activity_id: string | null
  execution_id: string | null
  event_message: string
  structured_data: {
    data_type: 'base' | 'function' | 'context' | 'request_completed'
    error_type?: string | null
    error_message?: string | null
    [key: string]: unknown
  }
}

const now = Date.now()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function ts(offset: number): string {
  return new Date(now - offset).toISOString()
}

export const auditEvents: AuditEventMock[] = [
  {
    id: 'ae-001',
    created_at: ts(1 * HOUR),
    updated_at: ts(1 * HOUR),
    labels: {},
    event_category: 'security_event',
    event_action: 'OIDC Login',
    event_severity: 'info',
    event_status: 'success',
    actor_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    actor_type: 'user',
    actor_username: 'jsmith',
    source_component: 'auth_service',
    resource_urn: null,
    resource_name: null,
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'User authenticated via OIDC provider Keycloak',
    structured_data: {
      data_type: 'context',
      provider: 'Keycloak',
      ip_address: '192.168.1.100',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/122.0.0.0',
    },
  },
  {
    id: 'ae-002',
    created_at: ts(2 * HOUR),
    updated_at: ts(2 * HOUR),
    labels: {},
    event_category: 'security_event',
    event_action: 'OIDC Login',
    event_severity: 'warning',
    event_status: 'error',
    actor_id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    actor_type: 'user',
    actor_username: 'mjones',
    source_component: 'auth_service',
    resource_urn: null,
    resource_name: null,
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'Failed OIDC login attempt — invalid credentials',
    structured_data: {
      data_type: 'context',
      error_type: 'AuthenticationError',
      error_message: 'Invalid credentials',
      provider: 'Keycloak',
      ip_address: '10.0.0.55',
      attempt_number: 3,
    },
  },
  {
    id: 'ae-003',
    created_at: ts(3 * HOUR),
    updated_at: ts(3 * HOUR),
    labels: {},
    event_category: 'security_event',
    event_action: 'Local User Login',
    event_severity: 'info',
    event_status: 'success',
    actor_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    actor_type: 'user',
    actor_username: 'alee',
    source_component: 'auth_service',
    resource_urn: null,
    resource_name: null,
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'User authenticated via local credentials',
    structured_data: {
      data_type: 'context',
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/17.3',
    },
  },
  {
    id: 'ae-004',
    created_at: ts(5 * HOUR),
    updated_at: ts(5 * HOUR),
    labels: {},
    event_category: 'api_execution',
    event_action: 'Request Completed',
    event_severity: 'info',
    event_status: 'success',
    actor_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    actor_type: 'user',
    actor_username: 'jsmith',
    source_component: 'audit_middleware',
    resource_urn: null,
    resource_name: null,
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'GET /api/v1/workflows completed with 200',
    structured_data: {
      data_type: 'request_completed',
      method: 'GET',
      path: '/api/v1/workflows',
      status_code: 200,
      query_params: { limit: 20, include_total: true },
      user_role: 'admin',
    },
  },
  {
    id: 'ae-005',
    created_at: ts(8 * HOUR),
    updated_at: ts(8 * HOUR),
    labels: {},
    event_category: 'security_event',
    event_action: 'OIDC Login',
    event_severity: 'critical',
    event_status: 'error',
    actor_id: null,
    actor_type: null,
    actor_username: null,
    source_component: 'auth_service',
    resource_urn: null,
    resource_name: null,
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'Failed OIDC login — account locked after repeated failures',
    structured_data: {
      data_type: 'context',
      error_type: 'AccountLockedError',
      error_message: 'Account locked after repeated failures',
      provider: 'Keycloak',
      ip_address: '203.0.113.77',
      attempt_number: 5,
    },
  },
  {
    id: 'ae-006',
    created_at: ts(1 * DAY),
    updated_at: ts(1 * DAY),
    labels: {},
    event_category: 'user_action',
    event_action: 'Workflow Created',
    event_severity: 'info',
    event_status: 'success',
    actor_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    actor_type: 'user',
    actor_username: 'jsmith',
    source_component: 'workflow_service',
    resource_urn: 'urn:nexus:workflow:id=2',
    resource_name: 'hello-world',
    workflow_id: '2',
    activity_id: null,
    execution_id: null,
    event_message: 'Workflow "hello-world" created',
    structured_data: {
      data_type: 'function',
      function_args: { name: 'hello-world', description: 'A simple workflow' },
      function_result: { id: '2' },
    },
  },
  {
    id: 'ae-007',
    created_at: ts(2 * DAY),
    updated_at: ts(2 * DAY),
    labels: {},
    event_category: 'workflow_event',
    event_action: 'Workflow Execution',
    event_severity: 'info',
    event_status: 'success',
    actor_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    actor_type: 'system',
    actor_username: null,
    source_component: 'workflow_engine',
    resource_urn: 'urn:nexus:execution:id=exec-1',
    resource_name: 'exec-1',
    workflow_id: '2',
    activity_id: null,
    execution_id: 'exec-1',
    event_message: 'Workflow "hello-world" execution completed successfully',
    structured_data: {
      data_type: 'context',
      execution_duration_ms: 4200,
    },
  },
  {
    id: 'ae-008',
    created_at: ts(3 * DAY),
    updated_at: ts(3 * DAY),
    labels: {},
    event_category: 'user_action',
    event_action: 'Create Project',
    event_severity: 'info',
    event_status: 'success',
    actor_id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
    actor_type: 'user',
    actor_username: 'alice',
    source_component: 'access_management',
    resource_urn: 'urn:nexus:project:id=p-002',
    resource_name: 'alice-sandbox',
    workflow_id: null,
    activity_id: null,
    execution_id: null,
    event_message: 'Project "alice-sandbox" created',
    structured_data: {
      data_type: 'context',
    },
  },
]
