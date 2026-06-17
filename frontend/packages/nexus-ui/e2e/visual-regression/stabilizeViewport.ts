import type { Page } from '@playwright/test'

/**
 * Snaps the React Flow viewport transform to integer pixel coordinates.
 *
 * fitView() uses floating-point math that can produce slightly different
 * viewport positions between CI runs. Rounding to integers makes the
 * rendered canvas deterministic across runs.
 */
export async function stabilizeReactFlowViewport(page: Page): Promise<void> {
  await page.waitForTimeout(500)

  await page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport')
    if (viewport instanceof HTMLElement) {
      const matrix = new DOMMatrix(getComputedStyle(viewport).transform)
      viewport.style.transform = `translate(${Math.round(matrix.e)}px, ${Math.round(matrix.f)}px) scale(${Math.round(matrix.a * 100) / 100})`
    }
  })

  await page.waitForTimeout(100)
}
