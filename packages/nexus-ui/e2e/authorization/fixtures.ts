/**
 * Authorization test fixtures.
 *
 * Creates real users with real roles and policies via the API so that
 * the backend's can_i endpoint drives UI visibility decisions.
 */
import { type Page } from '@playwright/test'

import { expect, appBaseUrl, toAppUrl } from '../fixtures'
import {
  createUserViaApi,
  deleteUserViaApi,
  createPolicyViaApi,
  deletePolicyViaApi,
  createRoleViaApi,
  deleteRoleViaApi,
  createRoleAssignmentViaApi,
  deleteRoleAssignmentViaApi,
} from '../utils/api'

// ---------------------------------------------------------------------------
// Persona lifecycle
// ---------------------------------------------------------------------------

const E2E_TEST_PASSWORD = 'E2eTestP@ssw0rd!'

export type Persona = {
  userId: string
  username: string
  password: string
  policyId: string | null
  roleId: string | null
  assignmentId: string | null
}

/**
 * Create a test user with a custom role granting the specified permissions.
 * Uses the admin-authenticated API to:
 *   1. Create a policy with the given actions
 *   2. Create a role referencing that policy
 *   3. Create a user
 *   4. Assign the role to the user
 *
 * Returns a Persona for login and cleanup.
 */
export async function createPersona(app: Page, name: string, actions: string[]): Promise<Persona> {
  const policy = await createPolicyViaApi(app, {
    name: `${name}-policy`,
    actions,
  })
  if (!policy) throw new Error(`Failed to create policy for persona "${name}"`)

  const role = await createRoleViaApi(app, {
    name: `${name}-role`,
    policies: [policy.name],
  })
  if (!role) throw new Error(`Failed to create role for persona "${name}"`)

  const user = await createUserViaApi(app, {
    username: name,
    password: E2E_TEST_PASSWORD,
  })
  if (!user) throw new Error(`Failed to create user for persona "${name}"`)

  const assignment = await createRoleAssignmentViaApi(app, {
    principal_type: 'user',
    principal_id: user.id,
    role_name: role.name,
  })
  if (!assignment) throw new Error(`Failed to assign role for persona "${name}"`)

  return {
    userId: user.id,
    username: user.username,
    password: E2E_TEST_PASSWORD,
    policyId: policy.id,
    roleId: role.id,
    assignmentId: assignment.id,
  }
}

/**
 * Create a test user with the builtin admin role (no custom policy needed).
 */
export async function createAdminPersona(app: Page, name: string): Promise<Persona> {
  const user = await createUserViaApi(app, {
    username: name,
    password: E2E_TEST_PASSWORD,
  })
  if (!user) throw new Error(`Failed to create admin user "${name}"`)

  const assignment = await createRoleAssignmentViaApi(app, {
    principal_type: 'user',
    principal_id: user.id,
    role_name: 'admin',
  })
  if (!assignment) throw new Error(`Failed to assign admin role for "${name}"`)

  return {
    userId: user.id,
    username: user.username,
    password: E2E_TEST_PASSWORD,
    policyId: null,
    roleId: null,
    assignmentId: assignment.id,
  }
}

/**
 * Clean up a persona — deletes assignment, role, policy, user in reverse order.
 * Best-effort: swallows errors so cleanup doesn't mask test failures.
 */
export async function cleanupPersona(app: Page, persona: Persona): Promise<void> {
  if (persona.assignmentId) await deleteRoleAssignmentViaApi(app, persona.assignmentId)
  if (persona.roleId) await deleteRoleViaApi(app, persona.roleId)
  if (persona.policyId) await deletePolicyViaApi(app, persona.policyId)
  await deleteUserViaApi(app, persona.userId)
}

/**
 * Log in as a specific user via the UI login form.
 */
export async function loginAsUser(page: Page, persona: Pick<Persona, 'username' | 'password'>): Promise<void> {
  await page.goto(appBaseUrl)

  const loginHeading = page.getByRole('heading', { name: 'Log in to Automation Orchestrator' })
  const mainNav = page.getByRole('navigation', { name: 'Main navigation' })
  await loginHeading.or(mainNav).waitFor({ timeout: 15_000 })

  if (await loginHeading.isVisible()) {
    const password = persona.password
    const localAccountToggle = page.getByRole('button', { name: 'Sign in using local account' })
    if (await localAccountToggle.isVisible()) await localAccountToggle.click()

    await page.getByLabel('Username').fill(persona.username)
    await page.getByRole('textbox', { name: 'Password' }).fill(password)
    await page.getByRole('button', { name: /^Log in/i }).click()
  }

  await expect(mainNav).toBeVisible({ timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Common permission action sets for personas
// ---------------------------------------------------------------------------

export const PERSONA_ACTIONS = {
  credentialsManager: [
    'credential:create',
    'credential:read',
    'credential:update',
    'credential:delete',
    'project:read',
  ],

  workflowManager: ['workflow:create', 'workflow:read', 'workflow:update', 'workflow:delete', 'project:read'],

  executionOperator: ['workflow:read', 'execution:run', 'execution:read', 'project:read'],

  approvalOperator: ['approval:read', 'approval:decide', 'project:read'],

  projectManager: ['project:create', 'project:read'],

  roleAssignmentManager: [
    'role-assignment:assign',
    'role-assignment:read',
    'role-assignment:revoke',
    'role:read',
    'project:read',
  ],

  userManager: ['user:create', 'user:read', 'user:update'],

  projectReader: ['workflow:read', 'credential:read', 'execution:read', 'project:read'],

  projectWriter: [
    'workflow:read',
    'workflow:create',
    'workflow:update',
    'credential:read',
    'execution:read',
    'project:read',
  ],
}

export { expect, toAppUrl }
