#!/usr/bin/env node

/**
 * Generate a visual diff summary report from Playwright test results.
 *
 * Walks the test-results/ directory to find *-diff.png files produced by
 * Playwright's toHaveScreenshot() comparisons, pairs each with its
 * corresponding *-actual.png and *-expected.png, and writes a JSON
 * summary to visual-diff-summary.json.
 *
 * Usage:
 *   node scripts/generate-visual-diff-report.js
 *
 * Exit codes:
 *   0 — always (this script is advisory, never blocks CI)
 */

import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')
const testResultsDir = resolve(pkgRoot, 'test-results')
const outputPath = resolve(pkgRoot, 'visual-diff-summary.json')

const MAX_FILES = 10
const STEP_SUMMARY_LIMIT_BYTES = 900 * 1024

/**
 * Recursively collect files matching a predicate.
 * @param {string} dir - directory to walk
 * @param {(name: string) => boolean} predicate - filter function for file names
 * @returns {string[]} absolute paths of matching files
 */
function walkFiles(dir, predicate) {
  const results = []
  if (!existsSync(dir)) return results

  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...walkFiles(full, predicate))
    } else if (predicate(entry)) {
      results.push(full)
    }
  }
  return results
}

/**
 * Derive a human-readable name from a diff file path.
 * Uses the parent directory name and the file stem (minus the -diff suffix).
 * @param {string} diffPath - absolute path to a *-diff.png file
 * @returns {string} sanitized name suitable for use as an identifier
 */
function extractName(diffPath) {
  const dir = basename(dirname(diffPath))
  const stem = basename(diffPath, '-diff.png')
  return `${dir}/${stem}`.replace(/[/\\]/g, '--')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const diffFiles = walkFiles(testResultsDir, (name) => name.endsWith('-diff.png'))

const changed = diffFiles.map((f) => {
  const dir = basename(dirname(f))
  const stem = basename(f, '-diff.png')
  return `${dir}/${stem}`
})

const files = diffFiles.slice(0, MAX_FILES).map((diffPath) => {
  const dir = dirname(diffPath)
  const stem = basename(diffPath, '-diff.png')
  const name = extractName(diffPath)
  const actualPath = join(dir, `${stem}-actual.png`)
  const expectedPath = join(dir, `${stem}-expected.png`)

  return {
    name,
    diffPath,
    actualPath: existsSync(actualPath) ? actualPath : null,
    expectedPath: existsSync(expectedPath) ? expectedPath : null,
  }
})

const totalImageBytes = files.reduce((sum, f) => {
  for (const p of [f.diffPath, f.actualPath, f.expectedPath]) {
    if (p && existsSync(p)) sum += statSync(p).size
  }
  return sum
}, 0)

// `inlineImages` is read by visual-regression-manual.yml (“Write visual diff to Job Summary”)
// via `jq ‘.inlineImages’` so the Job Summary table omits huge image markdown when
// the on-disk PNG set would exceed GitHub’s Step Summary size guidance.
const inlineImages = totalImageBytes < STEP_SUMMARY_LIMIT_BYTES

const summary = {
  changed,
  count: diffFiles.length,
  files,
  inlineImages,
}

writeFileSync(outputPath, JSON.stringify(summary, null, 2))

console.log(`Found ${diffFiles.length} diff(s), included ${files.length} in report`)
console.log(`Report written to ${outputPath}`)
