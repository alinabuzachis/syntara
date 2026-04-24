import type { User } from '@ansible/nexus-contracts'
import {
  Badge,
  Button,
  CompassPanel,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  FlexItem,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from '@patternfly/react-core'
import { RhUiEditIcon } from '@patternfly/react-icons'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDetailTab } from '../../../hooks/useDetailTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { isValidUUID } from '../../../utils/generateUUID'
import { accessClient } from '../../access/accessClient'
import { DetailPageShell } from '../DetailPageShell'
import { RoleAssignmentsPanel } from '../RoleAssignmentsPanel'
import { splitFullName } from '../userFormSchema'

import { UserGroupsPanel } from './UserGroupsPanel'
import { UserNotFoundState } from './UserNotFoundState'

function UserDetailsTab({ user }: Readonly<{ user: User }>) {
  const { first_name, last_name } = splitFullName(user.full_name ?? '')

  return (
    <DescriptionList isHorizontal isAutoColumnWidths>
      <DescriptionListGroup>
        <DescriptionListTerm>Username</DescriptionListTerm>
        <DescriptionListDescription>{user.username}</DescriptionListDescription>
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
        <DescriptionListTerm>Identity Provider</DescriptionListTerm>
        <DescriptionListDescription>Local</DescriptionListDescription>
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

function getGroupCount(data: { total?: number | null; resources?: { name: string }[] } | undefined): number {
  const apiCount = data?.total ?? data?.resources?.length ?? 0
  const hasAuthenticated = data?.resources?.some((g) => g.name === 'authenticated') ?? false
  return hasAuthenticated ? apiCount : apiCount + 1
}

export function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const basePath = AppRoute.AccessManagement.UserDetail.replace(':userId', userId ?? '')
  type UserTab = 'details' | 'groups' | 'roles'
  const [activeTab, goToTab] = useDetailTab<UserTab>(basePath)
  const isValidId = !!userId && isValidUUID(userId)

  const userQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}',
    { params: { path: { user_id: userId ?? '' } } },
    { enabled: isValidId, retry: false }
  )

  const groupsQuery = accessClient.useQuery(
    'get',
    '/users/{user_id}/groups',
    { params: { path: { user_id: userId ?? '' } } },
    { enabled: isValidId }
  )

  const groupCount = getGroupCount(groupsQuery.data)

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
      <DetailPageShell title="User Details">
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
    return <DetailPageShell title="User Details">{queryState}</DetailPageShell>
  }

  if (!userData) return null

  return (
    <AppPage>
      <AppPageHeader title={<Title headingLevel="h1">{userData.full_name ?? userData.username}</Title>}>
        <FlexItem grow={{ default: 'grow' }} />
        <Button variant="secondary" icon={<RhUiEditIcon />} onClick={navigateEdit}>
          Edit user
        </Button>
      </AppPageHeader>
      <StackItem>
        <Tabs activeKey={activeTab} onSelect={(_event, key) => goToTab(key as UserTab)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          <Tab
            eventKey="groups"
            title={
              <TabTitleText>
                Groups <Badge isRead>{groupCount}</Badge>
              </TabTitleText>
            }
          />
          <Tab eventKey="roles" title={<TabTitleText>Role Assignments</TabTitleText>} />
        </Tabs>
      </StackItem>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          {activeTab === 'details' && <UserDetailsTab user={userData} />}
          {activeTab === 'groups' && <UserGroupsPanel userId={userId ?? ''} />}
          {activeTab === 'roles' && <RoleAssignmentsPanel principalType="user" principalId={userId ?? ''} />}
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
