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
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsUserDetail, breadcrumbsUserDetailEarlyShell } from '../../../app/breadcrumbBuilders'
import { authClient } from '../../../client'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { UrlTabs } from '../../../components/UrlTabs'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { isValidUUID } from '../../../utils/generateUUID'
import { accessClient } from '../../access/accessClient'
import { AUTH_TYPE_LOCAL } from '../adminConstants'
import { DetailPageShell } from '../DetailPageShell'
import { DisabledBadge } from '../DisabledBadge'
import { RoleAssignmentsPanel } from '../RoleAssignmentsPanel'
import { splitFullName } from '../userFormSchema'

import type { UserIdentity } from './identityUtils'
import { computeGroupCount, computeRoleAssignmentCount } from './userDetailUtils'
import { UserGroupsPanel } from './UserGroupsPanel'
import { UserIdentitiesPanel } from './UserIdentitiesPanel'
import { UserNotFoundState } from './UserNotFoundState'

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
  const { first_name, last_name } = splitFullName(user.full_name ?? '')

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
                [...uniqueProviders.entries()].map(([id, name]) => (
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

type UserTab = 'details' | 'groups' | 'identities' | 'roles'
const USER_TABS: UserTab[] = ['details', 'groups', 'identities', 'roles']

export function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const basePath = AppRoute.AccessManagement.UserDetail.replace(':userId', userId ?? '')
  const [activeTab] = useUrlTab<UserTab>(basePath)

  const { userQuery, groupCount, identitiesData, roleAssignmentCount, currentUserId } = useUserDetailData(userId)

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

  if (userQuery.error) {
    return (
      <DetailPageShell title="User Details" breadcrumbs={breadcrumbsUserDetailEarlyShell()}>
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
      <DetailPageShell title="User Details" breadcrumbs={breadcrumbsUserDetailEarlyShell()}>
        {queryState}
      </DetailPageShell>
    )
  }

  if (!userData) return null

  const userDisplayName = userData.full_name ?? userData.username
  const userBreadcrumbs = breadcrumbsUserDetail(userDisplayName, basePath, activeTab)

  return (
    <NxPage>
      <NxPageHeader
        title={userDisplayName}
        breadcrumbs={userBreadcrumbs}
        titleAddons={
          !userData.is_enabled ? (
            <FlexItem>
              <DisabledBadge />
            </FlexItem>
          ) : undefined
        }
        toolbar={
          <Button variant="secondary" icon={<RhUiEditIcon />} onClick={navigateEdit}>
            Edit user
          </Button>
        }
      />
      <StackItem style={{ flexShrink: 0 }}>
        <UrlTabs basePath={basePath} defaultTab="details" validTabs={USER_TABS} aria-label="User details">
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          <Tab
            eventKey="groups"
            title={
              <TabTitleText>
                Groups <Badge isRead>{groupCount}</Badge>
              </TabTitleText>
            }
          />
          <Tab
            eventKey="identities"
            title={
              <TabTitleText>
                Identities <Badge isRead>{identitiesData.length}</Badge>
              </TabTitleText>
            }
          />
          <Tab
            eventKey="roles"
            title={
              <TabTitleText>
                Assignments <Badge isRead>{roleAssignmentCount}</Badge>
              </TabTitleText>
            }
          />
        </UrlTabs>
      </StackItem>
      <NxPageBody>
        <NxPanel isFullHeight>
          {activeTab === 'details' && <UserDetailsTab user={userData} identities={identitiesData} />}
          {activeTab === 'groups' && <UserGroupsPanel userId={userId ?? ''} />}
          {activeTab === 'identities' && (
            <UserIdentitiesPanel
              userId={userId ?? ''}
              currentUserId={currentUserId}
              isBuiltinUser={!!userData.is_builtin}
              isLocalUser={userData.auth_type === AUTH_TYPE_LOCAL}
              hasPassword={userData.auth_type === AUTH_TYPE_LOCAL}
            />
          )}
          {activeTab === 'roles' && <RoleAssignmentsPanel principalType="user" principalId={userId ?? ''} />}
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
