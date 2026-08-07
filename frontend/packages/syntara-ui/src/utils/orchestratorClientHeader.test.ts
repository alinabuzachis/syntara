import { describe, expect, it } from 'vitest'

import {
  ORCHESTRATOR_CLIENT_HEADER,
  ORCHESTRATOR_CLIENT_UI_VALUE,
  applyOrchestratorUiClientHeader,
  orchestratorUiClientHeaders,
} from './orchestratorClientHeader'

describe('orchestratorClientHeader', () => {
  it('exports the header name and UI value expected by the backend', () => {
    expect(ORCHESTRATOR_CLIENT_HEADER).toBe('X-Orchestrator-Client')
    expect(ORCHESTRATOR_CLIENT_UI_VALUE).toBe('ui')
  })

  it('orchestratorUiClientHeaders returns a plain object suitable for fetch init', () => {
    expect(orchestratorUiClientHeaders()).toEqual({ 'X-Orchestrator-Client': 'ui' })
  })

  it('applyOrchestratorUiClientHeader sets the header on Headers', () => {
    const headers = new Headers()
    applyOrchestratorUiClientHeader(headers)
    expect(headers.get(ORCHESTRATOR_CLIENT_HEADER)).toBe(ORCHESTRATOR_CLIENT_UI_VALUE)
  })
})
