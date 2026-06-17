/**
 * Perceptual screenshot comparison using looks-same.
 *
 * Uses CIEDE2000 (https://en.wikipedia.org/wiki/Color_difference#CIEDE2000)
 * color distance to compare pixels instead of exact RGB matching. This
 * ignores rendering differences that are imperceptible to humans.
 *
 * Used for canvas-heavy pages (React Flow builder, execution visualizer)
 * where sub-pixel rendering differences cause false positives with
 * Playwright's built-in pixelmatch comparator.
 *
 * Outputs artifacts in the same structure Playwright uses so CI reporting
 * (diff images, PR comments) works without changes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'

import type { Page, TestInfo } from '@playwright/test'
import looksSame from 'looks-same'

const LOOKS_SAME_OPTIONS = {
  tolerance: 2.3,
  ignoreAntialiasing: true,
  antialiasingTolerance: 5,
  ignoreCaret: true,
  createDiffImage: true as const,
} satisfies looksSame.LooksSameOptions

// After viewport stabilization, minor antialiasing differences may remain.
// Allow up to 2% of pixels to differ perceptually.
const MAX_DIFF_PIXEL_RATIO = 0.02

/** Returns the sibling `-snapshots` directory for a test file (mirrors Playwright's convention). */
function snapshotDir(testInfo: TestInfo): string {
  return path.join(path.dirname(testInfo.file), `${path.basename(testInfo.file)}-snapshots`)
}

/** Resolves the platform-specific baseline PNG path from section/name parts (e.g. `["workflows", "builder-edit.png"]`). */
function baselinePath(testInfo: TestInfo, nameParts: string[]): string {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  const fileName = nameParts[nameParts.length - 1].replace('.png', `-${platform}.png`)
  const section = nameParts.slice(0, -1)
  return path.join(snapshotDir(testInfo), ...section, fileName)
}

/** Returns the output directory for diff artifacts (actual, expected, diff PNGs) on failure. */
function artifactDir(testInfo: TestInfo, nameParts: string[]): string {
  const section = nameParts.slice(0, -1)
  const slug = nameParts[nameParts.length - 1].replace('.png', '')
  return path.join(testInfo.outputDir, ...section, slug)
}

export async function assertPerceptualScreenshot(page: Page, testInfo: TestInfo, nameParts: string[]): Promise<void> {
  const screenshot = await page.screenshot({ fullPage: true, animations: 'disabled' })
  const baseline = baselinePath(testInfo, nameParts)
  const isUpdate = testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed'

  if (!existsSync(baseline) || isUpdate) {
    const dir = path.dirname(baseline)
    mkdirSync(dir, { recursive: true })
    writeFileSync(baseline, screenshot)
    return
  }

  const result = await looksSame(baseline, screenshot, LOOKS_SAME_OPTIONS)

  if (result.equal) return

  const diffRatio =
    'differentPixels' in result && 'totalPixels' in result && result.totalPixels > 0
      ? result.differentPixels / result.totalPixels
      : 1
  if (diffRatio <= MAX_DIFF_PIXEL_RATIO) return

  const outDir = artifactDir(testInfo, nameParts)
  mkdirSync(outDir, { recursive: true })

  const slug = nameParts[nameParts.length - 1].replace('.png', '')
  const actualPath = path.join(outDir, `${slug}-actual.png`)
  const expectedPath = path.join(outDir, `${slug}-expected.png`)
  const diffPath = path.join(outDir, `${slug}-diff.png`)

  writeFileSync(actualPath, screenshot)
  writeFileSync(expectedPath, readFileSync(baseline))

  if ('diffImage' in result && result.diffImage) {
    await result.diffImage.save(diffPath)
  }

  testInfo.attachments.push(
    { name: `${slug}-expected.png`, path: expectedPath, contentType: 'image/png' },
    { name: `${slug}-actual.png`, path: actualPath, contentType: 'image/png' },
    { name: `${slug}-diff.png`, path: diffPath, contentType: 'image/png' }
  )

  const pct =
    'differentPixels' in result && 'totalPixels' in result
      ? ` (${((result.differentPixels / result.totalPixels) * 100).toFixed(2)}% pixels differ)`
      : ''

  throw new Error(
    `Perceptual screenshot mismatch: ${nameParts.join('/')}${pct}\n` +
      `  Expected: ${expectedPath}\n` +
      `  Actual:   ${actualPath}\n` +
      `  Diff:     ${diffPath}`
  )
}
