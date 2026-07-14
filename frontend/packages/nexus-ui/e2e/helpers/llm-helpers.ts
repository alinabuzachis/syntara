/**
 * Helper functions for LLM model and credential selection in E2E tests.
 *
 * Covers the LLM model picker UX: selecting a model from the grouped
 * integration dropdown, then configuring a credential via "Set up connection".
 *
 * The model dropdown requires an enabled `llm_provider` integration with
 * discovered models. Use `createLlmIntegration()` before `selectLlmCredential()`.
 */

import { type Page } from '@playwright/test'

import { expect } from '../fixtures'
import { apiRequest, ensureProject } from '../utils/api'

/**
 * Ensure an LLM Provider credential exists via the API.
 * Returns the credential name for selection in the UI dropdown.
 */
export async function ensureLlmCredential(page: Page): Promise<string> {
  const project = await ensureProject(page)
  if (!project) throw new Error('Could not ensure project for credential creation')

  const credName = 'e2e-llm-provider'

  // Check if it already exists
  const listResp = await apiRequest(page, 'get', `/credentials?name=${encodeURIComponent(credName)}`)
  if (listResp.ok()) {
    const body = (await listResp.json()) as { resources?: Array<{ id: string; name: string }> }
    if (body.resources?.length) return credName
  }

  // Find LLM Provider credential type
  const typesResp = await apiRequest(page, 'get', '/credential_types')
  if (!typesResp.ok()) throw new Error('Could not list credential types')
  const types = (await typesResp.json()) as { resources?: Array<{ id: string; name: string }> }
  const llmType = types.resources?.find((t) => t.name === 'LLM Provider')
  if (!llmType) throw new Error('LLM Provider credential type not found')

  // Create the credential
  const createResp = await apiRequest(page, 'post', '/credentials', {
    data: {
      name: credName,
      credential_type_id: llmType.id,
      project_id: project.id,
      inputs: { provider: 'anthropic', api_key: 'sk-ant-e2e-test-key' },
    },
  })
  if (!createResp.ok()) throw new Error('Could not create LLM credential')
  return credName
}

export type SeededLlmIntegration = { id: string; name: string }

/**
 * Create an llm_provider integration with a discovered model.
 * The model dropdown in LLMModelSelector requires at least one enabled
 * llm_provider integration with models — without it, all options are disabled.
 *
 * Always creates a new integration (caller provides a unique name).
 * Returns the integration id/name for cleanup in `finally`.
 */
export async function createLlmIntegration(page: Page, name: string): Promise<SeededLlmIntegration> {
  const createResp = await apiRequest(page, 'post', '/integrations', {
    data: {
      name,
      integration_type: 'llm_provider',
      configuration: {
        integration_type: 'llm_provider',
        provider_hint: 'anthropic',
      },
      scope: 'global',
      discovered_models: [
        {
          model_id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          enabled: true,
        },
      ],
    },
  })
  if (!createResp.ok()) {
    const text = await createResp.text()
    throw new Error(`Could not create LLM integration: ${createResp.status()} ${text}`)
  }
  const integration = (await createResp.json()) as { id: string; name: string }
  return { id: integration.id, name: integration.name }
}

/**
 * Delete an LLM integration by ID. Best-effort — ignores errors.
 */
export async function deleteLlmIntegration(page: Page, integrationId: string): Promise<void> {
  if (page.isClosed()) return
  try {
    await apiRequest(page, 'delete', `/integrations/${integrationId}`)
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Select an LLM model and credential in the Task Agent form.
 *
 * Uses the model picker UX: select model from grouped dropdown,
 * then "Set up connection" to open the credential picker.
 */
export async function selectLlmCredential(page: Page, credName: string) {
  // 1. Open the Model dropdown and pick the first available model
  const modelToggle = page.getByRole('button', { name: 'Model', exact: true })
  await expect(modelToggle).toBeEnabled({ timeout: 10_000 })
  await modelToggle.click()

  // Wait for model options to load and pick the first real option
  const modelOption = page
    .getByRole('option')
    .filter({ hasNot: page.locator('[aria-disabled="true"]') })
    .first()
  await expect(modelOption).toBeVisible({ timeout: 15_000 })
  await modelOption.click()

  // 2. Open the credential section via "Set up connection"
  const setupBtn = page.getByRole('button', { name: 'Set up connection' })
  await expect(setupBtn).toBeVisible({ timeout: 5_000 })
  await setupBtn.click()

  // 3. Select the credential from the dropdown
  const credDropdown = page.getByRole('button', { name: 'Select a credential' })
  await expect(credDropdown).toBeVisible({ timeout: 5_000 })
  await credDropdown.click()

  const credOption = page.getByRole('option', { name: credName })
  await expect(credOption).toBeVisible({ timeout: 10_000 })
  await credOption.click()
}
