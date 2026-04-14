import type { Page } from '@playwright/test'

import { test, expect } from './fixtures'
import { deleteCredentialByName, goToCredentialsList } from './helpers/credentials'
import { buildUniqueName } from './helpers/workflows'

async function openCreateModal(app: Page) {
  await goToCredentialsList(app)
  await app.getByRole('button', { name: 'Create credential' }).click()
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

    await modal.getByRole('button', { name: 'Create credential' }).click()

    // Scope to the Name field's FormGroup to avoid matching "Username is required"
    await expect(
      modal
        .getByRole('textbox', { name: 'Credential name' })
        .locator('xpath=ancestor::div[contains(@class,"form__group")]')
        .getByText('Name is required')
    ).toBeVisible()
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

    await modal.getByRole('button', { name: 'Create credential' }).click()

    // Scope to the Name field's FormGroup to avoid matching "Username is required"
    await expect(
      modal
        .getByRole('textbox', { name: 'Credential name' })
        .locator('xpath=ancestor::div[contains(@class,"form__group")]')
        .getByText('Name is required')
    ).toBeVisible()
    await expect(modal.getByText('Username is required')).toBeVisible()
    await expect(modal.getByText('Password is required')).toBeVisible()
  })

  // --- SSH Key (Non-Protected) (2 fields: username, ssh_private_key as multiline textarea) ---

  test('SSH Key: form renders correct fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'SSH Key (Non-Protected)' })

    await expect(modal.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await expect(modal.getByRole('textbox', { name: 'SSH Private Key' })).toBeVisible()
  })

  test('SSH Key: create credential succeeds', async ({ app }) => {
    const modal = await openCreateModal(app)
    const name = buildUniqueName('e2e-ssh')

    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'SSH Key (Non-Protected)' })
    await modal.getByRole('textbox', { name: 'Username' }).fill('deploy')
    await modal
      .getByRole('textbox', { name: 'SSH Private Key' })
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
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'SSH Key (Non-Protected)' })

    await modal.getByRole('button', { name: 'Create credential' }).click()

    // Scope to the Name field's FormGroup to avoid matching "Username is required"
    await expect(
      modal
        .getByRole('textbox', { name: 'Credential name' })
        .locator('xpath=ancestor::div[contains(@class,"form__group")]')
        .getByText('Name is required')
    ).toBeVisible()
    await expect(modal.getByText('Username is required')).toBeVisible()
    await expect(modal.getByText('SSH Private Key is required')).toBeVisible()
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

    await modal.getByRole('button', { name: 'Create credential' }).click()

    // Scope to the Name field's FormGroup to avoid matching "Username is required"
    await expect(
      modal
        .getByRole('textbox', { name: 'Credential name' })
        .locator('xpath=ancestor::div[contains(@class,"form__group")]')
        .getByText('Name is required')
    ).toBeVisible()
    await expect(modal.getByText('API Key is required')).toBeVisible()
  })

  // --- AAP API Credentials (5 fields: host, username, password, oauth_token, verify_ssl boolean) ---

  test('AAP API Credentials: form renders correct fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'AAP API Credentials' })

    // Scope to the form to avoid matching the dialog's own aria-label
    const form = modal.locator('form')
    await expect(form.getByRole('textbox', { name: 'AAP Host' })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Username' })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'Password' })).toBeVisible()
    await expect(form.getByRole('textbox', { name: 'OAuth Token' })).toBeVisible()
    await expect(modal.getByText('Verify SSL', { exact: true })).toBeVisible()
  })

  test('AAP API Credentials: create credential succeeds', async ({ app }) => {
    const modal = await openCreateModal(app)
    const name = buildUniqueName('e2e-aap')

    await modal.getByRole('textbox', { name: 'Credential name' }).fill(name)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'AAP API Credentials' })
    await modal.getByRole('textbox', { name: 'AAP Host' }).fill('https://controller.example.com')
    await modal.getByRole('textbox', { name: 'OAuth Token' }).fill('test-oauth-token')
    await modal.getByRole('button', { name: 'Create credential' }).click()

    try {
      await expect(app.getByText('Credential created')).toBeVisible()
    } finally {
      await deleteCredentialByName(app, name)
    }
  })

  test('AAP API Credentials: validation shows errors for required fields', async ({ app }) => {
    const modal = await openCreateModal(app)
    await modal.getByRole('combobox', { name: 'Credential type' }).selectOption({ label: 'AAP API Credentials' })

    await modal.getByRole('button', { name: 'Create credential' }).click()

    // Scope to the Name field's FormGroup to avoid matching "Username is required"
    await expect(
      modal
        .getByRole('textbox', { name: 'Credential name' })
        .locator('xpath=ancestor::div[contains(@class,"form__group")]')
        .getByText('Name is required')
    ).toBeVisible()
    await expect(modal.getByText('AAP Host is required')).toBeVisible()
  })
})
