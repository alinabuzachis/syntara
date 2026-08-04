import { describe, expect, it } from 'vitest'

import { resolveAuthError, resolveLinkError } from './authErrorMessages'

describe('resolveAuthError', () => {
  it.each([
    ['missing_code', 'Missing authorization code'],
    ['state_expired', 'Login session expired. Please try again.'],
    ['provider_unavailable', 'Identity provider not available'],
    ['discovery_failed', 'Failed to connect to identity provider'],
    ['auth_failed', 'Authentication failed. Please try again.'],
    ['user_failed', 'Unable to sign in. Contact your administrator.'],
    [
      'tls_verify_failed',
      'TLS certificate verification failed. If the provider uses a self-signed certificate, enable "Skip TLS certificate verification" in the identity provider settings.',
    ],
    [
      'no_group_match',
      'Access denied. Your identity provider groups do not match any configured group mappings. Contact your administrator.',
    ],
    ['idp_logout_failed', 'Logged out successfully, but could not log out of the identity provider.'],
    [
      'email_already_linked',
      'This email is already associated with an existing account. Please sign in with your original authentication method and link this identity provider via the Identities tab on your user profile page.',
    ],
  ])('maps known code "%s" to its display message', (code, expected) => {
    expect(resolveAuthError(code).message).toBe(expected)
  })

  it('returns isLogoutFailure=true only for idp_logout_failed', () => {
    expect(resolveAuthError('idp_logout_failed').isLogoutFailure).toBe(true)
    expect(resolveAuthError('auth_failed').isLogoutFailure).toBe(false)
    expect(resolveAuthError('state_expired').isLogoutFailure).toBe(false)
  })

  it('returns generic fallback for unknown error codes', () => {
    const result = resolveAuthError('some_unknown_code')
    expect(result.message).toBe('Authentication failed. Please try again.')
    expect(result.isLogoutFailure).toBe(false)
  })

  it('returns generic fallback for arbitrary attacker-crafted strings', () => {
    const result = resolveAuthError('Your account has been compromised! Call 1-800-SCAM')
    expect(result.message).toBe('Authentication failed. Please try again.')
    expect(result.isLogoutFailure).toBe(false)
  })

  it('returns generic fallback for empty string', () => {
    const result = resolveAuthError('')
    expect(result.message).toBe('Authentication failed. Please try again.')
    expect(result.isLogoutFailure).toBe(false)
  })

  it('returns generic fallback for HTML injection attempts', () => {
    const result = resolveAuthError('<script>alert(1)</script>')
    expect(result.message).toBe('Authentication failed. Please try again.')
    expect(result.isLogoutFailure).toBe(false)
  })
})

describe('resolveLinkError', () => {
  it('maps known code "link_failed" to its display message', () => {
    expect(resolveLinkError('link_failed')).toBe('Failed to link identity. Please try again.')
  })

  it('maps known code "identity_already_linked" to its display message', () => {
    expect(resolveLinkError('identity_already_linked')).toBe('This identity is already linked to another user.')
  })

  it('returns generic fallback for unknown error codes', () => {
    expect(resolveLinkError('unknown_code')).toBe('Failed to link identity. Please try again.')
  })

  it('returns generic fallback for arbitrary strings', () => {
    expect(resolveLinkError('Something went wrong')).toBe('Failed to link identity. Please try again.')
  })
})
