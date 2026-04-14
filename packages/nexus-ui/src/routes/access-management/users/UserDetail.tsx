import type { User } from '@ansible/nexus-contracts'
import {
  Badge,
  Button,
  CompassPanel,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from '@patternfly/react-core'
import { RhUiArrowLeftIcon, RhUiEditIcon } from '@patternfly/react-icons'
import { useState } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { useQueryState } from '../../../components/states/useQueryState'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { isValidUUID } from '../../../utils/generateUUID'
import { accessClient } from '../../access/accessClient'
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
  const [activeTab, setActiveTab] = useState(0)
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
      <AppPage>
        <AppPageHeader title="User Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <UserNotFoundState
              onBack={navigateBack}
              onRetry={() => {
                detachPromise(refetchUser())
              }}
            />
          </CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (queryState) {
    return (
      <AppPage>
        <AppPageHeader title="User Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (!userData) return null

  const headerTitle = (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
      <FlexItem>
        <Button variant="plain" aria-label="Back to users" onClick={navigateBack}>
          <RhUiArrowLeftIcon />
        </Button>
      </FlexItem>
      <FlexItem>
        <Title headingLevel="h1">{userData.full_name ?? userData.username}</Title>
      </FlexItem>
    </Flex>
  )

  return (
    <AppPage>
      <AppPageHeader title={headerTitle}>
        <FlexItem grow={{ default: 'grow' }} />
        <Button variant="secondary" icon={<RhUiEditIcon />} onClick={navigateEdit}>
          Edit user
        </Button>
      </AppPageHeader>
      <StackItem>
        <Tabs activeKey={activeTab} onSelect={(_event, key) => setActiveTab(Number(key))}>
          <Tab eventKey={0} title={<TabTitleText>Details</TabTitleText>} />
          <Tab
            eventKey={1}
            title={
              <TabTitleText>
                Groups <Badge isRead>{groupCount}</Badge>
              </TabTitleText>
            }
          />
          <Tab eventKey={2} title={<TabTitleText>Roles</TabTitleText>} />
        </Tabs>
      </StackItem>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          {activeTab === 0 && <UserDetailsTab user={userData} />}
          {activeTab === 1 && <UserGroupsPanel userId={userId ?? ''} />}
          {activeTab === 2 && <RoleAssignmentsPanel principalType="user" principalId={userId ?? ''} />}
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
