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
} from '@patternfly/react-core'
import { useMemo } from 'react'
import { useParams } from 'wouter'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../../app/AppRoute'
import { breadcrumbsProjectDetail, breadcrumbsProjectDetailEarlyShell } from '../../../app/breadcrumbBuilders'
import { NxPage, NxPageBody } from '../../../components/layout/NxPage'
import { NxPageHeader } from '../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../components/layout/NxPanel'
import { useQueryState } from '../../../components/states/useQueryState'
import { NxUrlTabs } from '../../../components/tabs/NxUrlTabs'
import { useUrlTab } from '../../../hooks/useUrlTab'
import { formatDateTime } from '../../../utils/dateUtils'
import { accessClient } from '../../access/accessClient'
import type { ProjectRead } from '../../access/types'
import { DetailPageShell } from '../DetailPageShell'

import { ProjectNotFoundState } from './ProjectNotFoundState'
import { ProjectRoleAssignmentsTab } from './ProjectRoleAssignmentsTab'
import { useProjectDetailPermissions } from './useProjectDetailPermissions'

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

type ProjectTab = 'details' | 'role-assignments'
const ALL_PROJECT_TABS: ProjectTab[] = ['details', 'role-assignments']

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>()
  const basePath = AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId ?? '')
  const [activeTab] = useUrlTab<ProjectTab>(basePath)
  const { canReadAssignments, isLoading: permissionsLoading } = useProjectDetailPermissions()

  const validTabs = useMemo(() => {
    if (permissionsLoading || canReadAssignments) return ALL_PROJECT_TABS
    return ALL_PROJECT_TABS.filter((tab) => tab !== 'role-assignments')
  }, [canReadAssignments, permissionsLoading])

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
    <NxPage>
      <NxPageHeader title={projectData.name} breadcrumbs={projectCrumbs} />
      <StackItem style={{ flexShrink: 0 }}>
        <NxUrlTabs basePath={basePath} defaultTab="details" validTabs={validTabs} aria-label="Project details">
          <Tab eventKey="details" title={<TabTitleText>Details</TabTitleText>} />
          {validTabs.includes('role-assignments') && (
            <Tab eventKey="role-assignments" title={<TabTitleText>Assignments</TabTitleText>} />
          )}
        </NxUrlTabs>
      </StackItem>
      <NxPageBody>
        <NxPanel isFullHeight>
          {activeTab === 'details' && <ProjectDetailsTab project={projectData} />}
          {activeTab === 'role-assignments' && validTabs.includes('role-assignments') && (
            <ProjectRoleAssignmentsTab projectId={projectId ?? ''} />
          )}
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
