import { expect, test as base, type Page } from '@playwright/test'

export const appBaseUrl = process.env.NEXUS_E2E_BASE_URL ?? 'http://localhost:4173'

export const toAppUrl = (path: string) => new URL(path, appBaseUrl).toString()

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    // Arrange - Visit the app
    await page.goto(appBaseUrl)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await use(page)
  },
})

export { expect }
