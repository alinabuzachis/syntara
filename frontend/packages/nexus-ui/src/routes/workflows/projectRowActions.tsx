import { RhUiEditFillIcon, RhUiTrashIcon } from '@patternfly/react-icons'

import { IconLabel } from '../../components/IconLabel'
import type { ProjectRead } from '../access/types'
import type { useProjectPermissions } from '../access-management/useProjectPermissions'

import type { RowAction } from './WorkflowsTableBody'

export type ProjectRowActionCallbacks = {
  onEdit: (project: ProjectRead) => void
  onDelete: (project: ProjectRead) => void
}

export function buildProjectRowActions(
  project: ProjectRead | null,
  permissions: ReturnType<typeof useProjectPermissions>,
  callbacks: ProjectRowActionCallbacks
): RowAction[] {
  // No actions for null projects (unknown project) or builtin projects
  if (!project || project.is_builtin) return []
  // Hide the kebab entirely when the user cannot edit or delete (viewer/auditor).
  if (!permissions.isLoading && !permissions.canUpdate && !permissions.canDelete) return []

  const noUpdate = permissions.canUpdate ? undefined : { content: permissions.tooltips.update }
  const noDelete = permissions.canDelete ? undefined : { content: permissions.tooltips.delete }

  return [
    {
      key: 'edit-project',
      title: <IconLabel icon={<RhUiEditFillIcon />}>Edit project</IconLabel>,
      isAriaDisabled: !permissions.canUpdate,
      tooltipProps: noUpdate,
      onClick: () => callbacks.onEdit(project),
    },
    {
      key: 'sep-delete',
      isSeparator: true,
    },
    {
      key: 'delete-project',
      title: <IconLabel icon={<RhUiTrashIcon />}>Delete project</IconLabel>,
      isAriaDisabled: !permissions.canDelete,
      tooltipProps: noDelete,
      isDanger: true,
      onClick: () => callbacks.onDelete(project),
    },
  ]
}
