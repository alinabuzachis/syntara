import { describe, expect, it } from 'vitest'

import {
  identityProviderAddSchema,
  identityProviderDefaults,
  identityProviderEditSchema,
} from './identityProviderFormSchema'

const validAddData = {
  name: 'My Provider',
  enabled: true,
  autoDiscovery: true,
  issuerUrl: 'https://auth.example.com',
  clientId: 'my-client-id',
  clientSecret: 'my-client-secret',
  scopes: 'openid profile email',
  authorizationEndpoint: '',
  tokenEndpoint: '',
  jwksUri: '',
  userinfoEndpoint: '',
} as const

/** Helper that returns flat field-level error paths from a safeParse result. */
function getErrorPaths(result: { success: boolean; error?: { issues: readonly { path: PropertyKey[] }[] } }) {
  if (result.success || !result.error) return []
  return result.error.issues.map((i: { path: PropertyKey[] }) => i.path.map(String).join('.'))
}

describe('identityProviderAddSchema', () => {
  it('validates complete valid data', () => {
    const result = identityProviderAddSchema.safeParse(validAddData)

    expect(result.success).toBe(true)
  })

  it('rejects missing name', () => {
    const result = identityProviderAddSchema.safeParse({ ...validAddData, name: '' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('name')
  })

  it('rejects missing clientSecret', () => {
    const result = identityProviderAddSchema.safeParse({ ...validAddData, clientSecret: '' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('clientSecret')
  })

  it('rejects invalid issuerUrl', () => {
    const result = identityProviderAddSchema.safeParse({ ...validAddData, issuerUrl: 'not-a-url' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('issuerUrl')
  })

  it('strips trailing slash from issuerUrl', () => {
    const result = identityProviderAddSchema.safeParse({
      ...validAddData,
      issuerUrl: 'https://auth.example.com///',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.issuerUrl).toBe('https://auth.example.com')
    }
  })

  it('requires manual endpoints when autoDiscovery is false', () => {
    const result = identityProviderAddSchema.safeParse({
      ...validAddData,
      autoDiscovery: false,
      authorizationEndpoint: '',
      tokenEndpoint: '',
      jwksUri: '',
    })

    expect(result.success).toBe(false)
    const paths = getErrorPaths(result)
    expect(paths).toContain('authorizationEndpoint')
    expect(paths).toContain('tokenEndpoint')
    expect(paths).toContain('jwksUri')
  })

  it('allows empty manual endpoints when autoDiscovery is true', () => {
    const result = identityProviderAddSchema.safeParse({
      ...validAddData,
      autoDiscovery: true,
      authorizationEndpoint: '',
      tokenEndpoint: '',
      jwksUri: '',
      userinfoEndpoint: '',
    })

    expect(result.success).toBe(true)
  })

  it('accepts valid manual endpoints when autoDiscovery is false', () => {
    const result = identityProviderAddSchema.safeParse({
      ...validAddData,
      autoDiscovery: false,
      authorizationEndpoint: 'https://auth.example.com/authorize',
      tokenEndpoint: 'https://auth.example.com/token',
      jwksUri: 'https://auth.example.com/.well-known/jwks.json',
      userinfoEndpoint: 'https://auth.example.com/userinfo',
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid URL in manual endpoint fields', () => {
    const result = identityProviderAddSchema.safeParse({
      ...validAddData,
      autoDiscovery: false,
      authorizationEndpoint: 'not-a-url',
      tokenEndpoint: 'https://auth.example.com/token',
      jwksUri: 'https://auth.example.com/.well-known/jwks.json',
    })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('authorizationEndpoint')
  })

  it('rejects missing clientId', () => {
    const result = identityProviderAddSchema.safeParse({ ...validAddData, clientId: '' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('clientId')
  })

  it('rejects missing scopes', () => {
    const result = identityProviderAddSchema.safeParse({ ...validAddData, scopes: '' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('scopes')
  })
})

describe('identityProviderEditSchema', () => {
  it('allows empty clientSecret', () => {
    const result = identityProviderEditSchema.safeParse({ ...validAddData, clientSecret: '' })

    expect(result.success).toBe(true)
  })

  it('still requires name', () => {
    const result = identityProviderEditSchema.safeParse({ ...validAddData, name: '', clientSecret: '' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('name')
  })

  it('still requires issuerUrl', () => {
    const result = identityProviderEditSchema.safeParse({ ...validAddData, issuerUrl: '', clientSecret: '' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('issuerUrl')
  })

  it('still requires clientId', () => {
    const result = identityProviderEditSchema.safeParse({ ...validAddData, clientId: '', clientSecret: '' })

    expect(result.success).toBe(false)
    expect(getErrorPaths(result)).toContain('clientId')
  })

  it('requires manual endpoints when autoDiscovery is false', () => {
    const result = identityProviderEditSchema.safeParse({
      ...validAddData,
      clientSecret: '',
      autoDiscovery: false,
      authorizationEndpoint: '',
      tokenEndpoint: '',
      jwksUri: '',
    })

    expect(result.success).toBe(false)
    const paths = getErrorPaths(result)
    expect(paths).toContain('authorizationEndpoint')
    expect(paths).toContain('tokenEndpoint')
    expect(paths).toContain('jwksUri')
  })
})

describe('identityProviderDefaults', () => {
  it('has expected default values', () => {
    expect(identityProviderDefaults).toEqual({
      name: '',
      enabled: false,
      autoDiscovery: true,
      issuerUrl: '',
      clientId: '',
      clientSecret: '',
      scopes: 'openid profile email',
      authorizationEndpoint: '',
      tokenEndpoint: '',
      jwksUri: '',
      userinfoEndpoint: '',
    })
  })

  it('has autoDiscovery enabled by default', () => {
    expect(identityProviderDefaults.autoDiscovery).toBe(true)
  })

  it('has provider disabled by default', () => {
    expect(identityProviderDefaults.enabled).toBe(false)
  })
})
