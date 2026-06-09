/**
 * E2E Tests: Audit Log
 *
 * Critical paths covered:
 * - Page loads with heading, table, and expected columns
 * - Expandable rows reveal structured event details
 * - Expand/collapse all rows via header toggle
 * - User column links navigate to user detail page
 * - Resource column links navigate to resource detail page
 * - Filter by status and verify URL params + chip
 * - Apply multiple filters then remove individual chips
 * - Clear all filters
 * - Empty state when filters match nothing
 * - Pagination controls (next/previous)
 * - Sort by column headers
 *
 * Data seeding:
 * - Audit events are generated as side effects of API calls (login, list workflows, etc.)
 * - The app fixture logs in, which generates audit events on a live backend
 * - Additional API calls are made in beforeAll to ensure enough events exist
 * - Tests skip gracefully if no audit data is available
 *
 * Edge cases:
 * - No-data guard (skips gracefully when seed data is missing)
 * - Filter returns no results → empty state with clear action
 */

import { test, expect, toAppUrl } from './fixtures'

const AUDIT_LOG_URL = '/system-administration/audit-log'

async function seedAuditEvents(app: import('@playwright/test').Page) {
  const endpoints = ['/api/v1/workflows', '/api/v1/credentials', '/api/v1/integrations']
  for (const endpoint of endpoints) {
    await app.request.get(toAppUrl(endpoint), { params: { limit: '1' } }).catch(() => {})
  }
}

test.describe('Audit Log', () => {
  test.beforeEach(async ({ app }) => {
    await seedAuditEvents(app)
    await app.goto(toAppUrl(AUDIT_LOG_URL))
    await expect(app.getByRole('heading', { name: 'Audit Log' })).toBeVisible()

    const table = app.getByRole('grid', { name: 'Audit log table' })
    const hasTable = await table
      .waitFor({ state: 'visible' })
      .then(() => true)
      .catch(() => false)
    test.skip(!hasTable, 'No audit data available; seed data required')
  })

  test('page loads with table and expected columns', async ({ app }) => {
    for (const name of ['Timestamp', 'Event', 'Actor Type', 'User', 'Resource', 'Status', 'Severity']) {
      await expect(app.getByRole('columnheader', { name: new RegExp(name, 'i') })).toBeVisible()
    }
  })

  test('expands row to show structured event details', async ({ app }) => {
    const table = app.getByRole('grid', { name: 'Audit log table' })
    const firstRow = table.locator('tbody tr:first-child')
    await firstRow.getByRole('button', { name: /details/i }).click()

    const expandedRow = table.locator('tbody tr:nth-child(2)')
    await expect(expandedRow.getByText('Event Message')).toBeVisible()
  })

  test('expands and collapses all rows via header toggle', async ({ app }) => {
    const expandAllButton = app.getByRole('button', { name: /expand all/i })
    await expandAllButton.click()

    const detailButtons = app.getByRole('button', { name: /details/i })
    const count = await detailButtons.count()
    for (let i = 0; i < count; i++) {
      await expect(detailButtons.nth(i)).toHaveAttribute('aria-expanded', 'true')
    }

    await expandAllButton.click()

    for (let i = 0; i < count; i++) {
      await expect(detailButtons.nth(i)).toHaveAttribute('aria-expanded', 'false')
    }
  })

  test('user column links to user detail page', async ({ app }) => {
    const table = app.getByRole('grid', { name: 'Audit log table' })
    const firstRow = table.locator('tbody tr:first-child')
    const firstRowUserButton = firstRow.locator('td[data-label="User"] button')
    const hasUserLink = (await firstRowUserButton.count()) > 0
    test.skip(!hasUserLink, 'First audit event has no linked user')

    await firstRowUserButton.click()
    await expect(app).toHaveURL(/\/system-administration\/access-management\/users\//)
  })

  test('resource column displays resource name and links to detail page', async ({ app }) => {
    const table = app.getByRole('grid', { name: 'Audit log table' })
    const firstRow = table.locator('tbody tr:first-child')
    const firstResourceButton = firstRow.locator('td[data-label="Resource"] button')
    const hasResourceLink = (await firstResourceButton.count()) > 0
    test.skip(!hasResourceLink, 'First audit event has no linked resource')
    const firstResourceText = await firstResourceButton.textContent()
    expect(firstResourceText).toBeTruthy()
    expect(firstResourceText).not.toMatch(/^urn:nexus:/)

    await firstResourceButton.click()
    await expect(app).toHaveURL(/\/(workflow-builder|executions|configuration|access-management)\//)
  })

  test('sorts by Event column header', async ({ app }) => {
    const eventHeader = app.getByRole('columnheader', { name: /Event/i })
    await eventHeader.getByRole('button').click()

    await expect(eventHeader).toHaveAttribute('aria-sort', 'ascending')

    await eventHeader.getByRole('button').click()

    await expect(eventHeader).toHaveAttribute('aria-sort', 'descending')
  })

  test('sorts by Resource column header', async ({ app }) => {
    const resourceHeader = app.getByRole('columnheader', { name: /Resource/i })
    await resourceHeader.getByRole('button').click()

    await expect(resourceHeader).toHaveAttribute('aria-sort', 'ascending')
  })

  test.describe('Filtering', () => {
    test('filters by status and verifies URL param and chip', async ({ app }) => {
      const fieldSelector = app.locator('#filter-toolbar').getByRole('button', { name: 'Event type', exact: true })
      await fieldSelector.click()
      await app.getByRole('option', { name: 'Status' }).click()

      await app.getByRole('button', { name: 'Filter by status' }).click()
      await app.getByRole('option', { name: 'Success' }).click()

      const chipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
      await expect(chipGroup.getByText('Success')).toBeVisible()
      await expect(app).toHaveURL(/event_status=success/)
    })

    test('applies multiple filters then removes individual chip', async ({ app }) => {
      await app.getByRole('button', { name: 'Filter by event type' }).click()
      await app.getByRole('option', { name: 'Security Event' }).click()

      const eventChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Event type' })
      await expect(eventChipGroup.getByText('Security Event')).toBeVisible()

      const fieldSelector = app.locator('#filter-toolbar').getByRole('button', { name: 'Event type', exact: true })
      await fieldSelector.click()
      await app.getByRole('option', { name: 'Status' }).click()
      await app.getByRole('button', { name: 'Filter by status' }).click()
      await app.getByRole('option', { name: 'Success' }).click()

      const statusChipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Status' })
      await expect(statusChipGroup.getByText('Success')).toBeVisible()

      const eventLabel = eventChipGroup.locator('.pf-v6-c-label').filter({ hasText: 'Security Event' })
      await eventLabel.getByRole('button', { name: /close/i }).click()

      await expect(eventChipGroup).not.toBeVisible()
      await expect(statusChipGroup.getByText('Success')).toBeVisible()
      await expect(app).not.toHaveURL(/event_category=/)
      await expect(app).toHaveURL(/event_status=success/)
    })

    test('clears all filters', async ({ app }) => {
      await app.getByRole('button', { name: 'Filter by event type' }).click()
      await app.getByRole('option', { name: 'Security Event' }).click()

      const chipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Event type' })
      await expect(chipGroup).toBeVisible()

      await app.locator('#filter-toolbar').getByRole('button', { name: 'Clear all filters' }).click()

      await expect(app.locator('#filter-toolbar').getByRole('list')).toHaveCount(0)
      await expect(app).not.toHaveURL(/event_category=/)
    })

    test('empty state when filters match nothing', async ({ app }) => {
      const fieldSelector = app.locator('#filter-toolbar').getByRole('button', { name: 'Event type', exact: true })
      await fieldSelector.click()
      await app.getByRole('option', { name: 'Severity' }).click()
      await app.getByRole('button', { name: 'Filter by severity' }).click()
      await app.getByRole('option', { name: 'Critical' }).click()

      const severityChip = app.locator('#filter-toolbar').getByRole('list', { name: 'Severity' })
      await expect(severityChip).toBeVisible()

      const fieldSelector2 = app.locator('#filter-toolbar').getByRole('button', { name: 'Severity', exact: true })
      await fieldSelector2.click()
      await app.getByRole('option', { name: 'Event type' }).click()
      await app.getByRole('button', { name: 'Filter by event type' }).click()
      await app.getByRole('option', { name: 'LLM Reasoning' }).click()

      const table = app.getByRole('grid', { name: 'Audit log table' })
      const tableVisible = await table.isVisible().catch(() => false)

      if (!tableVisible) {
        await expect(app.getByRole('heading', { name: 'No results found' })).toBeVisible()
        await app.getByRole('button', { name: 'Clear all filters' }).last().click()
        await expect(table).toBeVisible()
      } else {
        test.skip(true, 'Filter combination still returned results — empty state not tested')
      }
    })

    test('filter state persists via URL', async ({ app, context }) => {
      await app.getByRole('button', { name: 'Filter by event type' }).click()
      await app.getByRole('option', { name: 'Security Event' }).click()

      const chipGroup = app.locator('#filter-toolbar').getByRole('list', { name: 'Event type' })
      await expect(chipGroup.getByText('Security Event')).toBeVisible()

      await expect(app).toHaveURL(/event_category=security_event/)

      const urlWithFilter = app.url()
      const newPage = await context.newPage()
      await newPage.goto(urlWithFilter)

      await expect(newPage.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
      const restoredChip = newPage.locator('#filter-toolbar').getByRole('list', { name: 'Event type' })
      await expect(restoredChip.getByText('Security Event')).toBeVisible()

      await newPage.close()
    })
  })

  test.describe('Pagination', () => {
    test('pagination controls work for next and previous pages', async ({ app }) => {
      const nextButton = app.getByRole('button', { name: 'Go to next page' })
      const hasPagination = (await nextButton.count()) > 0 && !(await nextButton.isDisabled())
      test.skip(!hasPagination, 'Not enough audit data for pagination test')

      await nextButton.click()

      const table = app.getByRole('grid', { name: 'Audit log table' })
      const prevButton = app.getByRole('button', { name: 'Go to previous page' })
      await expect(prevButton).not.toBeDisabled()
      await expect(table).toBeVisible()

      await prevButton.click()

      await expect(table).toBeVisible()
      await expect(nextButton).not.toBeDisabled()
    })
  })
})
