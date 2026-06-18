import { describe, expect, it } from 'vitest'

import {
  identityProviderDetailBasePath,
  identityProviderGroupMappingEditPath,
  identityProviderGroupMappingTabPath,
} from './identityProviderPaths'

const PROVIDER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

describe('identityProviderPaths', () => {
  it('builds detail base path', () => {
    expect(identityProviderDetailBasePath(PROVIDER_ID)).toBe(
      `/system-administration/authentication/identity-providers/${PROVIDER_ID}`
    )
  })

  it('builds group mapping tab path', () => {
    expect(identityProviderGroupMappingTabPath(PROVIDER_ID)).toBe(
      `/system-administration/authentication/identity-providers/${PROVIDER_ID}/group-mapping`
    )
  })

  it('builds group mapping edit path', () => {
    expect(identityProviderGroupMappingEditPath(PROVIDER_ID)).toBe(
      `/system-administration/authentication/identity-providers/${PROVIDER_ID}/group-mapping/edit`
    )
  })
})
