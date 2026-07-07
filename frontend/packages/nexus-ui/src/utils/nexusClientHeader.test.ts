import { describe, expect, it } from 'vitest'

import {
  NEXUS_CLIENT_HEADER,
  NEXUS_CLIENT_UI_VALUE,
  applyNexusUiClientHeader,
  nexusUiClientHeaders,
} from './nexusClientHeader'

describe('nexusClientHeader', () => {
  it('exports the header name and UI value expected by the backend', () => {
    expect(NEXUS_CLIENT_HEADER).toBe('X-Nexus-Client')
    expect(NEXUS_CLIENT_UI_VALUE).toBe('ui')
  })

  it('nexusUiClientHeaders returns a plain object suitable for fetch init', () => {
    expect(nexusUiClientHeaders()).toEqual({ 'X-Nexus-Client': 'ui' })
  })

  it('applyNexusUiClientHeader sets the header on Headers', () => {
    const headers = new Headers()
    applyNexusUiClientHeader(headers)
    expect(headers.get(NEXUS_CLIENT_HEADER)).toBe(NEXUS_CLIENT_UI_VALUE)
  })
})
