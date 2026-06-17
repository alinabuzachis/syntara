import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { AlertActionLink, Button, List, ListItem, Stack, StackItem } from '@patternfly/react-core'
import { RhUiAddIcon, RhUiImportIcon } from '@patternfly/react-icons'
import { useCallback, useMemo, useState } from 'react'

import { executionsClient, workflowClient, workflowFetchClient } from '../../client'
import { NxConfirmationDialog } from '../../components/dialogs/NxConfirmationDialog'
import { DisabledWithTooltip } from '../../components/DisabledWithTooltip'
import { NxPage, NxPageBody } from '../../components/layout/NxPage'
import { NxPageHeader } from '../../components/layout/NxPageHeader'
import { NxPanel } from '../../components/layout/NxPanel'
import { useQueryState } from '../../components/states/useQueryState'
import { useNavigate } from '../../hooks/routing/useNavigate'
import { useCursorPagination, useCursorReset } from '../../hooks/useCursorPagination'
import { useDialogState } from '../../hooks/useDialogState'
import { useProjectSelector } from '../../hooks/useProjectSelector'
import { useAlerts } from '../../providers/alerts'
import { FilterOperatorEnum, FilterTypeEnum } from '../../types/filters'
import type { FilterConfig, FilterFieldDefinition } from '../../types/filters'
import { getErrorMessage } from '../../utils/apiErrors'
import { detachPromise } from '../../utils/detachPromise'
import { useDocLink } from '../../utils/docs/useDocLink'
import { downloadWorkflowExportById } from '../../utils/downloadWorkflowExport'
import { accessClient } from '../access/accessClient'
import { PublishWorkflowDialog } from '../builder/PublishWorkflowDialog'

import { ImportWorkflowDialog } from './ImportWorkflowDialog'
import { useWorkflowPermissions } from './useWorkflowPermissions'
import { buildWorkflowRowActions } from './workflowRowActions'
import { WorkflowsListPanel } from './WorkflowsListPanel'

type Workflow = WorkflowAPI.components['schemas']['Workflow']
type WorkflowDefinitionSchema = WorkflowAPI.components['schemas']['workflow_definition.schema']
type WorkflowWithProject = Workflow & { project_id?: string }

// Transform is_enabled string values to boolean for the API
const transformIsEnabledFilter = (filters: FilterConfig[]): FilterConfig[] =>
  filters.map((filter) => {
    if (filter.key === 'is_enabled' && typeof filter.value === 'string') {
      return { ...filter, value: filter.value === 'true' }
    }
    return filter
  })

// eslint-disable-next-line max-lines-per-function -- pre-existing size
export default function Workflows() {
  const workflowsDocLink = useDocLink('workflows')
  const { showAlert, showSuccess, showError } = useAlerts()
  const setLocation = useNavigate()
  const { selectedProjectId, stableProjectId, isAllProjects, projects, ProjectSelector } = useProjectSelector()
  const permissions = useWorkflowPermissions()
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

  // Define filter field definitions for FilterBar
  const filterFieldDefinitions = useMemo<FilterFieldDefinition[]>(
    () => [
      {
        key: 'name',
        label: 'Name',
        type: FilterTypeEnum.TEXT,
        operators: [FilterOperatorEnum.CONTAINS],
        defaultOperator: FilterOperatorEnum.CONTAINS,
        placeholder: 'Filter by name',
      },
      {
        key: 'is_enabled',
        label: 'State',
        type: FilterTypeEnum.SELECT,
        options: [
          { value: 'true', label: 'Enabled' },
          { value: 'false', label: 'Disabled' },
        ],
        placeholder: 'Filter by state',
      },
    ],
    []
  )

  // Query workflows — use project-scoped endpoint when a project is selected.
  const projectSelectorReady = isAllProjects || !!stableProjectId

  const allWorkflowsQuery = workflowClient.useQuery(
    'get',
    '/workflows',
    {
      params: { query: queryParams },
    },
    {
      enabled: projectSelectorReady && isAllProjects,
    }
  )

  const projectWorkflowsQuery = accessClient.useQuery(
    'get',
    '/projects/{project_id}/workflows',
    {
      params: {
        path: { project_id: stableProjectId ?? '' },
        query: queryParams,
      },
    },
    {
      enabled: !!stableProjectId && !isAllProjects,
    }
  )

  const workflowsQuery = isAllProjects ? allWorkflowsQuery : projectWorkflowsQuery
  const workflows = (workflowsQuery.data?.resources ?? []) as Workflow[]
  const { mutate: executeWorkflow } = executionsClient.useMutation('post', '/executions')
  const { mutate: deleteWorkflow, isPending: isDeleting } = workflowClient.useMutation(
    'delete',
    '/workflows/{workflow_id}'
  )
  const { mutate: publishWorkflow, isPending: isPublishing } = workflowClient.useMutation(
    'post',
    '/workflows/{workflow_id}/versions/{version}/publish'
  )
  const { mutate: unpublishWorkflow } = workflowClient.useMutation('post', '/workflows/{workflow_id}/unpublish')

  const sortedWorkflows = workflows

  // Group workflows by project when viewing all projects
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())

  const groupedWorkflows = useMemo(() => {
    if (!isAllProjects) return null
    const groups = new Map<string, { project: (typeof projects)[number] | null; workflows: Workflow[] }>()
    for (const workflow of sortedWorkflows) {
      const projectId = (workflow as WorkflowWithProject).project_id ?? 'unknown'
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

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  useCursorReset(sortedWorkflows.length, hasActiveFilters, cursor, workflowsQuery.isFetching, resetPagination)

  const handleRunWorkflow = (workflow: Workflow) => {
    if (!workflow.id) return
    executeWorkflow(
      { body: { workflow_id: workflow.id, input_data: {} } },
      {
        onSuccess: (data) => {
          if (data && 'id' in data) {
            setLocation(`/executions/${data.id}`)
          }
        },
        onError: (error: unknown) => {
          showError({
            title: 'Workflow failed',
            description: `Failed to start workflow "${workflow.name}": ${getErrorMessage(error)}`,
          })
        },
      }
    )
  }

  const handleDeleteWorkflow = () => {
    const workflow = deleteDialog.item
    if (!workflow?.id) return

    deleteWorkflow(
      { params: { path: { workflow_id: workflow.id } } },
      {
        onSuccess: () => {
          showSuccess({ title: 'Workflow deleted', description: `Successfully deleted workflow "${workflow.name}"` })

          detachPromise(workflowsQuery.refetch())
        },
        onError: (error: unknown) => {
          showError({
            title: 'Delete failed',
            description: `Failed to delete workflow "${workflow.name}": ${getErrorMessage(error)}`,
          })
        },
        onSettled: () => {
          deleteDialog.close()
        },
      }
    )
  }

  const handlePublishWorkflow = (publishName?: string, description?: string) => {
    const workflow = publishDialog.item
    if (!workflow?.id || !workflow.current_version) return

    publishWorkflow(
      {
        params: { path: { workflow_id: workflow.id, version: workflow.current_version } },
        body: { publish_name: publishName ?? null, change_description: description ?? null },
      },
      {
        onSuccess: () => {
          showSuccess({ title: 'Workflow published successfully' })
          detachPromise(workflowsQuery.refetch())
        },
        onError: (error: unknown) => {
          showError({ title: 'Failed to publish workflow', description: getErrorMessage(error) })
        },
        onSettled: () => publishDialog.close(),
      }
    )
  }

  const handleUnpublishWorkflow = () => {
    const workflow = unpublishDialog.item
    if (!workflow?.id) return

    unpublishWorkflow(
      { params: { path: { workflow_id: workflow.id } } },
      {
        onSuccess: () => {
          showSuccess({ title: 'Workflow unpublished successfully' })
          detachPromise(workflowsQuery.refetch())
        },
        onError: (error: unknown) => {
          showError({ title: 'Failed to unpublish workflow', description: getErrorMessage(error) })
        },
        onSettled: () => unpublishDialog.close(),
      }
    )
  }
  const [isDuplicating, setIsDuplicating] = useState(false)

  const handleDuplicateWorkflow = useCallback(
    async (workflow: Workflow) => {
      if (!workflow.id || isDuplicating) return
      setIsDuplicating(true)
      try {
        const { data: fullWorkflow, error: fetchError } = await workflowFetchClient.GET('/workflows/{workflow_id}', {
          params: { path: { workflow_id: workflow.id } },
        })
        if (fetchError || !fullWorkflow) {
          showError({ title: 'Duplicate failed', description: getErrorMessage(fetchError) })
          return
        }

        const definition = fullWorkflow.version?.workflow_definition
        if (!definition) {
          showError({ title: 'Duplicate failed', description: 'Workflow has no definition to duplicate' })
          return
        }

        // Transform approval nodes: convert approver_users/approver_groups from objects to string arrays
        // The API returns {id, username}/{id, name} objects but the workflow schema expects string arrays
        const transformedDefinition = {
          ...definition,
          nodes: definition.nodes?.map((node) => {
            if (node.type === 'approval' && node.config) {
              const config = node.config as Record<string, unknown>
              const transformedConfig: Record<string, unknown> = { ...config }

              // Extract usernames from ApproverUserSummary[] -> string[]
              if (config.approver_users && Array.isArray(config.approver_users)) {
                transformedConfig.approver_users = config.approver_users.map((u: unknown) =>
                  typeof u === 'object' && u !== null && 'username' in u
                    ? (u as { username: string }).username
                    : String(u)
                )
              }

              // Extract group names from ApproverGroupSummary[] -> string[]
              if (config.approver_groups && Array.isArray(config.approver_groups)) {
                transformedConfig.approver_groups = config.approver_groups.map((g: unknown) =>
                  typeof g === 'object' && g !== null && 'name' in g ? (g as { name: string }).name : String(g)
                )
              }

              return {
                ...node,
                config: transformedConfig,
              }
            }
            return node
          }),
        }

        const timestamp = Date.now().toString(36)
        const duplicateName = `${workflow.name ?? 'workflow'} - duplicate-${timestamp}`

        const { data: createdWorkflow, error: createError } = await workflowFetchClient.POST('/workflows', {
          body: {
            name: duplicateName,
            description: workflow.description ?? '',
            workflow_definition: transformedDefinition as unknown as WorkflowDefinitionSchema,
            labels: (workflow.labels as Record<string, string> | undefined) ?? {},
            is_enabled: false,
            ...(workflow.project_id ? { project_id: workflow.project_id } : {}),
          },
        })

        if (createError) {
          showError({ title: 'Duplicate failed', description: getErrorMessage(createError) })
          return
        }

        showAlert({
          variant: 'success',
          autoDismiss: true,
          title: 'Workflow duplicated',
          description: `Created "${duplicateName}"`,
          actionLinks: createdWorkflow?.id ? (
            <AlertActionLink onClick={() => setLocation(`/workflow-builder/${createdWorkflow.id}`)}>
              Open workflow
            </AlertActionLink>
          ) : undefined,
        })
        detachPromise(workflowsQuery.refetch())
      } catch (err: unknown) {
        showError({ title: 'Duplicate failed', description: getErrorMessage(err) })
      } finally {
        setIsDuplicating(false)
      }
    },
    [isDuplicating, setLocation, showAlert, showError, workflowsQuery]
  )

  const getRowActions = (workflow: Workflow) =>
    buildWorkflowRowActions(workflow, permissions, {
      setLocation,
      onRun: (wf) => runDialog.open(wf),
      onDuplicate: (wf) => detachPromise(handleDuplicateWorkflow(wf)),
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
            queryState || (sortedWorkflows.length === 0 && !hasActiveFilters) ? undefined : (
              <>
                <DisabledWithTooltip isDisabled={!permissions.canCreate} content={permissions.tooltips.create}>
                  <Button
                    variant="secondary"
                    icon={<RhUiImportIcon />}
                    isAriaDisabled={!permissions.canCreate}
                    onClick={() => setImportDialogOpen(true)}
                  >
                    Import workflow
                  </Button>
                </DisabledWithTooltip>
                <DisabledWithTooltip isDisabled={!permissions.canCreate} content={permissions.tooltips.create}>
                  <Button
                    variant="primary"
                    icon={<RhUiAddIcon />}
                    isAriaDisabled={!permissions.canCreate}
                    onClick={() => setLocation('/workflow-builder/new')}
                  >
                    Create workflow
                  </Button>
                </DisabledWithTooltip>
              </>
            )
          }
        />

        <NxPageBody>
          <NxPanel isFullHeight>
            {queryState ?? (
              <WorkflowsListPanel
                sortedWorkflows={sortedWorkflows}
                hasActiveFilters={hasActiveFilters}
                filterFieldDefinitions={filterFieldDefinitions}
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
              />
            )}
          </NxPanel>
        </NxPageBody>

        <NxConfirmationDialog
          isOpen={runDialog.isOpen}
          onClose={runDialog.close}
          onConfirm={() => {
            if (runDialog.item) {
              handleRunWorkflow(runDialog.item)
            }
            runDialog.close()
          }}
          title={`Run ${runDialog.item?.name}?`}
          confirmLabel="Run now"
        >
          You are about to manually run this workflow. This action will start the workflow immediately, bypassing its
          normal trigger conditions.
        </NxConfirmationDialog>

        <NxConfirmationDialog
          isOpen={deleteDialog.isOpen}
          onClose={deleteDialog.close}
          onConfirm={handleDeleteWorkflow}
          title="Delete workflow?"
          confirmLabel="Delete"
          confirmVariant="danger"
          titleIconVariant="warning"
          confirmLoading={isDeleting}
          destructiveAcknowledgement={{
            checkboxId: 'delete-workflow-ack',
            label: 'I understand this workflow and any dependent workflows will be affected by this deletion.',
          }}
        >
          <Stack hasGutter>
            <StackItem>
              The workflow <strong>{deleteDialog.item?.name}</strong> will be deleted. This cannot be undone.
            </StackItem>
            <StackItem>
              <List>
                <ListItem>This workflow will stop running immediately.</ListItem>
                <ListItem>
                  Any other workflows that use this one as a step will also become invalid and stop running.
                </ListItem>
              </List>
            </StackItem>
          </Stack>
        </NxConfirmationDialog>
      </NxPage>

      <ImportWorkflowDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onSuccess={() => detachPromise(workflowsQuery.refetch())}
      />
      <PublishWorkflowDialog
        isOpen={publishDialog.isOpen}
        isPublishing={isPublishing}
        onClose={publishDialog.close}
        onPublish={handlePublishWorkflow}
      />
      <NxConfirmationDialog
        isOpen={unpublishDialog.isOpen}
        onClose={unpublishDialog.close}
        onConfirm={handleUnpublishWorkflow}
        title="Unpublish workflow?"
        confirmLabel="Unpublish"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        The workflow <strong>{unpublishDialog.item?.name}</strong> will be unpublished. It will no longer be available
        for execution until published again.
      </NxConfirmationDialog>
    </>
  )
}
