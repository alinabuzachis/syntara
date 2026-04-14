import { Label } from '@patternfly/react-core'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'

interface ScopeLabelProps {
  /** Project UUID, or null/undefined for system scope */
  projectId?: string | null
  /** Map of project IDs to project names for display */
  projectNameMap: Map<string, string>
}

/**
 * Renders a scope indicator label for policies and roles.
 * - System-scoped items show a blue "System" label
 * - Project-scoped items show a green label with the project name as a navigable link
 */
export function ScopeLabel({ projectId, projectNameMap }: Readonly<ScopeLabelProps>) {
  if (!projectId) {
    return (
      <Label color="blue" isCompact>
        System
      </Label>
    )
  }

  return (
    <Label
      color="green"
      isCompact
      onClick={(e) => {
        e.stopPropagation()
        navigate(AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId))
      }}
      style={{ cursor: 'pointer' }}
    >
      {projectNameMap.get(projectId) ?? projectId}
    </Label>
  )
}
