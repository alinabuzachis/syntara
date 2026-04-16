import { expect, test as base, type Page } from '@playwright/test'

const processEnv: Record<string, string | undefined> = (
  process as unknown as { env: Record<string, string | undefined> }
).env
export const appBaseUrl: string = processEnv['NEXUS_E2E_BASE_URL'] ?? 'http://localhost:4173'
const e2ePassword: string | undefined = processEnv['NEXUS_E2E_PASSWORD']

export const toAppUrl = (path: string): string => new URL(path, appBaseUrl).toString()

export const test = base.extend<{ app: Page }>({
  app: async ({ page }, use) => {
    // Arrange - Visit the app
    await page.goto(appBaseUrl)

    // Wait for either the login page or the main nav to appear
    const loginHeading = page.getByRole('heading', { name: 'Log in to Automation Orchestrator' })
    const mainNav = page.getByRole('navigation', { name: 'Main navigation' })
    await loginHeading.or(mainNav).waitFor({ timeout: 15_000 })

    // If the login page is shown, authenticate before proceeding
    if (await loginHeading.isVisible()) {
      if (!e2ePassword) {
        throw new Error('Login page detected but NEXUS_E2E_PASSWORD is not set')
      }

      // When IDPs are configured the local login form is hidden behind a toggle
      const localAccountToggle = page.getByRole('button', { name: 'Sign in using local account' })
      if (await localAccountToggle.isVisible()) {
        await localAccountToggle.click()
      }

      await page.getByLabel('Username').fill('admin')
      await page.getByRole('textbox', { name: 'Password' }).fill(e2ePassword)
      await page.getByRole('button', { name: /Log in/ }).click()
      await expect(mainNav).toBeVisible()
    }

    await use(page)
  },
})

export { expect }
