import { expect, test as base, type Page } from '@playwright/test'

const processEnv: Record<string, string | undefined> = (
  process as unknown as { env: Record<string, string | undefined> }
).env
export const appBaseUrl: string = processEnv['NEXUS_E2E_BASE_URL'] ?? 'http://localhost:4173'
const e2ePassword: string | undefined = processEnv['NEXUS_E2E_PASSWORD']

export const toAppUrl = (path: string): string => new URL(path, appBaseUrl).toString()

async function loginAs(page: Page, username: string): Promise<void> {
  await page.goto(appBaseUrl)

  const loginHeading = page.getByRole('heading', { name: 'Log in to Automation Orchestrator' })
  const mainNav = page.getByRole('navigation', { name: 'Main navigation' })
  await loginHeading.or(mainNav).waitFor({ timeout: 15_000 })

  if (await loginHeading.isVisible()) {
    if (!e2ePassword) {
      throw new Error('Login page detected but NEXUS_E2E_PASSWORD is not set')
    }

    const localAccountToggle = page.getByRole('button', { name: 'Sign in using local account' })
    if (await localAccountToggle.isVisible()) {
      await localAccountToggle.click()
    }

    await page.getByLabel('Username').fill(username)
    await page.getByRole('textbox', { name: 'Password' }).fill(e2ePassword)
    await page.getByRole('button', { name: /Log in/ }).click()
    await expect(mainNav).toBeVisible()
  }
}

async function loginAsRole(page: Page, username: string): Promise<void> {
  // Intercept auth refresh and login to always return a token for this role.
  // The mock API's cookie-based bootstrap refresh would otherwise return
  // an admin token, preventing the role-specific flow.
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: `mock-token-${username}`,
        token_type: 'bearer',
        expires_in: 3600,
      }),
    })
  )

  await page.goto(appBaseUrl)
  await page.getByRole('navigation', { name: 'Main navigation' }).waitFor({ timeout: 15_000 })
}

export const test = base.extend<{ app: Page; auditorApp: Page; viewerApp: Page }>({
  app: async ({ page }, use) => {
    await loginAs(page, 'admin')
    await use(page)
  },

  auditorApp: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await loginAsRole(page, 'auditor')
    await use(page)
    await context.close()
  },

  viewerApp: async ({ browser }, use) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await loginAsRole(page, 'viewer')
    await use(page)
    await context.close()
  },
})

export { expect }
