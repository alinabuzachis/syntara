import { defineConfig } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const uiPort = process.env.NEXUS_E2E_PORT ?? '4173'
const apiPort = process.env.NEXUS_E2E_API_PORT ?? '3300'
const baseURL = process.env.NEXUS_E2E_BASE_URL ?? `http://localhost:${uiPort}`
const useWebServer = !process.env.NEXUS_E2E_SKIP_WEB_SERVER

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: process.env.CI ? 1 : undefined,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: useWebServer
    ? [
        {
          command: 'npm run start:mock-api',
          cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
          url: `http://localhost:${apiPort}/api/v1/workflows`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            PORT: apiPort,
          },
        },
        {
          command: `npm run start --prefix packages/nexus-ui -- --port ${uiPort}`,
          cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'),
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            VITE_API_URL: `http://localhost:${apiPort}`,
          },
        },
      ]
    : undefined,
})
