#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'

const COVERAGE_ARTIFACTS_DIR = resolve(process.cwd(), process.env.COVERAGE_ARTIFACTS_DIR ?? 'coverage-artifacts')
const C8_TEMP_DIR = resolve(process.cwd(), '.c8_output')
const COVERAGE_DIR = resolve(process.cwd(), 'coverage')

function collectCoverageFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectCoverageFiles(fullPath))
      continue
    }

    if (entry.isFile() && entry.name === 'coverage-final.json') {
      files.push(fullPath)
    }
  }

  return files
}

if (!existsSync(COVERAGE_ARTIFACTS_DIR)) {
  console.error(`Coverage artifacts directory not found: ${COVERAGE_ARTIFACTS_DIR}`)
  process.exit(1)
}

const coverageFiles = collectCoverageFiles(COVERAGE_ARTIFACTS_DIR)

if (coverageFiles.length === 0) {
  console.error(`No coverage-final.json files found in ${COVERAGE_ARTIFACTS_DIR}`)
  process.exit(1)
}

rmSync(C8_TEMP_DIR, { recursive: true, force: true })
rmSync(COVERAGE_DIR, { recursive: true, force: true })
mkdirSync(C8_TEMP_DIR, { recursive: true })

for (const [index, coverageFile] of coverageFiles.entries()) {
  cpSync(coverageFile, join(C8_TEMP_DIR, `shard-${index + 1}.json`))
}

const require = createRequire(import.meta.url)
const c8Bin = join(dirname(require.resolve('c8/package.json')), 'bin', 'c8.js')

execFileSync(
  process.execPath,
  [
    c8Bin,
    'report',
    '--temp-directory',
    C8_TEMP_DIR,
    '--reports-dir',
    COVERAGE_DIR,
    '--reporter',
    'html',
    '--reporter',
    'lcov',
    '--reporter',
    'json',
    '--reporter',
    'json-summary',
    '--reporter',
    'text',
  ],
  { stdio: 'inherit' }
)

console.log(`Merged ${coverageFiles.length} coverage shard(s) into ${COVERAGE_DIR}`)
