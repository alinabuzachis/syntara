import { Label } from '@patternfly/react-core'

import { AppRoute } from '../../app/AppRoute'

interface ScopeLabelProps {
  /** Project UUID, or null/undefined for system scope */
  projectId?: string | null
  /** Map of project IDs to project names for display */
  projectNameMap: Map<string, string>
}

export function ScopeLabel({ projectId, projectNameMap }: Readonly<ScopeLabelProps>) {
  if (!projectId) {
    return (
      <Label color="blue" isCompact>
        System
      </Label>
    )
  }

  const projectUrl = AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId)

  return (
    <Label
      color="green"
      isCompact
      render={({ className, content, componentRef }) => (
        <a
          href={projectUrl}
          className={className}
          ref={componentRef as React.Ref<HTMLAnchorElement>}
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          {content}
        </a>
      )}
    >
      {projectNameMap.get(projectId) ?? projectId}
    </Label>
  )
}
