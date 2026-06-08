/**
 * Test UI-18: Audit Log — Authentication Events Display
 *
 * Critical paths covered:
 * - Authentication events are listed with timestamps, user identity, and status
 * - Event details include source IP and (for OIDC logins) IdP name
 * - Events are sorted chronologically by default (most recent first)
 *
 * Uses Playwright route interception to mock API responses.
 * Read-only tests — no cleanup required.
 */
import { test, expect, toAppUrl } from './fixtures'
import { mockAuthAuditEvents } from './utils/mockData'

const AUDIT_LOG_URL = '/system-administration/audit-log'

test.describe('Audit Log — Authentication Events Display (UI-18)', () => {
  test.beforeEach(async ({ app }) => {
    await app.route('**/api/v1/audit**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAuthAuditEvents),
      })
    )
    await app.goto(toAppUrl(AUDIT_LOG_URL))
    await expect(app.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
  })

  test('authentication events display with timestamp, user, and status', async ({ app }) => {
    const table = app.getByRole('grid', { name: 'Audit log table' })
    await expect(table).toBeVisible()

    const dataRows = table.locator('tbody tr').filter({ hasNot: app.locator('td[colspan]') })
    await expect(dataRows).toHaveCount(3)

    // All rows show "Security Event" in the Event column
    for (let i = 0; i < 3; i++) {
      await expect(dataRows.nth(i).getByText('Security Event')).toBeVisible()
      await expect(dataRows.nth(i).getByText('User', { exact: true })).toBeVisible()
    }

    // Row 1: jsmith — successful OIDC login
    await expect(dataRows.nth(0).getByText('jsmith')).toBeVisible()
    await expect(dataRows.nth(0).getByText('Success')).toBeVisible()

    // Row 2: mjones — failed OIDC login
    await expect(dataRows.nth(1).getByText('mjones')).toBeVisible()
    await expect(dataRows.nth(1).getByText('Error')).toBeVisible()

    // Row 3: alee — successful local login
    await expect(dataRows.nth(2).getByText('alee')).toBeVisible()
    await expect(dataRows.nth(2).getByText('Success')).toBeVisible()
  })

  test('OIDC login event details include source IP and IdP name', async ({ app }) => {
    const table = app.getByRole('grid', { name: 'Audit log table' })

    // Expand the jsmith row (successful OIDC login)
    const jsmithRow = table
      .locator('tbody tr')
      .filter({ hasText: 'jsmith' })
      .filter({ hasNot: app.locator('td[colspan]') })
    await jsmithRow.getByRole('button', { name: /details/i }).click()

    // Verify expanded content shows IP address
    const expandedContent = jsmithRow.locator('+ tr td[colspan]')
    await expect(expandedContent.getByText('Ip Address')).toBeVisible()
    await expect(expandedContent.getByText('192.168.1.100')).toBeVisible()

    // Verify expanded content shows IdP provider name
    await expect(expandedContent.getByText('Provider', { exact: true })).toBeVisible()
    await expect(expandedContent.getByText('Keycloak', { exact: true })).toBeVisible()

    // Verify event message is shown
    await expect(expandedContent.getByText('Event Message')).toBeVisible()
    await expect(expandedContent.getByText(/OIDC provider Keycloak/)).toBeVisible()
  })

  test('events are sorted chronologically by default', async ({ app }) => {
    // Default sort is by Timestamp descending (most recent first)
    const timestampHeader = app.getByRole('columnheader', { name: /Timestamp/i })
    await expect(timestampHeader).toHaveAttribute('aria-sort', 'descending')

    // Verify row order: jsmith (1h ago) → mjones (2h ago) → alee (3h ago)
    const table = app.getByRole('grid', { name: 'Audit log table' })
    const dataRows = table.locator('tbody tr').filter({ hasNot: app.locator('td[colspan]') })

    await expect(dataRows.nth(0).getByText('jsmith')).toBeVisible()
    await expect(dataRows.nth(1).getByText('mjones')).toBeVisible()
    await expect(dataRows.nth(2).getByText('alee')).toBeVisible()
  })
})
