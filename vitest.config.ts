import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // Change from 'node' to 'jsdom'
    setupFiles: ['./packages/nexus-ui/src/test/setup.ts'], // Ensure setup files are properly referenced
    include: ['packages/*/src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', '**/dist/', '**/*.config.*', '**/mockData', '**/*.d.ts'],
      cleanOnRerun: true, // Clean coverage before each run
      all: false, // Don't collect coverage from all files, only tested ones
    },
  },
  resolve: {
    alias: {
      '~': new URL('./packages', import.meta.url).pathname,
    },
  },
})
