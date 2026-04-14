import {
  Breadcrumb,
  BreadcrumbItem,
  CompassPanel,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Flex,
  FlexItem,
  Label,
  LabelGroup,
  StackItem,
  Tab,
  TabTitleText,
  Tabs,
  Title,
} from '@patternfly/react-core'
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table'
import { useMemo } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { EmptyStateNoData } from '../../../components/EmptyStateNoData'
import { ErrorState } from '../../../components/states/ErrorState'
import { LoadingState } from '../../../components/states/LoadingState'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDetailTab } from '../../../hooks/useDetailTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { accessClient } from '../../access/accessClient'
import type { ProjectRead } from '../../access/types'

import { ProjectNotFoundState } from './ProjectNotFoundState'

function ProjectDetailsTab({ project }: Readonly<{ project: ProjectRead }>) {
  const labelEntries = Object.entries(project.labels ?? {})

  return (
    <DescriptionList isHorizontal isAutoColumnWidths>
      <DescriptionListGroup>
        <DescriptionListTerm>Name</DescriptionListTerm>
        <DescriptionListDescription>
          <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
            <FlexItem>{project.name}</FlexItem>
            {project.is_default && (
              <Label color="blue" isCompact>
                Default
              </Label>
            )}
          </Flex>
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Description</DescriptionListTerm>
        <DescriptionListDescription>{project.description ?? '-'}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Labels</DescriptionListTerm>
        <DescriptionListDescription>
          {labelEntries.length > 0 ? (
            <LabelGroup>
              {labelEntries.map(([key, value]) => (
                <Label key={key} isCompact>
                  {key}: {String(value)}
                </Label>
              ))}
            </LabelGroup>
          ) : (
            '-'
          )}
        </DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Created</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(project.created_at)}</DescriptionListDescription>
      </DescriptionListGroup>
      <DescriptionListGroup>
        <DescriptionListTerm>Updated</DescriptionListTerm>
        <DescriptionListDescription>{formatDateTime(project.updated_at)}</DescriptionListDescription>
      </DescriptionListGroup>
    </DescriptionList>
  )
}

function ProjectPermissionsTab({ projectId }: Readonly<{ projectId: string }>) {
  const rolesQuery = accessClient.useQuery('get', '/projects/{project_id}/roles', {
    params: { path: { project_id: projectId } },
  })

  const assignments = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data])

  if (rolesQuery.isError) {
    return (
      <ErrorState
        title="Error loading permissions"
        message={rolesQuery.error}
        onRetry={() => rolesQuery.refetch().catch(() => {})}
      />
    )
  }

  if (rolesQuery.isPending) return <LoadingState />

  if (assignments.length === 0) {
    return <EmptyStateNoData title="No permissions" description="No users have roles assigned in this project." />
  }

  return (
    <Table aria-label="Project permissions" isStriped>
      <Thead>
        <Tr>
          <Th>Username</Th>
          <Th>Role</Th>
          <Th>Assigned</Th>
        </Tr>
      </Thead>
      <Tbody>
        {assignments.map((a) => (
          <Tr key={a.id}>
            <Td dataLabel="Username">{a.username ?? a.user_id}</Td>
            <Td dataLabel="Role">
              <Label isCompact color="green">
                {a.role_name}
              </Label>
            </Td>
            <Td dataLabel="Assigned">{formatDateTime(a.created_at)}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  )
}

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const basePath = AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId ?? '')
  type ProjectTab = 'details' | 'permissions'
  const [activeTab, goToTab] = useDetailTab<ProjectTab>(basePath)

  const projectQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}',
    { params: { path: { project_id: projectId ?? '' } } },
    { enabled: !!projectId, retry: false }
  )

  const navigateBack = () => navigate(AppRoute.AccessManagement.Projects)

  const projectData = projectQuery.data
  const refetchProject = projectQuery.refetch
  const queryState = useQueryState(projectQuery, {
    title: 'Error loading project',
    onRetry: () => {
      refetchProject().catch(() => {})
    },
  })

  if (projectQuery.error) {
    return (
      <AppPage>
        <AppPageHeader title="Project Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>
            <ProjectNotFoundState
              onBack={navigateBack}
              onRetry={() => {
                refetchProject().catch(() => {})
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
        <AppPageHeader title="Project Details" />
        <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
          <CompassPanel isFullHeight>{queryState}</CompassPanel>
        </StackItem>
      </AppPage>
    )
  }

  if (!projectData) return null

  const breadcrumb = (
    <Breadcrumb>
      <BreadcrumbItem component="button" onClick={() => navigate(AppRoute.AccessManagement.Projects)}>
        Access Management
      </BreadcrumbItem>
      <BreadcrumbItem component="button" onClick={() => navigate(AppRoute.AccessManagement.Projects)}>
        Projects
      </BreadcrumbItem>
      <BreadcrumbItem isActive>{projectData.name}</BreadcrumbItem>
    </Breadcrumb>
  )

  return (
    <AppPage>
      <AppPageHeader title={<Title headingLevel="h1">{projectData.name}</Title>} breadcrumb={breadcrumb} />
      <StackItem>
        <Tabs activeKey={activeTab} onSelect={(_event, key) => goToTab(key as ProjectTab)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          <Tab eventKey="permissions" title={<TabTitleText>Permissions</TabTitleText>} />
        </Tabs>
      </StackItem>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'hidden' }}>
        <CompassPanel isFullHeight>
          {activeTab === 'details' && <ProjectDetailsTab project={projectData} />}
          {activeTab === 'permissions' && <ProjectPermissionsTab projectId={projectId ?? ''} />}
        </CompassPanel>
      </StackItem>
    </AppPage>
  )
}
