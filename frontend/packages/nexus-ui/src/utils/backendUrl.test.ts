import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('backendUrl', () => {
  const originalLocation = globalThis.location

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    globalThis.location = originalLocation
  })

  it('extracts origin from VITE_API_URL', async () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:8000/api/v1')

    const { backendOrigin, WEBHOOK_BASE_URL } = await import('./backendUrl')

    expect(backendOrigin).toBe('http://localhost:8000')
    expect(WEBHOOK_BASE_URL).toBe('http://localhost:8000/api/v1/webhooks')
  })

  it('falls back to location.origin when VITE_API_URL is malformed', async () => {
    vi.stubEnv('VITE_API_URL', 'not-a-valid-url')
    Object.defineProperty(globalThis, 'location', {
      value: { origin: 'https://app.example.com' },
      writable: true,
      configurable: true,
    })

    const { backendOrigin, WEBHOOK_BASE_URL } = await import('./backendUrl')

    expect(backendOrigin).toBe('https://app.example.com')
    expect(WEBHOOK_BASE_URL).toBe('https://app.example.com/api/v1/webhooks')
  })

  it('falls back to location.origin when VITE_API_URL is not set', async () => {
    vi.stubEnv('VITE_API_URL', '')
    Object.defineProperty(globalThis, 'location', {
      value: { origin: 'https://example.com' },
      writable: true,
      configurable: true,
    })

    const { backendOrigin, WEBHOOK_BASE_URL } = await import('./backendUrl')

    expect(backendOrigin).toBe('https://example.com')
    expect(WEBHOOK_BASE_URL).toBe('https://example.com/api/v1/webhooks')
  })
})
