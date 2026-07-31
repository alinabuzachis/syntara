import type { Locator, Page } from '@playwright/test'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function altIfPresent(locator: Locator): Promise<string | null> {
  // Use count() first — getAttribute() waits for the locator and times out on
  // pages where the element is absent (e.g. login has no nav brand-logo).
  if ((await locator.count()) === 0) {
    return null
  }
  return locator.getAttribute('alt')
}

/**
 * Brand-variable chrome (logos and app-title copy) painted with the same solid
 * grey as `.react-flow`.
 *
 * Baselines are committed in this repo; masking keeps them focused on feature
 * UI layout instead of logo art or `APP_TITLE` strings that can change between
 * builds.
 */
export async function brandChromeMasks(page: Page): Promise<Locator[]> {
  const masks: Locator[] = [
    page.getByTestId('brand-logo'),
    page.locator('.vr-login-brand-logo'),
    // Login title is always `Log in to ${APP_TITLE}`.
    page.getByRole('heading', { name: /^Log in to / }),
    // Login aside copy embeds the app title.
    page.getByText(/Select your identity provider to access /),
  ]

  const title =
    (await altIfPresent(page.getByTestId('brand-logo').first())) ??
    (await altIfPresent(page.locator('.vr-login-brand-logo').first()))

  if (title) {
    const escaped = escapeRegExp(title)
    // IdP group-mapping wizard / table copy embeds `${APP_TITLE}`.
    masks.push(page.getByRole('columnheader', { name: new RegExp(`^${escaped} Group$`, 'i') }))
    masks.push(page.getByText(new RegExp(`^${escaped} group$`, 'i')))
    masks.push(page.getByText(new RegExp(`Select a ${escaped} group`, 'i')))
    masks.push(page.getByPlaceholder(new RegExp(`Select a ${escaped} group`, 'i')))
    masks.push(page.getByText(new RegExp(`Map IdP group values to ${escaped} groups`, 'i')))
    masks.push(page.getByText(new RegExp(`Group mappings automatically assign users to ${escaped} groups`, 'i')))
    masks.push(page.getByText(new RegExp(`IdP groups to a single ${escaped} group`, 'i')))
    masks.push(page.getByText(new RegExp(`Select a valid ${escaped} group`, 'i')))
  }

  return masks
}
