import type { Page } from '@playwright/test'

/**
 * Snaps the React Flow viewport transform to integer pixel coordinates.
 *
 * fitView() uses floating-point math that produces slightly different viewport
 * positions between CI runs. We wait until the transform matrix stops changing
 * across two consecutive animation frames (deterministic under any load), then
 * round to integers so rendered positions are identical across runs.
 *
 * Previously this used waitForTimeout(500) — a fixed sleep that was fast
 * enough on dev machines but caused random failures on loaded CI runners.
 */
export async function stabilizeReactFlowViewport(page: Page): Promise<void> {
  // If no ReactFlow canvas is on this page, there is nothing to stabilize.
  // perceptual: true is also set on workflow list pages (for canvas masking),
  // so this guard must check the viewport element, not entry.perceptual.
  const hasCanvas = await page.locator('.react-flow__viewport').count()
  if (hasCanvas === 0) return

  // Guard: if the canvas exists but has no nodes yet it will stabilize
  // trivially on a blank graph. Wait for at least one node, but non-fatally —
  // "new workflow" entries show a trigger form before any node is on the canvas.
  const hasNodes = await page.locator('.react-flow__node').count()
  if (hasNodes === 0) {
    await page
      .locator('.react-flow__node')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })
      .catch(() => {}) // non-fatal — trigger forms precede nodes on /workflow-builder/new
  }

  // Poll until the viewport transform stops changing between two consecutive
  // animation frames. `polling: 'raf'` tells Playwright to re-evaluate on
  // every rAF tick (explicit, avoids the browser's setTimeout throttling that
  // can inflate wait times when multiple workers run concurrently in CI).
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const el = document.querySelector('.react-flow__viewport')
        if (!(el instanceof HTMLElement)) {
          resolve(true)
          return
        }
        const before = getComputedStyle(el).transform
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve(getComputedStyle(el).transform === before)
          })
        })
      }),
    undefined,
    { timeout: 10_000, polling: 'raf' }
  )

  // Snap translate to integer pixels and zoom to the nearest 0.05 increment.
  //
  // fitView() produces floating-point viewport transforms that vary run-to-run
  // depending on canvas dimensions, node count, and CI load. Two passes of rounding:
  //
  //   translate: Math.round(px) — eliminates sub-pixel antialiasing diffs
  //   zoom:      Math.round(z / 0.05) * 0.05 — 0.737 → 0.75, 0.812 → 0.80
  //
  // Zoom snapping makes the canvas deterministic even without masking, so any
  // future unmasked canvas entries benefit automatically.
  await page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport')
    if (viewport instanceof HTMLElement) {
      const matrix = new DOMMatrix(getComputedStyle(viewport).transform)
      const snappedZoom = Math.round(matrix.a / 0.05) * 0.05
      viewport.style.transform = `translate(${Math.round(matrix.e)}px, ${Math.round(matrix.f)}px) scale(${snappedZoom})`
    }
  })
}
