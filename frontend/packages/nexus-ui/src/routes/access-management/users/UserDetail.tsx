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
  Tab,
  TabTitleText,
} from '@patternfly/react-core'
import { RhUiEditIcon } from '@patternfly/react-icons'
import { useMemo } from 'react'

import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsUserDetail, breadcrumbsUserDetailEarlyShell } from '../../../app/breadcrumbBuilders'
import { authClient } from '../../../client'
import { DisabledWithTooltip } from '../../../components/DisabledWithTooltip'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxListPanel, NxListPanelTabs } from '../../../components/panels/list/NxListPanel'
import { NxLoadingState } from '../../../components/states/NxLoadingState'
import { useQueryState } from '../../../components/states/useQueryState'
import { navigate } from '../../../hooks/routing/navigate'
import { useParams } from '../../../hooks/routing/useParams'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { useDocLink } from '../../../utils/docs/useDocLink'
import { isValidUUID } from '../../../utils/generateUUID'
import { accessClient } from '../../access/accessClient'
import { CheckAccessView } from '../../access/CheckAccessView'
import { MyPermissionsView } from '../../access/MyPermissionsView'
import { useResourceActions } from '../../access/useResourceActions'
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

type UserTab = 'details' | 'groups' | 'identities' | 'roles' | 'permissions' | 'check-access'

function computeVisibleTabs(
  canReadGroups: boolean,
  canReadIdentities: boolean,
  canReadAssignments: boolean,
  isOwnProfile: boolean,
  isLoading: boolean
): UserTab[] {
  const tabs: UserTab[] = ['details']
  if (isLoading || canReadGroups) tabs.push('groups')
  if (isLoading || canReadIdentities) tabs.push('identities')
  if (isLoading || canReadAssignments) tabs.push('roles')
  if (isOwnProfile) tabs.push('permissions', 'check-access')
  return tabs
}

function UserCheckAccessTab() {
  const { resourceTypes, actionsByResource, isLoading, error, refetch } = useResourceActions()
  const queryState = useQueryState(
    { isPending: isLoading, error },
    { title: 'Error loading resource actions', onRetry: () => detachPromise(refetch()) }
  )
  if (queryState) return queryState
  return <CheckAccessView resourceTypes={resourceTypes} actionsByResource={actionsByResource} />
}

function UserDetailTabBar({
  basePath,
  validTabs,
  groupCount,
  identitiesCount,
  roleAssignmentCount,
}: Readonly<{
  basePath: string
  validTabs: UserTab[]
  groupCount: number
  identitiesCount: number
  roleAssignmentCount: number
}>) {
  return (
    <NxListPanelTabs basePath={basePath} defaultTab="details" validTabs={validTabs} aria-label="User details">
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
              Identities <Badge isRead>{identitiesCount}</Badge>
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
      {validTabs.includes('permissions') && (
        <Tab eventKey="permissions" title={<TabTitleText>Permissions</TabTitleText>} />
      )}
      {validTabs.includes('check-access') && (
        <Tab eventKey="check-access" title={<TabTitleText>Check my access</TabTitleText>} />
      )}
    </NxListPanelTabs>
  )
}

function UserDetailTabContent({
  activeTab,
  validTabs,
  userData,
  userId,
  currentUserId,
  identitiesData,
  isOwnProfile,
}: Readonly<{
  activeTab: string
  validTabs: UserTab[]
  userData: User
  userId: string
  currentUserId: string | undefined
  identitiesData: Pick<UserIdentity, 'provider_name' | 'identity_provider_id'>[]
  isOwnProfile: boolean
}>) {
  return (
    <>
      {activeTab === 'details' && <UserDetailsTab user={userData} identities={identitiesData} />}
      {activeTab === 'groups' && validTabs.includes('groups') && <UserGroupsPanel userId={userId} />}
      {activeTab === 'identities' && validTabs.includes('identities') && (
        <UserIdentitiesPanel
          userId={userId}
          currentUserId={currentUserId}
          isBuiltinUser={!!userData.is_builtin}
          isLocalUser={userData.auth_type === AUTH_TYPE_LOCAL}
          hasPassword={userData.auth_type === AUTH_TYPE_LOCAL}
        />
      )}
      {activeTab === 'roles' && validTabs.includes('roles') && (
        <RoleAssignmentsPanel principalType="user" principalId={userId} />
      )}
      {activeTab === 'permissions' && isOwnProfile && <MyPermissionsView />}
      {activeTab === 'check-access' && isOwnProfile && <UserCheckAccessTab />}
    </>
  )
}

export type UserDetailProps = {
  /**
   * When true, the page renders as "My Profile" — userId is fetched from
   * `/auth/me`, breadcrumbs are omitted, and the back button navigates to
   * the dashboard instead of the Users list.
   */
  isMyProfile?: boolean
}

function useUserDetailRouting(isMyProfile: boolean | undefined) {
  const { userId: urlUserId } = useParams<{ userId: string }>()
  const meQuery = authClient.useQuery('get', '/auth/me')
  const meUserId = meQuery.data?.id

  const userId = isMyProfile ? meUserId : urlUserId
  const basePath = isMyProfile
    ? AppRoute.MyProfile.Root
    : AppRoute.AccessManagement.UserDetail.replace(':userId', userId ?? '')

  return { userId, basePath, meQuery }
}

export function UserDetail({ isMyProfile }: Readonly<UserDetailProps> = {}) {
  const usersDocLink = useDocLink('users')
  const docLink = isMyProfile ? undefined : usersDocLink
  const { userId, basePath, meQuery } = useUserDetailRouting(isMyProfile)
  const [activeTab] = useUrlTab<UserTab>(basePath)

  const userPermissions = useUserPermissions()
  const { userQuery, groupCount, identitiesData, roleAssignmentCount, currentUserId } = useUserDetailData(userId)
  const {
    canReadGroups,
    canReadIdentities,
    canReadAssignments,
    isLoading: permissionsLoading,
  } = useUserDetailPermissions(userId)

  const isOwnProfile = !!userId && !!currentUserId && userId === currentUserId

  const validTabs = useMemo(
    () => computeVisibleTabs(canReadGroups, canReadIdentities, canReadAssignments, isOwnProfile, permissionsLoading),
    [canReadGroups, canReadIdentities, canReadAssignments, isOwnProfile, permissionsLoading]
  )

  const navigateBack = () => navigate(isMyProfile ? AppRoute.Workflows.Root : AppRoute.AccessManagement.Users)
  const navigateEdit = () => navigate(AppRoute.AccessManagement.EditUser.replace(':userId', userId ?? ''))

  const refetchUser = userQuery.refetch
  const queryState = useQueryState(userQuery, {
    title: 'Error loading user',
    onRetry: () => {
      detachPromise(refetchUser())
    },
  })

  const shellTitle = isMyProfile ? 'My Profile' : 'User'
  const shellBreadcrumbs = isMyProfile ? [] : breadcrumbsUserDetailEarlyShell()

  if (isMyProfile && meQuery.isPending) {
    return (
      <DetailPageShell title="My Profile" breadcrumbs={[]}>
        <NxLoadingState />
      </DetailPageShell>
    )
  }

  if (userQuery.error) {
    return (
      <DetailPageShell title={shellTitle} breadcrumbs={shellBreadcrumbs}>
        <UserNotFoundState
          onBack={navigateBack}
          backLabel={isMyProfile ? 'Back to workflows' : undefined}
          onRetry={() => {
            detachPromise(refetchUser())
          }}
        />
      </DetailPageShell>
    )
  }

  if (queryState) {
    return (
      <DetailPageShell title={shellTitle} breadcrumbs={shellBreadcrumbs}>
        {queryState}
      </DetailPageShell>
    )
  }

  const userData = userQuery.data
  if (!userData) return null

  const displayName = userDisplayName(userData) || userData.username
  const pageTitle = isMyProfile ? 'My Profile' : displayName
  const userBreadcrumbs = isMyProfile ? [] : breadcrumbsUserDetail(displayName, basePath, activeTab)

  return (
    <NxPage>
      <NxPageHeader
        title={pageTitle}
        docLink={docLink}
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
      <NxPageBody>
        <NxListPanel>
          <UserDetailTabBar
            basePath={basePath}
            validTabs={validTabs}
            groupCount={groupCount}
            identitiesCount={identitiesData.length}
            roleAssignmentCount={roleAssignmentCount}
          />
          <UserDetailTabContent
            activeTab={activeTab}
            validTabs={validTabs}
            userData={userData}
            userId={userId ?? ''}
            currentUserId={currentUserId}
            identitiesData={identitiesData}
            isOwnProfile={isOwnProfile}
          />
        </NxListPanel>
      </NxPageBody>
    </NxPage>
  )
}
