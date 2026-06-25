import { describe, expect, it } from 'vitest'

import { AppRoute } from './AppRoute'
import {
  breadcrumbsAccessManagementHub,
  breadcrumbsApprovalsPage,
  breadcrumbsCreateUser,
  breadcrumbsCredentialEarlyShell,
  breadcrumbsEditUser,
  breadcrumbsGroupDetailEarlyShell,
  breadcrumbsIdentityProviderAdd,
  breadcrumbsIdentityProviderDetailEarlyShell,
  breadcrumbsIdentityProviderEdit,
  breadcrumbsIdentityProviderFormLoading,
  breadcrumbsIdentityProvidersPage,
  breadcrumbsIntegrationConfigure,
  breadcrumbsIdentityProviderDetail,
  breadcrumbsProjectDetailEarlyShell,
  breadcrumbsCredentialDetail,
  breadcrumbsGroupDetail,
  breadcrumbsProjectDetail,
  breadcrumbsSettingsCategory,
  breadcrumbsSettingsPage,
  breadcrumbsUserDetail,
  breadcrumbsUserDetailEarlyShell,
  breadcrumbsUserFormLoading,
} from './breadcrumbBuilders'

describe('breadcrumbBuilders', () => {
  it('omits the default details tab segment for project detail', () => {
    const items = breadcrumbsProjectDetail(
      'My project',
      '/system-administration/access-management/projects/uuid-1',
      'details'
    )
    expect(items).toHaveLength(3)
    expect(items[2]).toEqual({ label: 'My project' })
    expect(items[2]).not.toHaveProperty('href')
  })

  it('includes a tab segment when not on the default details tab', () => {
    const base = '/system-administration/access-management/projects/uuid-1'
    const items = breadcrumbsProjectDetail('My project', base, 'role-assignments')
    expect(items).toHaveLength(4)
    expect(items[2]).toEqual({ label: 'My project', href: base })
    expect(items[3]).toEqual({ label: 'Assignments' })
  })

  it('omits default details tab for user, group, and identity provider detail', () => {
    expect(breadcrumbsUserDetail('alice', '/system-administration/access-management/users/u1', 'details')).toEqual([
      { label: 'Access management', href: AppRoute.AccessManagement.Root },
      { label: 'Users', href: AppRoute.AccessManagement.Users },
      { label: 'alice' },
    ])
    expect(breadcrumbsGroupDetail('g1', '/system-administration/access-management/groups/g1', 'details')).toEqual([
      { label: 'Access management', href: AppRoute.AccessManagement.Root },
      { label: 'Groups', href: AppRoute.AccessManagement.Groups },
      { label: 'g1' },
    ])
    expect(
      breadcrumbsIdentityProviderDetail(
        'Okta',
        '/system-administration/authentication/identity-providers/p1',
        'details'
      )
    ).toEqual([
      { label: 'Identity providers', href: AppRoute.SystemAdministration.Authentication.Root },
      { label: 'Okta' },
    ])
  })

  it('omits Details segment for credential detail on the default tab', () => {
    const items = breadcrumbsCredentialDetail('cred-1', 'Prod key', 'details')
    expect(items).toHaveLength(3)
    expect(items[2]).toEqual({ label: 'Prod key' })
  })

  it('adds Workflows segment when on the workflows tab', () => {
    const items = breadcrumbsCredentialDetail('cred-1', 'Prod key', 'workflows')
    expect(items).toHaveLength(4)
    expect(items[2]).toMatchObject({
      label: 'Prod key',
      href: AppRoute.Configuration.Credentials.Detail.replace(':credentialId', 'cred-1'),
    })
    expect(items[3]).toEqual({ label: 'Workflows' })
  })

  it('covers hub, forms, settings, integrations, approvals, and loading shells', () => {
    expect(breadcrumbsAccessManagementHub('Policies')).toEqual([
      { label: 'Access management', href: AppRoute.AccessManagement.Root },
      { label: 'Policies' },
    ])
    expect(breadcrumbsIdentityProvidersPage()).toEqual([{ label: 'Identity providers' }])
    expect(breadcrumbsCreateUser()).toHaveLength(3)
    expect(breadcrumbsEditUser('Jane', '/system-administration/access-management/users/u1')).toHaveLength(4)

    expect(breadcrumbsIdentityProviderAdd()).toHaveLength(2)
    expect(breadcrumbsIdentityProviderEdit('Auth0', '/path')).toHaveLength(3)

    expect(breadcrumbsSettingsPage()).toEqual([{ label: 'Settings' }])
    expect(breadcrumbsSettingsCategory('AI / LLM')).toHaveLength(2)

    expect(breadcrumbsApprovalsPage('Loading')).toHaveLength(2)

    expect(breadcrumbsIntegrationConfigure()).toHaveLength(3)

    expect(breadcrumbsCredentialEarlyShell('…')).toHaveLength(3)

    expect(breadcrumbsUserFormLoading('Saving')).toHaveLength(3)
    expect(breadcrumbsUserDetailEarlyShell()).toHaveLength(3)
    expect(breadcrumbsGroupDetailEarlyShell()).toHaveLength(3)
    expect(breadcrumbsProjectDetailEarlyShell()).toHaveLength(3)
    expect(breadcrumbsIdentityProviderFormLoading('…')).toHaveLength(2)
    expect(breadcrumbsIdentityProviderDetailEarlyShell()).toHaveLength(2)
  })

  it('includes non-default tab segments for entity detail builders', () => {
    expect(breadcrumbsUserDetail('u', '/system-administration/access-management/users/u1', 'groups').at(-1)).toEqual({
      label: 'Groups',
    })
    expect(breadcrumbsGroupDetail('g', '/system-administration/access-management/groups/g1', 'members').at(-1)).toEqual(
      { label: 'Members' }
    )
    expect(
      breadcrumbsProjectDetail('p', '/system-administration/access-management/projects/p1', 'role-assignments').at(-1)
    ).toEqual({
      label: 'Assignments',
    })
    expect(
      breadcrumbsIdentityProviderDetail(
        'Idp',
        '/system-administration/authentication/identity-providers/p1',
        'group-mapping'
      ).at(-1)
    ).toEqual({ label: 'Group mapping' })
  })
})
