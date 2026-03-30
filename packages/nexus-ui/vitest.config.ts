import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const isShardedCoverage = process.env.CI === 'true' && Boolean(process.env.VITEST_COVERAGE_DIR)

// https://vitest.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/playwright.config.ts', '**/*.browser.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: process.env.VITEST_COVERAGE_DIR ?? 'coverage',
      reporter: isShardedCoverage ? ['json'] : ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData',
        'dist/',
        'e2e/',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
      ],
      // Note: Global thresholds are NOT set here.
      // Coverage is enforced incrementally on new/modified files only
      // via scripts/check-pr-coverage.js which runs in CI
    },
  },
})
