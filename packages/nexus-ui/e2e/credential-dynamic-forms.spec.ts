import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { deleteCredentialByName, goToCredentialsList } from './helpers/credentials'
import { buildUniqueName } from './helpers/workflows'

async function openCreateModal(app: Page) {
  await goToCredentialsList(app, { ensureCreateEnabled: true })
  // Use .first() because on an empty list the button appears in both the toolbar and the empty state
  await app.getByRole('button', { name: 'Create credential' }).first().click()
  const modal = app.getByRole('dialog')
  await expect(modal).toBeVisible()
  return modal
}

test.describe('Dynamic Credential Form Rendering', () => {
  // --- HTTP Bearer Token (1 field: token) ---

  test('HTTP Bearer Token: form renders correct fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })

    await expect(modal.getByRole('textbox', { name: 'Token' })).toBeVisible()
    await expect(modal.getByRole('button', { name: /Show secret|Hide secret/ })).toBeVisible()
  })

  test('HTTP Bearer Token: create credential succeeds', async ({ app }) => {
    const modal = await openCreateModal(app)
    const name = buildUniqueName('e2e-bearer')

    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })
    await modal.getByRole('textbox', { name: 'Token' }).fill('test-bearer-token-value')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    try {
      await expect(app.getByText('Credential created')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('HTTP Bearer Token: validation shows errors for required fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Bearer Token' })

    // Fill name so Zod validation passes and dynamic field validation runs
    await modal.getByRole('textbox', { name: 'Credential name' }).fill('validation-test')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    await expect(modal.getByText('Token is required')).toBeVisible()
  })

  // --- HTTP Basic Auth (2 fields: username, password) ---

  test('HTTP Basic Auth: form renders correct fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Basic Auth' })

    await expect(modal.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await expect(modal.getByRole('textbox', { name: 'Password' })).toBeVisible()
  })

  test('HTTP Basic Auth: create credential succeeds', async ({ app }) => {
    const modal = await openCreateModal(app)
    const name = buildUniqueName('e2e-basic')

    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Basic Auth' })
    await modal.getByRole('textbox', { name: 'Username' }).fill('testuser')
    await modal.getByRole('textbox', { name: 'Password' }).fill('testpass123')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    try {
      await expect(app.getByText('Credential created')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('HTTP Basic Auth: validation shows errors for required fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'HTTP Basic Auth' })

    // Fill name so Zod validation passes and dynamic field validation runs
    await modal.getByRole('textbox', { name: 'Credential name' }).fill('validation-test')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    await expect(modal.getByText('Username is required')).toBeVisible()
    await expect(modal.getByText('Password is required')).toBeVisible()
  })

  // --- SSH Key (2 fields: username, ssh_private_key as multiline textarea) ---

  test('SSH Key: form renders correct fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'SSH Key' })

    await expect(modal.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await expect(modal.getByRole('textbox', { name: 'Private key' })).toBeVisible()
  })

  test('SSH Key: create credential succeeds', async ({ app }) => {
    const modal = await openCreateModal(app)
    const name = buildUniqueName('e2e-ssh')

    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'SSH Key' })
    await modal.getByRole('textbox', { name: 'Username' }).fill('deploy')
    await modal
      .getByRole('textbox', { name: 'Private key' })
      .fill('-----BEGIN OPENSSH PRIVATE KEY-----\ntest-key-content\n-----END OPENSSH PRIVATE KEY-----')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    try {
      await expect(app.getByText('Credential created')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('SSH Key: validation shows errors for required fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'SSH Key' })

    // Fill name so Zod validation passes and dynamic field validation runs
    await modal.getByRole('textbox', { name: 'Credential name' }).fill('validation-test')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    await expect(modal.getByText('Username is required')).toBeVisible()
    await expect(modal.getByText('Private key is required')).toBeVisible()
  })

  // --- LLM Provider (3 fields: provider choices dropdown, api_key secret, base_url) ---

  test('LLM Provider: form renders correct fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'LLM Provider' })

    await expect(modal.getByRole('combobox', { name: 'Provider' })).toBeVisible()
    await expect(modal.getByRole('textbox', { name: 'API Key' })).toBeVisible()
    await expect(modal.getByRole('textbox', { name: 'Base URL' })).toBeVisible()
  })

  test('LLM Provider: create credential succeeds', async ({ app }) => {
    const modal = await openCreateModal(app)
    const name = buildUniqueName('e2e-llm')

    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'LLM Provider' })
    await modal.getByRole('combobox', { name: 'Provider' }).selectOption('anthropic')
    await modal.getByRole('textbox', { name: 'API Key' }).fill('sk-ant-test-key-123')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    try {
      await expect(app.getByText('Credential created')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('LLM Provider: validation shows errors for required fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'LLM Provider' })

    // Fill name so Zod validation passes and dynamic field validation runs
    await modal.getByRole('textbox', { name: 'Credential name' }).fill('validation-test')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    await expect(modal.getByText('API Key is required')).toBeVisible()
  })

  // --- Ansible Automation Platform (5 fields: host, username, password, oauth_token, verify_ssl boolean) ---

  test('Ansible Automation Platform: form renders correct fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal
      .getByRole('combobox', { name: 'Credential type' })
      .selectOption({ label: 'Ansible Automation Platform' })

    // Scope to the form to avoid matching the dialog's own aria-label
    const form = modal.locator('form')
    await expect(form.getByRole('textbox', { name: 'AAP Host' })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Password' })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'OAuth Token' })).toBeVisible()
    await expect(modal.getByText('Verify SSL', { exact: true })).toBeVisible()
  })

  test('Ansible Automation Platform: create credential succeeds', async ({ app }) => {
    const modal = await openCreateModal(app)
    const name = buildUniqueName('e2e-aap')

    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal
      .getByRole('combobox', { name: 'Credential type' })
      .selectOption({ label: 'Ansible Automation Platform' })
    await modal.getByRole('textbox', { name: 'AAP Host' }).fill('https://controller.example.com')
    await modal.getByRole('textbox', { name: 'OAuth Token' }).fill('test-oauth-token')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    try {
      await expect(app.getByText('Credential created')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('Ansible Automation Platform: validation shows errors for required fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal
      .getByRole('combobox', { name: 'Credential type' })
      .selectOption({ label: 'Ansible Automation Platform' })

    // Fill name so Zod validation passes and dynamic field validation runs
    await modal.getByRole('textbox', { name: 'Credential name' }).fill('validation-test')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    await expect(modal.getByText('AAP Host is required')).toBeVisible()
  })
})
