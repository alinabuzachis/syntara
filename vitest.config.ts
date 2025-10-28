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
    },
  },
  resolve: {
    alias: {
      '~': new URL('./packages', import.meta.url).pathname,
    },
  },
})
