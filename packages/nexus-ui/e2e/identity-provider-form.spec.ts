/**
 * E2E Tests: Identity Provider Form — Provider Template Dropdown
 *
 * Critical paths covered:
 * - Navigating to the Add Identity Provider form
 * - Opening the provider template dropdown
 * - Verifying that known providers (AAP) show an icon
 * - Verifying that the "Custom" option renders NO icon
 *
 * Edge cases:
 * - No resources are created; this is a pure read/navigation test requiring no cleanup
 */
import { test, expect, toAppUrl } from './fixtures'

const ADD_IDP_URL = '/system-administration/authentication/identity-providers/add'

test.describe('Identity Provider Form — Provider Template dropdown', () => {
  test.beforeEach(async ({ app }) => {
    await app.goto(toAppUrl(ADD_IDP_URL))
    await expect(app.getByRole('heading', { name: 'Provider configuration' })).toBeVisible()
  })

  test('provider template dropdown opens and shows all options', async ({ app }) => {
    const toggle = app.getByRole('button', { name: /Select a provider template/i })
    await toggle.click()

    const listbox = app.getByRole('listbox')
    await expect(listbox).toBeVisible()
    await expect(listbox.getByRole('option', { name: /Ansible Automation Platform/i })).toBeVisible()
    await expect(listbox.getByRole('option', { name: /Custom/i })).toBeVisible()
  })

  test('Custom option in provider template dropdown has no icon', async ({ app }) => {
    const toggle = app.getByRole('button', { name: /Select a provider template/i })
    await toggle.click()

    const listbox = app.getByRole('listbox')
    await expect(listbox).toBeVisible()

    const customOption = listbox.getByRole('option', { name: /^Custom$/i })
    await expect(customOption).toBeVisible()

    // The Ansible icon is an SVG rendered for non-custom types; it must not appear in the Custom option
    await expect(customOption.locator('svg')).toHaveCount(0)
  })

  test('Ansible Automation Platform option in provider template dropdown has an icon', async ({ app }) => {
    const toggle = app.getByRole('button', { name: /Select a provider template/i })
    await toggle.click()

    const listbox = app.getByRole('listbox')
    await expect(listbox).toBeVisible()

    const aapOption = listbox.getByRole('option', { name: /Ansible Automation Platform/i })
    await expect(aapOption).toBeVisible()

    // AAP option should have exactly one SVG icon
    await expect(aapOption.locator('svg')).toHaveCount(1)
  })
})
