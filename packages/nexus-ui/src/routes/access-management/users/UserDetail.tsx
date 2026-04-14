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
  Label,
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
import { usersClient } from '../../../client'
import { useQueryState } from '../../../components/states/useQueryState'
import { formatDateTime } from '../../../utils/dateUtils'
import { detachPromise } from '../../../utils/detachPromise'
import { isValidUUID } from '../../../utils/generateUUID'
import { ROLE_LABEL_MAP } from '../userConstants'
import { splitFullName } from '../userFormSchema'

import { UserGroupsPanel } from './UserGroupsPanel'
import { UserNotFoundState } from './UserNotFoundState'

function UserDetailsTab({ user }: Readonly<{ user: User }>) {
  const { first_name, last_name } = splitFullName(user.full_name ?? '')
  const roleConfig = ROLE_LABEL_MAP[user.role] ?? { text: user.role, color: 'grey' as const }

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
        <DescriptionListTerm>System Role</DescriptionListTerm>
        <DescriptionListDescription>
          <Label color={roleConfig.color}>{roleConfig.text}</Label>
        </DescriptionListDescription>
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

export function UserDetail() {
  const { userId } = useParams<{ userId: string }>()
  const [activeTab, setActiveTab] = useState(0)
  const isValidId = !!userId && isValidUUID(userId)

  const userQuery = usersClient.useQuery(
    'get',
    '/users/{user_id}',
    { params: { path: { user_id: userId ?? '' } } },
    { enabled: isValidId, retry: false }
  )

  const groupsQuery = usersClient.useQuery(
    'get',
    '/users/{user_id}/groups',
    { params: { path: { user_id: userId ?? '' } } },
    { enabled: isValidId }
  )

  const groupsData = groupsQuery.data
  const groupCount = groupsData?.total ?? groupsData?.resources?.length ?? 0

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
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight style={{ padding: 'var(--pf-t--global--spacer--xl)' }}>
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
          </Tabs>
          <div style={{ paddingTop: 'var(--pf-t--global--spacer--lg)' }}>
            {activeTab === 0 && <UserDetailsTab user={userData} />}
            {activeTab === 1 && <UserGroupsPanel userId={userId ?? ''} />}
          </div>
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
