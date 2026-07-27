import type { CurrentsConfig } from '@currents/playwright'

const config: CurrentsConfig = {
  // Both env vars are set as repo secrets — never hardcoded (matches ansible-ui pattern)
  projectId: process.env.CURRENTS_PROJECT_ID ?? '',
  recordKey: process.env.CURRENTS_RECORD_KEY ?? '',
}

// eslint.config.js exempts this file from the default-export ban (Currents requires it)
export default config
