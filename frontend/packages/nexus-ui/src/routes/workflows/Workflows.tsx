import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Button } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiImportIcon } from '@patternfly/react-icons'
import { useMemo, useState } from 'react'

import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { NxKebabMenu } from '../../components/NxKebabMenu'
import { useQueryState } from '../../components/states/useQueryState'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useAlerts } from '../../providers/alerts'
import type { FilterConfig } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { useDocLink } from '../../utils/docs/useDocLink'
import { downloadWorkflowExportById } from '../../utils/downloadWorkflowExport'
import type { ProjectRead } from '../access/types'
import { useProjectPermissions } from '../access-management/useProjectPermissions'

import { buildProjectRowActions } from './projectRowActions'
import { useDuplicateWorkflow } from './useDuplicateWorkflow'
import { useProjectActions } from './useProjectActions'
import { useWorkflowActions } from './useWorkflowActions'
import { useWorkflowPermissions } from './useWorkflowPermissions'
import { useWorkflowsPageToolbar } from './useWorkflowsPageToolbar'
import { useWorkflowsQuery } from './useWorkflowsQuery'
import { WorkflowDialogs } from './WorkflowDialogs'
import { workflowFilterDefinitions } from './workflowFilterDefinitions'
import { buildWorkflowRowActions } from './workflowRowActions'
import { WorkflowsListPanel } from './WorkflowsListPanel'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

// Transform is_enabled string values to boolean for the API
const transformIsEnabledFilter = (filters: FilterConfig[]): FilterConfig[] =>
  filters.map((filter) => {
    if (filter.key === 'is_enabled' && typeof filter.value === 'string') {
      return { ...filter, value: filter.value === 'true' }
    }
    return filter
  })

type WorkflowsPageToolbarProps = {
  headerProjectActions: ReturnType<typeof buildProjectRowActions>
  canCreate: boolean
  createTooltip: string
  showWorkflowActions: boolean
  onImportClick: () => void
  onCreateClick: () => void
}

function WorkflowsPageToolbar({
  headerProjectActions,
  canCreate,
  createTooltip,
  showWorkflowActions,
  onImportClick,
  onCreateClick,
}: WorkflowsPageToolbarProps) {
  return (
    <>
      {showWorkflowActions && (
        <>
          <DisabledWithTooltip isDisabled={!canCreate} content={createTooltip}>
            <Button variant="secondary" icon={<RhUiImportIcon />} isAriaDisabled={!canCreate} onClick={onImportClick}>
              Import workflow
            </Button>
          </DisabledWithTooltip>
          <DisabledWithTooltip isDisabled={!canCreate} content={createTooltip}>
            <Button variant="primary" icon={<RhUiAddIcon />} isAriaDisabled={!canCreate} onClick={onCreateClick}>
              Create workflow
            </Button>
          </DisabledWithTooltip>
        </>
      )}
      {headerProjectActions.length > 0 && <NxKebabMenu actions={headerProjectActions} aria-label="Project actions" />}
    </>
  )
}

export default function Workflows() {
  const workflowsDocLink = useDocLink('workflows')
  const { showAlert, showSuccess, showError } = useAlerts()
  const setLocation = useNavigate()
  const { selectedProjectId, stableProjectId, isAllProjects, projects, ProjectSelector, refetchProjects } =
    useProjectSelector()
  const permissions = useWorkflowPermissions()
  const projectPermissions = useProjectPermissions()
  const projectExtraParams = useMemo(
    () => (selectedProjectId ? { project_id: selectedProjectId } : undefined),
    [selectedProjectId]
  )

  const {
    cursor,
    resetPagination,
    filters,
    hasActiveFilters,
    queryParams,
    handleFilterChange,
    handleClearAllFilters,
    getFooterProps,
  } = useCursorPagination({ transformFilters: transformIsEnabledFilter, extraParams: projectExtraParams })

  const runDialog = useDialogState<Workflow>()
  const deleteDialog = useDialogState<Workflow>()
  const publishDialog = useDialogState<Workflow>()
  const unpublishDialog = useDialogState<Workflow>()
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const projectEditDialog = useDialogState<ProjectRead>()
  const projectDeleteDialog = useDialogState<ProjectRead>()

  const projectSelectorReady = isAllProjects || !!stableProjectId
  const { workflowsQuery, workflows } = useWorkflowsQuery({
    queryParams,
    isAllProjects,
    stableProjectId,
    projectSelectorReady,
  })

  const {
    handleRunWorkflow,
    handleDeleteWorkflow,
    handlePublishWorkflow,
    handleUnpublishWorkflow,
    isDeleting,
    isPublishing,
  } = useWorkflowActions({
    showSuccess,
    showError,
    onNavigate: setLocation,
    onRefetch: () => detachPromise(workflowsQuery.refetch()),
    onDeleteSettled: () => deleteDialog.close(),
    onPublishSettled: () => publishDialog.close(),
    onUnpublishSettled: () => unpublishDialog.close(),
  })

  const builtinProjectIds = useMemo(() => new Set(projects.filter((p) => p.is_builtin).map((p) => p.id)), [projects])
  const sortedWorkflows = useMemo(() => {
    if (!isAllProjects) return workflows
    return workflows.filter((w) => {
      const pid = w.project_id
      return !builtinProjectIds.has(pid)
    })
  }, [workflows, isAllProjects, builtinProjectIds])
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const groupedWorkflows = useMemo(() => {
    if (!isAllProjects) return null
    type WorkflowType = (typeof workflows)[number]
    const groups = new Map<string, { project: (typeof projects)[number] | null; workflows: WorkflowType[] }>()
    for (const workflow of sortedWorkflows) {
      const projectId = workflow.project_id
      if (!groups.has(projectId)) {
        groups.set(projectId, {
          project: projects.find((p) => p.id === projectId) ?? null,
          workflows: [],
        })
      }
      groups.get(projectId)!.workflows.push(workflow)
    }
    return groups
  }, [sortedWorkflows, projects, isAllProjects])

  const toggleProjectCollapsed = (projectId: string) =>
    setCollapsedProjects((prev) =>
      prev.has(projectId) ? new Set([...prev].filter((id) => id !== projectId)) : new Set([...prev, projectId])
    )

  useCursorReset(sortedWorkflows.length, hasActiveFilters, cursor, workflowsQuery.isFetching, resetPagination)

  const { handleDeleteProject: handleDeleteProjectBase, isDeletingProject } = useProjectActions({
    showSuccess,
    showError,
    onRefetch: () => {
      detachPromise(workflowsQuery.refetch())
      detachPromise(refetchProjects())
    },
    onDeleteSettled: () => projectDeleteDialog.close(),
  })

  const { duplicateWorkflow, isDuplicating } = useDuplicateWorkflow({
    showAlert,
    showError,
    setLocation,
    onSuccess: () => detachPromise(workflowsQuery.refetch()),
  })

  const { getProjectActions, headerProjectActions, showWorkflowActions, showToolbar } = useWorkflowsPageToolbar({
    isAllProjects,
    selectedProjectId,
    projects,
    sortedWorkflowsLength: sortedWorkflows.length,
    hasActiveFilters,
    projectEditDialog,
    projectDeleteDialog,
    projectPermissions,
  })

  const getRowActions = (workflow: Workflow) =>
    buildWorkflowRowActions(workflow, permissions, {
      setLocation,
      onRun: (wf) => runDialog.open(wf),
      onDuplicate: (wf) => detachPromise(duplicateWorkflow(wf)),
      onExport: (wf) => {
        if (wf.id) {
          detachPromise(
            downloadWorkflowExportById(wf.id).catch((err: unknown) => {
              showError({ title: 'Export failed', description: getErrorMessage(err) })
            })
          )
        }
      },
      onPublish: (wf) => publishDialog.open(wf),
      onUnpublish: (wf) => unpublishDialog.open(wf),
      onDelete: (wf) => deleteDialog.open(wf),
      isDuplicating,
    })

  const queryState = useQueryState(workflowsQuery, {
    title: 'Error loading workflows',
    onRetry: () => detachPromise(workflowsQuery.refetch()),
  })

  return (
    <>
      <NxPage>
        <NxPageHeader
          title="Workflows"
          docLink={workflowsDocLink}
          projectSelector={queryState ? undefined : ProjectSelector}
          toolbar={
            !queryState && showToolbar ? (
              <WorkflowsPageToolbar
                headerProjectActions={headerProjectActions}
                canCreate={permissions.canCreate}
                createTooltip={permissions.tooltips.create}
                showWorkflowActions={showWorkflowActions}
                onImportClick={() => setImportDialogOpen(true)}
                onCreateClick={() => setLocation('/workflow-builder/new')}
              />
            ) : undefined
          }
        />

        <NxPageBody>
          <NxPanel isFullHeight>
            {queryState ?? (
              <WorkflowsListPanel
                sortedWorkflows={sortedWorkflows}
                hasActiveFilters={hasActiveFilters}
                filterFieldDefinitions={workflowFilterDefinitions}
                filters={filters}
                onFilterChange={handleFilterChange}
                onClearAllFilters={handleClearAllFilters}
                onCreateWorkflow={permissions.canCreate ? () => setLocation('/workflow-builder/new') : undefined}
                footer={getFooterProps(workflowsQuery.data)}
                isAllProjects={isAllProjects}
                groupedWorkflows={groupedWorkflows}
                collapsedProjects={collapsedProjects}
                onToggleProject={toggleProjectCollapsed}
                getRowActions={getRowActions}
                getProjectActions={getProjectActions}
              />
            )}
          </NxPanel>
        </NxPageBody>
      </NxPage>

      <WorkflowDialogs
        runDialog={runDialog}
        deleteDialog={deleteDialog}
        publishDialog={publishDialog}
        unpublishDialog={unpublishDialog}
        importDialogOpen={importDialogOpen}
        setImportDialogOpen={setImportDialogOpen}
        projectEditDialog={projectEditDialog}
        projectDeleteDialog={projectDeleteDialog}
        onRunWorkflow={handleRunWorkflow}
        onDeleteWorkflow={handleDeleteWorkflow}
        onPublishWorkflow={handlePublishWorkflow}
        onUnpublishWorkflow={handleUnpublishWorkflow}
        onDeleteProject={handleDeleteProjectBase}
        onRefetchWorkflows={() => detachPromise(workflowsQuery.refetch())}
        onRefetchProjects={() => detachPromise(refetchProjects())}
        isDeleting={isDeleting}
        isPublishing={isPublishing}
        isDeletingProject={isDeletingProject}
      />
    </>
  )
}
