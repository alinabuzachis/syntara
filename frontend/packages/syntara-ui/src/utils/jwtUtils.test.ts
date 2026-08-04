import { describe, expect, it } from 'vitest'

import { getUserIdFromToken } from './jwtUtils'

/** Helper: build a fake JWT with the given payload object. */
function buildToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = btoa(JSON.stringify(payload))
  const signature = 'fake-signature'
  return `${header}.${body}.${signature}`
}

describe('getUserIdFromToken', () => {
  it('returns null for null', () => {
    expect(getUserIdFromToken(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(getUserIdFromToken(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getUserIdFromToken('')).toBeNull()
  })

  it('returns null for a token with fewer than 3 parts', () => {
    expect(getUserIdFromToken('header.payload')).toBeNull()
  })

  it('returns null for a token with more than 3 parts', () => {
    expect(getUserIdFromToken('a.b.c.d')).toBeNull()
  })

  it('returns null for invalid base64 payload', () => {
    expect(getUserIdFromToken('header.!!!invalid!!!.signature')).toBeNull()
  })

  it('returns null when payload JSON has no sub claim', () => {
    const token = buildToken({ iss: 'test', exp: 12345 })
    expect(getUserIdFromToken(token)).toBeNull()
  })

  it('returns null when sub is not a string', () => {
    const token = buildToken({ sub: 12345 })
    expect(getUserIdFromToken(token)).toBeNull()
  })

  it('returns null when sub is an object', () => {
    const token = buildToken({ sub: { id: 'user-1' } })
    expect(getUserIdFromToken(token)).toBeNull()
  })

  it('returns the user ID for a valid JWT with sub claim', () => {
    const token = buildToken({ sub: 'user-abc-123' })
    expect(getUserIdFromToken(token)).toBe('user-abc-123')
  })

  it('handles base64url encoding with - and _ characters', () => {
    // Manually craft a token whose base64url payload contains - and _
    const payload = { sub: 'user-id-with-special-chars' }
    const header = btoa(JSON.stringify({ alg: 'HS256' }))
    // Standard base64 → base64url: replace + with -, / with _
    const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const token = `${header}.${body}.sig`

    expect(getUserIdFromToken(token)).toBe('user-id-with-special-chars')
  })
})
