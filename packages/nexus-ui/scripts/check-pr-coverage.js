#!/usr/bin/env node

/**
 * PR Coverage Checker
 *
 * Enforces coverage threshold on files changed in a PR.
 * No third-party dependencies or tokens required.
 *
 * Usage:
 *   node scripts/check-pr-coverage.js [base-branch] [threshold]
 *
 * Example:
 *   node scripts/check-pr-coverage.js main 80
 *   node scripts/check-pr-coverage.js origin/main 75
 *
 * Environment variables:
 *   COVERAGE_THRESHOLD - Override default threshold (default: 80)
 *   GITHUB_STEP_SUMMARY - If set, writes markdown report to this file
 */

import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Configurable threshold (env var > CLI arg > default)
const DEFAULT_THRESHOLD = 80
const COVERAGE_THRESHOLD = Number(process.env.COVERAGE_THRESHOLD) || Number(process.argv[3]) || DEFAULT_THRESHOLD
const COVERAGE_FILE = 'coverage/coverage-summary.json'
const REPORT_FILE = 'coverage/pr-coverage-report.md'

// File patterns to check (source files only)
const SOURCE_PATTERNS = [/\.tsx?$/]
const IGNORE_PATTERNS = [/\.test\.tsx?$/, /\.spec\.tsx?$/, /\.d\.ts$/, /mockData/, /\.config\./, /src\/test\//]

function getChangedFiles(baseBranch = 'origin/main') {
  try {
    // Get files changed compared to base branch
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8',
    })
    return output
      .trim()
      .split('\n')
      .filter((f) => f.length > 0)
  } catch {
    // Fallback: compare with parent commit (useful for local testing)
    console.log('⚠️  Could not compare with base branch, using HEAD~1')
    const output = execSync('git diff --name-only HEAD~1', {
      encoding: 'utf-8',
    })
    return output
      .trim()
      .split('\n')
      .filter((f) => f.length > 0)
  }
}

function isSourceFile(filePath) {
  // Must match source pattern
  if (!SOURCE_PATTERNS.some((p) => p.test(filePath))) {
    return false
  }
  // Must not match ignore pattern
  if (IGNORE_PATTERNS.some((p) => p.test(filePath))) {
    return false
  }
  // Must be in src directory
  if (!filePath.includes('/src/')) {
    return false
  }
  return true
}

function loadCoverageReport() {
  const coveragePath = join(process.cwd(), COVERAGE_FILE)

  if (!existsSync(coveragePath)) {
    console.error(`❌ Coverage report not found: ${coveragePath}`)
    console.error('   Run "npm run test:coverage" first')
    process.exit(1)
  }

  return JSON.parse(readFileSync(coveragePath, 'utf-8'))
}

function getCoverageForFile(coverage, filePath) {
  // Coverage keys are absolute paths, we need to find the matching file
  const matchingKey = Object.keys(coverage).find((key) => key.endsWith(filePath) || key.includes(filePath))

  if (!matchingKey || matchingKey === 'total') {
    return null
  }

  return coverage[matchingKey]
}

function calculateCoverage(metrics) {
  if (!metrics) return null

  const { lines, statements, functions, branches } = metrics

  // Calculate percentages
  const linesPct = lines.total > 0 ? (lines.covered / lines.total) * 100 : 100
  const stmtsPct = statements.total > 0 ? (statements.covered / statements.total) * 100 : 100
  const funcsPct = functions.total > 0 ? (functions.covered / functions.total) * 100 : 100
  const branchesPct = branches.total > 0 ? (branches.covered / branches.total) * 100 : 100

  return {
    lines: linesPct,
    statements: stmtsPct,
    functions: funcsPct,
    branches: branchesPct,
    average: (linesPct + stmtsPct + funcsPct + branchesPct) / 4,
  }
}

function generateMarkdownReport(results, passed, failed, warnings) {
  const lines = []

  // Header
  const statusIcon = failed > 0 ? '❌' : '✅'
  const statusText = failed > 0 ? 'Coverage Check Failed' : 'Coverage Check Passed'
  lines.push(`## ${statusIcon} ${statusText}`)
  lines.push('')
  lines.push(
    `**Threshold:** ${COVERAGE_THRESHOLD}% | **Passed:** ${passed} | **Failed:** ${failed} | **Warnings:** ${warnings}`
  )
  lines.push('')

  // Table header
  lines.push('| Status | File | Lines | Statements | Functions | Branches |')
  lines.push('|:------:|------|------:|-----------:|----------:|---------:|')

  // Table rows
  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️'
    const shortFile = result.file.replace('packages/nexus-ui/', '')

    if (result.coverage) {
      const { lines: l, statements: s, functions: f, branches: b } = result.coverage
      lines.push(
        `| ${icon} | \`${shortFile}\` | ${l.toFixed(1)}% | ${s.toFixed(1)}% | ${f.toFixed(1)}% | ${b.toFixed(1)}% |`
      )
    } else {
      lines.push(`| ${icon} | \`${shortFile}\` | - | - | - | - |`)
    }
  }

  lines.push('')

  // Tips for failures
  if (failed > 0) {
    lines.push('### 💡 How to fix')
    lines.push('')
    lines.push('1. Run `npm run test:coverage` locally to see detailed coverage')
    lines.push('2. Open `coverage/index.html` for visual coverage report')
    lines.push('3. Add tests for uncovered code paths')
    lines.push(`4. Ensure changed files have at least ${COVERAGE_THRESHOLD}% line coverage`)
  }

  return lines.join('\n')
}

function main() {
  const baseBranch = process.argv[2] || 'origin/main'

  console.log('🔍 PR Coverage Checker')
  console.log(`   Threshold: ${COVERAGE_THRESHOLD}%`)
  console.log(`   Base branch: ${baseBranch}`)
  console.log('')

  // Get changed files
  const changedFiles = getChangedFiles(baseBranch)
  console.log(`📁 Changed files: ${changedFiles.length}`)

  // Filter to source files only
  const sourceFiles = changedFiles.filter(isSourceFile)

  if (sourceFiles.length === 0) {
    console.log('✅ No source files changed - nothing to check')

    // Write empty report for GitHub summary
    const report = '## ✅ Coverage Check Passed\n\nNo source files changed - nothing to check.'
    writeFileSync(join(process.cwd(), REPORT_FILE), report)
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
    }

    process.exit(0)
  }

  console.log(`📝 Source files to check: ${sourceFiles.length}`)
  sourceFiles.forEach((f) => console.log(`   - ${f}`))
  console.log('')

  // Load coverage report
  const coverage = loadCoverageReport()

  // Check coverage for each file
  const results = []
  let hasFailures = false

  for (const file of sourceFiles) {
    const fileCoverage = getCoverageForFile(coverage, file)

    if (!fileCoverage) {
      // File not in coverage report - might be new and not yet covered
      console.log(`⚠️  ${file}`)
      console.log('   Not found in coverage report (new file or not imported)')
      results.push({ file, status: 'warning', reason: 'not in coverage report' })
      continue
    }

    const pct = calculateCoverage(fileCoverage)

    if (pct.lines < COVERAGE_THRESHOLD) {
      console.log(`❌ ${file}`)
      console.log(`   Lines: ${pct.lines.toFixed(1)}% (need ${COVERAGE_THRESHOLD}%)`)
      console.log(`   Statements: ${pct.statements.toFixed(1)}%`)
      console.log(`   Functions: ${pct.functions.toFixed(1)}%`)
      console.log(`   Branches: ${pct.branches.toFixed(1)}%`)
      results.push({ file, status: 'fail', coverage: pct })
      hasFailures = true
    } else {
      console.log(`✅ ${file}`)
      console.log(`   Lines: ${pct.lines.toFixed(1)}%`)
      results.push({ file, status: 'pass', coverage: pct })
    }
  }

  console.log('')
  console.log('─'.repeat(50))

  // Summary
  const passed = results.filter((r) => r.status === 'pass').length
  const failed = results.filter((r) => r.status === 'fail').length
  const warnings = results.filter((r) => r.status === 'warning').length

  console.log(`\n📊 Summary: ${passed} passed, ${failed} failed, ${warnings} warnings`)

  // Generate markdown report
  const report = generateMarkdownReport(results, passed, failed, warnings)
  writeFileSync(join(process.cwd(), REPORT_FILE), report)
  console.log(`\n📄 Report saved to: ${REPORT_FILE}`)

  // Write to GitHub Actions job summary if available
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
    console.log('📋 Report added to GitHub Actions summary')
  }

  if (hasFailures) {
    console.log(`\n❌ Coverage check FAILED`)
    console.log(`   ${failed} file(s) below ${COVERAGE_THRESHOLD}% threshold`)
    console.log('\n💡 Tips:')
    console.log('   - Add tests for uncovered code paths')
    console.log('   - Run "npm run test:coverage" to see detailed report')
    console.log('   - Open coverage/index.html for visual coverage report')
    process.exit(1)
  }

  console.log('\n✅ Coverage check PASSED')
  process.exit(0)
}

main()
