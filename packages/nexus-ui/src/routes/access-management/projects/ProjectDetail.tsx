import {
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
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppPage, AppPageMain } from '../../../app/AppPage'
import { AppPageHeader } from '../../../app/AppPageHeader'
import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsProjectDetail, breadcrumbsProjectDetailEarlyShell } from '../../../app/breadcrumbBuilders'
import { AppPanel } from '../../../components/AppPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { useDetailTab } from '../../../hooks/useDetailTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { accessClient } from '../../access/accessClient'
import type { ProjectRead } from '../../access/types'
import { DetailPageShell } from '../DetailPageShell'

import { ProjectNotFoundState } from './ProjectNotFoundState'
import { ProjectPoliciesTab } from './ProjectPoliciesTab'
import { ProjectRoleAssignmentsTab } from './ProjectRoleAssignmentsTab'
import { ProjectRolesTab } from './ProjectRolesTab'

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

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const basePath = AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId ?? '')
  type ProjectTab = 'details' | 'role-assignments' | 'roles' | 'policies'
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
      <DetailPageShell title="Project Details" breadcrumbs={breadcrumbsProjectDetailEarlyShell()}>
        <ProjectNotFoundState
          onBack={navigateBack}
          onRetry={() => {
            refetchProject().catch(() => {})
          }}
        />
      </DetailPageShell>
    )
  }

  if (queryState) {
    return (
      <DetailPageShell title="Project Details" breadcrumbs={breadcrumbsProjectDetailEarlyShell()}>
        {queryState}
      </DetailPageShell>
    )
  }

  if (!projectData) return null

  const projectCrumbs = breadcrumbsProjectDetail(projectData.name, basePath, activeTab)

  return (
    <AppPage>
      <AppPageHeader title={<Title headingLevel="h1">{projectData.name}</Title>} breadcrumbs={projectCrumbs} />
      <StackItem style={{ flexShrink: 0 }}>
        <Tabs activeKey={activeTab} onSelect={(_event, key) => goToTab(key as ProjectTab)}>
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          <Tab eventKey="policies" title={<TabTitleText>Policies</TabTitleText>} />
          <Tab eventKey="roles" title={<TabTitleText>Roles</TabTitleText>} />
          <Tab eventKey="role-assignments" title={<TabTitleText>Role Assignments</TabTitleText>} />
        </Tabs>
      </StackItem>
      <AppPageMain>
        <AppPanel isFullHeight>
          {activeTab === 'details' && <ProjectDetailsTab project={projectData} />}
          {activeTab === 'role-assignments' && <ProjectRoleAssignmentsTab projectId={projectId ?? ''} />}
          {activeTab === 'roles' && <ProjectRolesTab projectId={projectId ?? ''} />}
          {activeTab === 'policies' && <ProjectPoliciesTab projectId={projectId ?? ''} />}
        </AppPanel>
      </AppPageMain>
    </AppPage>
  )
}
