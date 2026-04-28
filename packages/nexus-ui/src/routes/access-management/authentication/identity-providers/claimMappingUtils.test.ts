import { describe, expect, it, vi } from 'vitest'

import { autoSelectClaimMappings } from './claimMappingUtils'

describe('autoSelectClaimMappings', () => {
  const defaultMapping = {
    subject: 'sub',
    email: 'email',
    username: 'preferred_username',
    fullName: 'name',
    groups: null,
  }

  it('does not change values that are already supported', () => {
    const setFieldValue = vi.fn()
    const claimsSupported = ['sub', 'email', 'preferred_username', 'name']
    const claimAliases = {}

    autoSelectClaimMappings(claimsSupported, claimAliases, defaultMapping, setFieldValue)

    expect(setFieldValue).not.toHaveBeenCalled()
  })

  it('selects alias when current value is not supported', () => {
    const setFieldValue = vi.fn()
    const claimsSupported = ['sub', 'mail', 'upn', 'displayName']
    const claimAliases = {
      email: ['mail', 'email_address'],
      username: ['upn', 'preferred_username'],
      full_name: ['displayName', 'name'],
    }

    autoSelectClaimMappings(claimsSupported, claimAliases, defaultMapping, setFieldValue)

    expect(setFieldValue).toHaveBeenCalledWith('claimMapping.email', 'mail')
    expect(setFieldValue).toHaveBeenCalledWith('claimMapping.username', 'upn')
    expect(setFieldValue).toHaveBeenCalledWith('claimMapping.fullName', 'displayName')
  })

  it('picks the first matching alias', () => {
    const setFieldValue = vi.fn()
    const claimsSupported = ['sub', 'email_address', 'mail']
    const claimAliases = {
      email: ['mail', 'email_address'],
    }

    autoSelectClaimMappings(claimsSupported, claimAliases, defaultMapping, setFieldValue)

    expect(setFieldValue).toHaveBeenCalledWith('claimMapping.email', 'mail')
  })

  it('does not set a value when no alias matches', () => {
    const setFieldValue = vi.fn()
    const claimsSupported = ['sub']
    const claimAliases = {
      email: ['mail'],
    }

    autoSelectClaimMappings(claimsSupported, claimAliases, defaultMapping, setFieldValue)

    const emailCalls = setFieldValue.mock.calls.filter((call) => call[0] === 'claimMapping.email')
    expect(emailCalls).toHaveLength(0)
  })

  it('handles null groups claim correctly', () => {
    const setFieldValue = vi.fn()
    const claimsSupported = ['sub', 'email', 'preferred_username', 'name', 'groups']
    const claimAliases = {
      groups: ['groups', 'roles'],
    }

    autoSelectClaimMappings(claimsSupported, claimAliases, defaultMapping, setFieldValue)

    expect(setFieldValue).toHaveBeenCalledWith('claimMapping.groups', 'groups')
  })

  it('skips groups if already set and supported', () => {
    const setFieldValue = vi.fn()
    const claimsSupported = ['sub', 'email', 'preferred_username', 'name', 'groups']
    const claimAliases = { groups: ['groups'] }
    const mapping = { ...defaultMapping, groups: 'groups' }

    autoSelectClaimMappings(claimsSupported, claimAliases, mapping, setFieldValue)

    const groupsCalls = setFieldValue.mock.calls.filter((call) => call[0] === 'claimMapping.groups')
    expect(groupsCalls).toHaveLength(0)
  })

  it('handles empty claimsSupported', () => {
    const setFieldValue = vi.fn()
    autoSelectClaimMappings([], {}, defaultMapping, setFieldValue)

    expect(setFieldValue).not.toHaveBeenCalled()
  })
})
