import type { WorkflowAPI } from '@ansible/nexus-contracts'
import {
  RhUiCheckCircleIcon,
  RhUiDuplicateIcon,
  RhUiEditFillIcon,
  RhUiExportIcon,
  RhUiHistoryIcon,
  RhUiMinusCircleFillIcon,
  RhUiPlayIcon,
  RhUiTrashIcon,
} from '@patternfly/react-icons'

import { IconLabel } from '../../components/IconLabel'

import type { useWorkflowPermissions } from './useWorkflowPermissions'
import type { RowAction } from './WorkflowsTableBody'

type Workflow = WorkflowAPI.components['schemas']['WorkflowRead']

export type WorkflowRowActionCallbacks = {
  setLocation: (path: string) => void
  onRun: (wf: Workflow) => void
  onDuplicate: (wf: Workflow) => void
  onExport: (wf: Workflow) => void
  onPublish: (wf: Workflow) => void
  onUnpublish: (wf: Workflow) => void
  onDelete: (wf: Workflow) => void
  isDuplicating: boolean
}

export function buildWorkflowRowActions(
  workflow: Workflow,
  permissions: ReturnType<typeof useWorkflowPermissions>,
  callbacks: WorkflowRowActionCallbacks
): RowAction[] {
  if (workflow.is_builtin) return []

  const noUpdate = permissions.canUpdate ? undefined : { content: permissions.tooltips.update }
  const noCreate = permissions.canCreate ? undefined : { content: permissions.tooltips.create }
  const noRun = permissions.canRun ? undefined : { content: permissions.tooltips.run }
  const noDelete = permissions.canDelete ? undefined : { content: permissions.tooltips.delete }

  return [
    {
      key: 'edit',
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit workflow</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: noUpdate,
      onClick: () => callbacks.setLocation(`/workflow-builder/${workflow.id}`),
    },
    {
      key: 'run',
      title: <IconLabel icon={<RhUiPlayIcon />}>Run workflow</IconLabel>,
      isAriaDisabled: !permissions.canRun,
      tooltipProps: noRun,
      onClick: () => callbacks.onRun(workflow),
    },
    {
      key: 'history',
      title: <IconLabel icon={<RhUiHistoryIcon />}>View run history</IconLabel>,
      onClick: () => callbacks.setLocation(`/executions?workflow_id=${workflow.id}`),
    },
    {
      key: 'duplicate',
      title: <IconLabel icon={<RhUiDuplicateIcon />}>Duplicate workflow</IconLabel>,
      isDisabled: callbacks.isDuplicating,
      isAriaDisabled: !permissions.canCreate,
      tooltipProps: noCreate,
      onClick: () => callbacks.onDuplicate(workflow),
    },
    {
      key: 'export',
      title: <IconLabel icon={<RhUiExportIcon />}>Export workflow</IconLabel>,
      onClick: () => callbacks.onExport(workflow),
    },
    {
      key: 'publish',
      title: <IconLabel icon={<RhUiCheckCircleIcon />}>Publish workflow</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: noUpdate,
      onClick: () => callbacks.onPublish(workflow),
    },
    ...(workflow.published_version == null
      ? []
      : [
          {
            key: 'unpublish',
            title: <IconLabel icon={<RhUiMinusCircleFillIcon />}>Unpublish workflow</IconLabel>,
            isAriaDisabled: !permissions.canUpdate,
            tooltipProps: noUpdate,
            onClick: () => callbacks.onUnpublish(workflow),
          } satisfies RowAction,
        ]),
    {
      key: 'sep-delete',
      isSeparator: true,
    },
    {
      key: 'delete',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete workflow</IconLabel>,
      isAriaDisabled: !permissions.canDelete,
      tooltipProps: noDelete,
      isDanger: true,
      onClick: () => callbacks.onDelete(workflow),
    },
  ]
}
