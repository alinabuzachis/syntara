#!/usr/bin/env node

/**
 * Baseline enforcement script for visual regression testing.
 *
 * Catches three failure modes:
 *   1. A new route was added to AppRoute.tsx but not to the page registry
 *   2. A route is in the page registry but has no committed baseline screenshot
 *   3. A baseline PNG exists but has no matching entry in the page registry (orphan)
 *
 * Usage:
 *   node scripts/check-visual-baselines.js
 *
 * Exit codes:
 *   0 — all routes covered, all baselines present
 *   1 — missing coverage or missing baselines
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// 1. Extract all route paths from AppRoute.tsx
// ---------------------------------------------------------------------------
const appRoutePath = resolve(pkgRoot, 'src/app/AppRoute.tsx')
const appRouteSource = readFileSync(appRoutePath, 'utf-8')

// Match all string literals that look like route paths: '/some/path'
const routePathRegex = /['"](\/.+?)['"]/g
const allAppRoutes = new Set()

for (const match of appRouteSource.matchAll(routePathRegex)) {
  allAppRoutes.add(match[1])
}

// ---------------------------------------------------------------------------
// 2. Extract covered paths + excluded paths from the page registry
// ---------------------------------------------------------------------------
const registryPath = resolve(pkgRoot, 'e2e/visual-regression/page-registry.ts')
const registrySource = readFileSync(registryPath, 'utf-8')

// Extract `path:` values from page entries (concrete URLs with mock IDs)
const registryPathRegex = /path:\s*[`'"](.+?)[`'"]/g
const coveredConcretePaths = new Set()

for (const match of registrySource.matchAll(registryPathRegex)) {
  coveredConcretePaths.add(match[1])
}

// Extract excluded route patterns from the arrays
const excludedRegex = /['"](\/.+?)['"]/g
const excludedSection = registrySource.slice(registrySource.indexOf('excludedUnimplemented'))
const excludedRoutes = new Set()

for (const match of excludedSection.matchAll(excludedRegex)) {
  excludedRoutes.add(match[1])
}

// ---------------------------------------------------------------------------
// 3. Normalize parameterized routes for comparison
//    AppRoute.tsx has :param placeholders; the registry uses concrete mock IDs
// ---------------------------------------------------------------------------

function matchesTemplate(template, concretePath) {
  const tParts = template.split('/')
  const cParts = concretePath.split('/')

  if (tParts.length !== cParts.length) return false

  return tParts.every((tSeg, i) => {
    if (tSeg.startsWith(':')) return true // param placeholder matches anything
    return tSeg === cParts[i]
  })
}

// Build set of AppRoute templates that are covered (by concrete paths or exclusions)
const uncoveredRoutes = []

for (const route of allAppRoutes) {
  // Check if explicitly excluded
  if (excludedRoutes.has(route)) continue

  // Check if covered by a concrete path in the registry
  const isCovered = [...coveredConcretePaths].some((cp) => matchesTemplate(route, cp))
  // Check for exact match (non-parameterized routes)
  const isExact = coveredConcretePaths.has(route)

  if (!isCovered && !isExact) {
    uncoveredRoutes.push(route)
  }
}

// ---------------------------------------------------------------------------
// 4. Check that baseline screenshots exist for every registry entry
// ---------------------------------------------------------------------------
const snapshotDir = resolve(pkgRoot, 'e2e/visual-regression/page-screenshots.spec.ts-snapshots')

// Extract section + name pairs from the registry
const entryRegex = /section:\s*['"](.+?)['"][\s\S]*?name:\s*['"](.+?)['"]/g
const registryEntries = []

for (const match of registrySource.matchAll(entryRegex)) {
  registryEntries.push({ section: match[1], name: match[2] })
}

const missingBaselines = []

for (const entry of registryEntries) {
  const baselinePath = resolve(snapshotDir, entry.section, `${entry.name}-linux.png`)
  if (!existsSync(baselinePath)) {
    missingBaselines.push({
      entry: `${entry.section}/${entry.name}`,
      expectedPath: baselinePath.replace(pkgRoot + '/', ''),
    })
  }
}

// ---------------------------------------------------------------------------
// 5. Detect orphan baselines (PNGs with no matching registry entry)
// ---------------------------------------------------------------------------

/** Recursively collect all `-linux.png` files under a directory. */
function collectLinuxPngs(dir) {
  const results = []
  if (!existsSync(dir)) return results
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...collectLinuxPngs(full))
    } else if (entry.endsWith('-linux.png')) {
      results.push(full)
    }
  }
  return results
}

const allBaselinePngs = collectLinuxPngs(snapshotDir)

// Build a set of expected baseline paths from registry entries
const expectedBaselinePaths = new Set(
  registryEntries.map((e) => resolve(snapshotDir, e.section, `${e.name}-linux.png`))
)

const orphanBaselines = allBaselinePngs.filter((p) => !expectedBaselinePaths.has(p))

// ---------------------------------------------------------------------------
// 6. Report results
// ---------------------------------------------------------------------------
let hasErrors = false

if (uncoveredRoutes.length > 0) {
  hasErrors = true
  console.error('\n--- Routes missing from page registry ---')
  console.error('These routes exist in AppRoute.tsx but have no entry in page-registry.ts:')
  for (const route of uncoveredRoutes.sort()) {
    console.error(`  - ${route}`)
  }
  console.error('\nTo fix: add an entry to e2e/visual-regression/page-registry.ts')
  console.error('        or add to excludedUnimplemented/excludedDynamic if intentionally skipped.\n')
}

if (missingBaselines.length > 0) {
  hasErrors = true
  console.error('\n--- Missing baseline screenshots ---')
  console.error('These pages are registered but have no committed Linux baseline:')
  for (const { entry, expectedPath } of missingBaselines) {
    console.error(`  - ${entry}`)
    console.error(`    Expected: ${expectedPath}`)
  }
  console.error('\nTo fix: run `npx playwright test page-screenshots --update-snapshots` on Linux')
  console.error(
    '        or use Docker: docker run --rm -v $(pwd):/work -w /work/packages/nexus-ui \\\n' +
      '          mcr.microsoft.com/playwright:v1.59.0-noble \\\n' +
      '          npx playwright test e2e/visual-regression/page-screenshots --update-snapshots\n'
  )
}

if (orphanBaselines.length > 0) {
  hasErrors = true
  console.error('\n--- Orphan baseline screenshots ---')
  console.error('These baseline PNGs have no matching entry in page-registry.ts:')
  for (const p of orphanBaselines) {
    console.error(`  - ${relative(pkgRoot, p)}`)
  }
  console.error('\nTo fix: delete the orphan PNGs, or re-add the registry entry if the page still exists.\n')
}

if (hasErrors) {
  process.exit(1)
} else {
  console.log('All routes covered, all baselines present, no orphans.')
  console.log(`  Routes in AppRoute.tsx: ${allAppRoutes.size} (${excludedRoutes.size} excluded)`)
  console.log(`  Pages in registry: ${registryEntries.length}`)
  console.log(`  Baseline PNGs: ${allBaselinePngs.length}`)
  process.exit(0)
}
