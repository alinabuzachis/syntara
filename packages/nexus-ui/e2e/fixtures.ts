import { expect, test as base, type Page } from '@playwright/test'

const processEnv: Record<string, string | undefined> = (
  process as unknown as { env: Record<string, string | undefined> }
).env
export const appBaseUrl: string = processEnv['NEXUS_E2E_BASE_URL'] ?? 'http://localhost:4173'

export const toAppUrl = (path: string): string => new URL(path, appBaseUrl).toString()

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    // Arrange - Visit the app
    await page.goto(appBaseUrl)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await use(page)
  },
})

export { expect }
