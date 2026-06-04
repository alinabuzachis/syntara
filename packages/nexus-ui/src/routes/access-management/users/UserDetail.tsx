import type { User } from '@ansible/nexus-contracts'
import {
  Badge,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  FlexItem,
  Label,
  LabelGroup,
  StackItem,
  Tab,
  TabTitleText,
} from '@patternfly/react-core'
import { RhUiEditIcon } from '@patternfly/react-icons'
import { useMemo } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsUserDetail, breadcrumbsUserDetailEarlyShell } from '../../../app/breadcrumbBuilders'
import { authClient } from '../../../client'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxUrlTabs } from '../../../components/tabs/NxUrlTabs'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { isValidUUID } from '../../../utils/generateUUID'
import { accessClient } from '../../access/accessClient'
import { AUTH_TYPE_LOCAL } from '../adminConstants'
import { DetailPageShell } from '../DetailPageShell'
import { DisabledBadge } from '../DisabledBadge'
import { RoleAssignmentsPanel } from '../RoleAssignmentsPanel'
import { useUserPermissions } from '../useUserPermissions'

import type { UserIdentity } from './identityUtils'
import { computeGroupCount, computeRoleAssignmentCount } from './userDetailUtils'
import { userDisplayName } from './userDisplayName'
import { UserGroupsPanel } from './UserGroupsPanel'
import { UserIdentitiesPanel } from './UserIdentitiesPanel'
import { UserNotFoundState } from './UserNotFoundState'
import { useUserDetailPermissions } from './useUserDetailPermissions'

function useUserDetailData(userId: string | undefined) {
  const isValidId = !!userId && isValidUUID(userId)
  const safeUserId = userId ?? ''

  const userQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}',
    { params: { path: { user_id: safeUserId } } },
    { enabled: isValidId, retry: false }
  )

  const groupsQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}/groups',
    { params: { path: { user_id: safeUserId } } },
    { enabled: isValidId }
  )

  const identitiesQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}/identities',
    { params: { path: { user_id: safeUserId } } },
    { enabled: isValidId }
  )

  const roleAssignmentsQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}/role_assignments',
    { params: { path: { user_id: safeUserId } } },
    { enabled: isValidId }
  )

  const meQuery = authClient.useQuery('get', '/auth/me')

  const groupCount = computeGroupCount(groupsQuery.data)
  const identitiesData = identitiesQuery.data?.resources ?? []
  let roleAssignmentCount = 0
  if (roleAssignmentsQuery.data) {
    roleAssignmentCount = computeRoleAssignmentCount(roleAssignmentsQuery.data)
  }

  return {
    userQuery,
    groupCount,
    identitiesData,
    roleAssignmentCount,
    currentUserId: meQuery.data?.id,
  }
}

function UserDetailsTab({
  user,
  identities,
}: {
  user: User
  identities: Pick<UserIdentity, 'provider_name' | 'identity_provider_id'>[]
}) {
  const { first_name, last_name } = user

  const isLocal = user.auth_type === AUTH_TYPE_LOCAL
  const uniqueProviders = identities.reduce<Map<string, string>>((acc, i) => {
    if (!acc.has(i.identity_provider_id)) {
      acc.set(i.identity_provider_id, i.provider_name ?? '')
    }
    return acc
  }, new Map())
  // Local users always show exactly one provider: 'Local'
  const totalProviders = isLocal ? 1 : uniqueProviders.size
  const providerLabel = totalProviders > 1 ? 'Identity Providers' : 'Identity Provider'

  return (
    <DescriptionList isHorizontal isAutoColumnWidths>
      <DescriptionListGroup>
        <DescriptionListTerm>Username</DescriptionListTerm>
        <DescriptionListDescription>{user.username}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>User ID</DescriptionListTerm>
        <DescriptionListDescription>
          <code style={{ fontSize: 'var(--pf-t--global--font--size--sm)' }}>{user.id}</code>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>First Name</DescriptionListTerm>
        <DescriptionListDescription>{first_name}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Last Name</DescriptionListTerm>
        <DescriptionListDescription>{last_name}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Email</DescriptionListTerm>
        <DescriptionListDescription>{user.email}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>{providerLabel}</DescriptionListTerm>
        <DescriptionListDescription>
          {totalProviders === 0 ? (
            '-'
          ) : (
            <LabelGroup>
              {isLocal && <Label isCompact>Local</Label>}
              {!isLocal &&
                [...uniqueProviders.entries()]
                  .sort(([, a], [, b]) => a.localeCompare(b))
                  .map(([id, name]) => (
                    <Label
                      key={id}
                      isCompact
                      onClick={() =>
                        navigate(
                          AppRoute.SystemAdministration.Authentication.IdentityProviderDetail.replace(
                            ':providerId',
                            id
                          ).replace('/:tab?', '')
                        )
                      }
                    >
                      {name}
                    </Label>
                  ))}
            </LabelGroup>
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Last Login</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(user.last_login)}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Created</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(user.created_at)}</DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}

function EditUserButton({
  canUpdate,
  tooltip,
  onClick,
}: Readonly<{ canUpdate: boolean; tooltip: string; onClick: () => void }>) {
  return (
    <DisabledWithTooltip isDisabled={!canUpdate} content={tooltip}>
      <Button
        variant="secondary"
        icon={<RhUiEditIcon />}
        isAriaDisabled={!canUpdate}
        onClick={canUpdate ? onClick : undefined}
      >
        Edit user
      </Button>
    </DisabledWithTooltip>
  )
}

type UserTab = 'details' | 'groups' | 'identities' | 'roles'
const ALL_USER_TABS: UserTab[] = ['details', 'groups', 'identities', 'roles']

function computeVisibleTabs(
  canReadGroups: boolean,
  canReadIdentities: boolean,
  canReadAssignments: boolean,
  isLoading: boolean
): UserTab[] {
  if (isLoading) return ALL_USER_TABS
  const hidden = new Set<UserTab>()
  if (!canReadGroups) hidden.add('groups')
  if (!canReadIdentities) hidden.add('identities')
  if (!canReadAssignments) hidden.add('roles')
  if (hidden.size === 0) return ALL_USER_TABS
  return ALL_USER_TABS.filter((tab) => !hidden.has(tab))
}

export function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const basePath = AppRoute.AccessManagement.UserDetail.replace(':userId', userId ?? '')
  const [activeTab] = useUrlTab<UserTab>(basePath)

  const userPermissions = useUserPermissions()
  const { userQuery, groupCount, identitiesData, roleAssignmentCount, currentUserId } = useUserDetailData(userId)
  const {
    canReadUsers,
    canReadGroups,
    canReadIdentities,
    canReadAssignments,
    isLoading: permissionsLoading,
  } = useUserDetailPermissions(userId)

  const validTabs = useMemo(
    () => computeVisibleTabs(canReadGroups, canReadIdentities, canReadAssignments, permissionsLoading),
    [canReadGroups, canReadIdentities, canReadAssignments, permissionsLoading]
  )

  const navigateBack = () => navigate(AppRoute.AccessManagement.Users)
  const navigateEdit = () => navigate(AppRoute.AccessManagement.EditUser.replace(':userId', userId ?? ''))

  const userData = userQuery.data
  const refetchUser = userQuery.refetch
  const queryState = useQueryState(userQuery, {
    title: 'Error loading user',
    onRetry: () => {
      detachPromise(refetchUser())
    },
  })

  const breadcrumbOptions = { showParentCrumbs: canReadUsers }
  const shellBreadcrumbs = breadcrumbsUserDetailEarlyShell(breadcrumbOptions)

  if (userQuery.error) {
    return (
      <DetailPageShell title="User" breadcrumbs={shellBreadcrumbs}>
        <UserNotFoundState
          onBack={navigateBack}
          onRetry={() => {
            detachPromise(refetchUser())
          }}
        />
      </DetailPageShell>
    )
  }

  if (queryState) {
    return (
      <DetailPageShell title="User" breadcrumbs={shellBreadcrumbs}>
        {queryState}
      </DetailPageShell>
    )
  }

  if (!userData) return null

  const displayName = userDisplayName(userData) || userData.username
  const userBreadcrumbs = breadcrumbsUserDetail(displayName, basePath, activeTab, breadcrumbOptions)

  return (
    <NxPage>
      <NxPageHeader
        title={displayName}
        breadcrumbs={userBreadcrumbs}
        titleAddons={
          !userData.is_enabled ? (
            <FlexItem>
              <DisabledBadge />
            </FlexItem>
          ) : undefined
        }
        toolbar={
          <EditUserButton
            canUpdate={userPermissions.canUpdate}
            tooltip={userPermissions.tooltips.update}
            onClick={navigateEdit}
          />
        }
      />
      <StackItem style={{ flexShrink: 0 }}>
        <NxUrlTabs basePath={basePath} defaultTab="details" validTabs={validTabs} aria-label="User details">
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          {validTabs.includes('groups') && (
            <Tab
              eventKey="groups"
              title={
                <TabTitleText>
                  Groups <Badge isRead>{groupCount}</Badge>
                </TabTitleText>
              }
            />
          )}
          {validTabs.includes('identities') && (
            <Tab
              eventKey="identities"
              title={
                <TabTitleText>
                  Identities <Badge isRead>{identitiesData.length}</Badge>
                </TabTitleText>
              }
            />
          )}
          {validTabs.includes('roles') && (
            <Tab
              eventKey="roles"
              title={
                <TabTitleText>
                  Assignments <Badge isRead>{roleAssignmentCount}</Badge>
                </TabTitleText>
              }
            />
          )}
        </NxUrlTabs>
      </StackItem>
      <NxPageBody>
        <NxPanel isFullHeight>
          {activeTab === 'details' && <UserDetailsTab user={userData} identities={identitiesData} />}
          {activeTab === 'groups' && validTabs.includes('groups') && <UserGroupsPanel userId={userId ?? ''} />}
          {activeTab === 'identities' && validTabs.includes('identities') && (
            <UserIdentitiesPanel
              userId={userId ?? ''}
              currentUserId={currentUserId}
              isBuiltinUser={!!userData.is_builtin}
              isLocalUser={userData.auth_type === AUTH_TYPE_LOCAL}
              hasPassword={userData.auth_type === AUTH_TYPE_LOCAL}
            />
          )}
          {activeTab === 'roles' && validTabs.includes('roles') && (
            <RoleAssignmentsPanel principalType="user" principalId={userId ?? ''} />
          )}
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
