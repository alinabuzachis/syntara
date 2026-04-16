import { Label } from '@patternfly/react-core'
import type { KeyboardEvent, MouseEvent } from 'react'
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

  const handleNavigate = () => {
    navigate(AppRoute.AccessManagement.ProjectDetail.replace(':projectId', projectId))
  }

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation()
    handleNavigate()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleNavigate()
    }
  }

  return (
    <Label
      color="green"
      isCompact
      isClickable
      render={({ className, content, componentRef }) => (
        <span
          ref={componentRef as React.Ref<HTMLSpanElement>}
          className={className}
          role="link"
          tabIndex={0}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          style={{ cursor: 'pointer' }}
        >
          {content}
        </span>
      )}
    >
      {projectNameMap.get(projectId) ?? projectId}
    </Label>
  )
}
