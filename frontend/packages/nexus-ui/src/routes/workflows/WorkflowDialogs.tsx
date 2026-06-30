import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { List, ListItem, Stack, StackItem } from '@patternfly/react-core'

import { NxConfirmationDialog } from '../../components/dialogs/NxConfirmationDialog'
import type { DialogState } from '../../hooks/useDialogState'
import type { ProjectRead } from '../access/types'
import { ProjectFormModal } from '../access-management/ProjectFormModal'
import { PublishWorkflowDialog } from '../builder/PublishWorkflowDialog'

import { ImportWorkflowDialog } from './ImportWorkflowDialog'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

/**
 * Props for WorkflowDialogs component
 */
type WorkflowDialogsProps = {
  /** Dialog state for workflow run confirmation */
  runDialog: DialogState<Workflow>
  /** Dialog state for workflow deletion confirmation */
  deleteDialog: DialogState<Workflow>
  /** Dialog state for workflow publish modal */
  publishDialog: DialogState<Workflow>
  /** Dialog state for workflow unpublish confirmation */
  unpublishDialog: DialogState<Workflow>
  /** Controls visibility of the import workflow dialog */
  importDialogOpen: boolean
  /** Callback to toggle import dialog visibility */
  setImportDialogOpen: (open: boolean) => void
  /** Dialog state for project edit modal */
  projectEditDialog: DialogState<ProjectRead>
  /** Dialog state for project deletion confirmation */
  projectDeleteDialog: DialogState<ProjectRead>
  /** Handler to execute a workflow immediately */
  onRunWorkflow: (workflow: Workflow) => void
  /** Handler to delete a workflow - dialog closes in onSettled callback */
  onDeleteWorkflow: (workflow: Workflow) => void
  /** Handler to publish a workflow - dialog closes in onSettled callback */
  onPublishWorkflow: (workflow: Workflow, publishName?: string, description?: string) => void
  /** Handler to unpublish a workflow - dialog closes in onSettled callback */
  onUnpublishWorkflow: (workflow: Workflow) => void
  /** Handler to delete a project - dialog closes in onSettled callback */
  onDeleteProject: (project: ProjectRead) => void
  /** Callback to refetch workflows list after import success */
  onRefetchWorkflows: () => void
  /** Callback to refetch projects list after project edit success */
  onRefetchProjects: () => void
  /** Loading state for workflow deletion mutation */
  isDeleting: boolean
  /** Loading state for workflow publish mutation */
  isPublishing: boolean
  /** Loading state for project deletion mutation */
  isDeletingProject: boolean
}

export function WorkflowDialogs({
  runDialog,
  deleteDialog,
  publishDialog,
  unpublishDialog,
  importDialogOpen,
  setImportDialogOpen,
  projectEditDialog,
  projectDeleteDialog,
  onRunWorkflow,
  onDeleteWorkflow,
  onPublishWorkflow,
  onUnpublishWorkflow,
  onDeleteProject,
  onRefetchWorkflows,
  onRefetchProjects,
  isDeleting,
  isPublishing,
  isDeletingProject,
}: WorkflowDialogsProps) {
  return (
    <>
      <NxConfirmationDialog
        isOpen={runDialog.isOpen}
        onClose={runDialog.close}
        onConfirm={() => {
          if (runDialog.item) {
            onRunWorkflow(runDialog.item)
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
        onConfirm={() => {
          if (deleteDialog.item) {
            onDeleteWorkflow(deleteDialog.item)
          }
          // Dialog closes in onSettled callback passed to useWorkflowActions
        }}
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

      <ImportWorkflowDialog
        isOpen={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onSuccess={onRefetchWorkflows}
      />

      <PublishWorkflowDialog
        isOpen={publishDialog.isOpen}
        isPublishing={isPublishing}
        onClose={publishDialog.close}
        onPublish={(publishName, description) => {
          if (publishDialog.item) {
            onPublishWorkflow(publishDialog.item, publishName, description)
          }
        }}
      />

      <NxConfirmationDialog
        isOpen={unpublishDialog.isOpen}
        onClose={unpublishDialog.close}
        onConfirm={() => {
          if (unpublishDialog.item) {
            onUnpublishWorkflow(unpublishDialog.item)
          }
          // Dialog closes in onSettled callback passed to useWorkflowActions
        }}
        title="Unpublish workflow?"
        confirmLabel="Unpublish"
        confirmVariant="danger"
        titleIconVariant="warning"
      >
        The workflow <strong>{unpublishDialog.item?.name}</strong> will be unpublished. It will no longer be available
        for execution until published again.
      </NxConfirmationDialog>

      <ProjectFormModal
        project={projectEditDialog.item}
        isOpen={projectEditDialog.isOpen}
        onClose={projectEditDialog.close}
        onSuccess={() => {
          onRefetchWorkflows()
          onRefetchProjects()
        }}
      />

      <NxConfirmationDialog
        isOpen={projectDeleteDialog.isOpen}
        onClose={projectDeleteDialog.close}
        onConfirm={() => {
          if (projectDeleteDialog.item) {
            onDeleteProject(projectDeleteDialog.item)
          }
          // Dialog closes in onSettled callback passed to useProjectActions
        }}
        title="Delete project?"
        confirmLabel="Delete"
        confirmVariant="danger"
        titleIconVariant="warning"
        confirmLoading={isDeletingProject}
        destructiveAcknowledgement={{
          checkboxId: 'delete-project-ack',
          label:
            'I understand this project, its workflows, and role assignments will be permanently deleted or removed.',
        }}
      >
        <Stack hasGutter>
          <StackItem>
            The project <strong>{projectDeleteDialog.item?.name}</strong> will be deleted. This cannot be undone.
          </StackItem>
          <StackItem>
            <List>
              <ListItem>All workflows in this project will be permanently deleted.</ListItem>
              <ListItem>All project role assignments will be removed.</ListItem>
            </List>
          </StackItem>
        </Stack>
      </NxConfirmationDialog>
    </>
  )
}
