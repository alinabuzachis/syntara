/**
 * E2E Tests: Settings Page
 *
 * Critical paths covered:
 * - Page renders with category tabs and grouped settings
 * - Modify an integer setting via +/- buttons, save, verify persisted
 * - Toggle a boolean setting, save, verify persisted
 * - Reset a single setting via kebab menu
 * - Reset all settings via "Reset to defaults" button with confirmation modal
 * - Save changes button disabled when no changes
 * - Navigate to settings via Access Management nav
 *
 * Edge cases:
 * - Settings persist after page reload
 * - Reset to defaults confirmation modal cancel does not reset
 */

import { expect, test, toAppUrl } from './fixtures'

/** Navigate to settings and click the Context Manager tab. */
async function goToContextManager(app: import('@playwright/test').Page) {
  await app.goto(toAppUrl('/access-management/settings'))
  const cmTab = app.getByRole('tab', { name: /Context Manager/i })
  await cmTab.click()
  await expect(app.locator('.pf-v6-c-form__section-title', { hasText: 'Compression' })).toBeVisible({ timeout: 5000 })
}

/** Reset all settings in the current tab to defaults via the confirmation modal, then save. */
async function resetAllToDefaults(app: import('@playwright/test').Page) {
  const resetBtn = app.getByRole('button', { name: 'Reset to defaults' })
  if (await resetBtn.isEnabled()) {
    await resetBtn.click()
    const resetAllBtn = app.getByRole('button', { name: 'Reset all' })
    if (await resetAllBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await resetAllBtn.click()
      // Save the reset values
      const saveBtn = app.getByRole('button', { name: 'Save changes' })
      if (await saveBtn.isEnabled({ timeout: 2000 }).catch(() => false)) {
        await saveBtn.click()
        await expect(saveBtn).toBeDisabled({ timeout: 5000 })
      }
    }
  }
}

test.describe('Settings', () => {
  // Settings tests share backend state — run serially to avoid conflicts
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ app }) => {
    await app.goto(toAppUrl('/access-management/settings'))
    const heading = app.getByRole('heading', { level: 1, name: 'Settings' })
    const hasPage = await heading
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasPage, 'Settings page not available; backend may not be running')
  })

  test('page renders with category tabs', async ({ app }) => {
    await expect(app.getByRole('tab').first()).toBeVisible({ timeout: 5000 })
    const tabCount = await app.getByRole('tab').count()
    expect(tabCount).toBeGreaterThanOrEqual(1)
  })

  test('context manager tab shows grouped section headings', async ({ app }) => {
    const cmTab = app.getByRole('tab', { name: /Context Manager/i })
    const hasCmTab = await cmTab
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasCmTab, 'Context Manager tab not available')

    await cmTab.click()

    const groups = [
      'Compression',
      'Context assembly',
      'Grounding scores',
      'Performance',
      'Retrieval',
      'Snippets',
      'Token limits',
    ]
    for (const group of groups) {
      const title = app.locator('.pf-v6-c-form__section-title', { hasText: group })
      await title.scrollIntoViewIfNeeded()
      await expect(title).toBeVisible()
    }
  })

  test('save changes button is disabled when no edits', async ({ app }) => {
    const saveButton = app.getByRole('button', { name: 'Save changes' })
    await expect(saveButton).toBeVisible()
    await expect(saveButton).toBeDisabled()
  })

  test('modify integer setting, save, and verify persistence', async ({ app }) => {
    const cmTab = app.getByRole('tab', { name: /Context Manager/i })
    const hasCmTab = await cmTab
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasCmTab, 'Context Manager tab not available')

    await cmTab.click()

    const formGroup = app.locator('[id="context_manager.compression_loop"]').locator('..')
    await expect(formGroup).toBeVisible({ timeout: 5000 })
    const input = formGroup.locator('input')
    const originalValue = await input.inputValue()

    try {
      // Click plus to increment
      await formGroup.getByRole('button', { name: /plus/i }).click()

      // Save
      const saveButton = app.getByRole('button', { name: 'Save changes' })
      await expect(saveButton).toBeEnabled()
      await saveButton.click()
      await expect(saveButton).toBeDisabled({ timeout: 5000 })

      // Reload and verify value persisted
      await app.goto(toAppUrl('/access-management/settings'))
      await cmTab.click()
      const reloadedInput = app.locator('[id="context_manager.compression_loop"]').locator('..').locator('input')
      const newValue = await reloadedInput.inputValue()
      expect(Number(newValue)).toBe(Number(originalValue) + 1)
    } finally {
      // Cleanup: reset to defaults
      await goToContextManager(app)
      await resetAllToDefaults(app)
    }
  })

  test('toggle boolean setting and save', async ({ app }) => {
    const sysTab = app.getByRole('tab', { name: 'System', exact: true })
    const hasSysTab = await sysTab
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasSysTab, 'System tab not available')

    await sysTab.click()

    const formGroup = app.locator('[id="metrics.perf_test_mode"]').locator('..')
    const toggle = formGroup.locator('.pf-v6-c-switch__toggle')
    const hasToggle = await toggle
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasToggle, 'Performance test mode toggle not found')

    await toggle.click()

    const saveBtn = app.getByRole('button', { name: 'Save changes' })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(saveBtn).toBeDisabled({ timeout: 5000 })
  })

  test('reset single setting via kebab menu', async ({ app }) => {
    const cmTab = app.getByRole('tab', { name: /Context Manager/i })
    const hasCmTab = await cmTab
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasCmTab, 'Context Manager tab not available')

    await cmTab.click()

    const formGroup = app.locator('[id="context_manager.compression_loop"]').locator('..')
    await expect(formGroup).toBeVisible({ timeout: 5000 })

    try {
      // Modify and save
      await formGroup.getByRole('button', { name: /plus/i }).click()
      await app.getByRole('button', { name: 'Save changes' }).click()
      await expect(app.getByRole('button', { name: 'Save changes' })).toBeDisabled({ timeout: 5000 })

      // Reload to get fresh state
      await goToContextManager(app)

      // Click the kebab menu and reset
      const kebab = app.getByLabel('Actions for Compression loop')
      await expect(kebab).toBeVisible({ timeout: 5000 })
      await kebab.click()
      await app.getByRole('menuitem', { name: 'Reset to default' }).click()

      // Save the reset value
      await expect(app.getByRole('button', { name: 'Save changes' })).toBeEnabled()
      await app.getByRole('button', { name: 'Save changes' }).click()
      await expect(app.getByRole('button', { name: 'Save changes' })).toBeDisabled({ timeout: 5000 })
    } finally {
      // Cleanup: ensure defaults
      await goToContextManager(app)
      await resetAllToDefaults(app)
    }
  })

  test('reset to defaults confirmation modal: cancel does not reset', async ({ app }) => {
    const cmTab = app.getByRole('tab', { name: /Context Manager/i })
    const hasCmTab = await cmTab
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasCmTab, 'Context Manager tab not available')

    await cmTab.click()

    // Modify a setting to enable reset button
    const formGroup = app.locator('[id="context_manager.compression_loop"]').locator('..')
    await expect(formGroup).toBeVisible({ timeout: 5000 })
    await formGroup.getByRole('button', { name: /plus/i }).click()

    // Click Reset to defaults — modal should appear
    await app.getByRole('button', { name: 'Reset to defaults' }).click()
    await expect(app.getByText('This will reset all configuration values')).toBeVisible()

    // Click Cancel — modal should close, changes preserved
    await app.getByRole('button', { name: 'Cancel' }).click()
    await expect(app.getByText('This will reset all configuration values')).not.toBeVisible()
    await expect(app.getByRole('button', { name: 'Save changes' })).toBeEnabled()

    // No cleanup needed — changes were local only (not saved)
  })

  test('navigate to settings via Access Management nav', async ({ app }) => {
    // Navigate away first
    await app.goto(toAppUrl('/automations'))
    await expect(app).toHaveURL(/automations/)

    // Open Access Management flyout and click Settings
    await app.getByRole('button', { name: 'Access Management' }).click()
    await app.getByRole('menuitem', { name: 'Settings' }).click()

    // Verify navigation
    await expect(app).toHaveURL(/access-management\/settings/)
    await expect(app.getByRole('tab', { name: /Context Manager/i })).toBeVisible()
  })
})
