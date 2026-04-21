import { Button, Label } from '@patternfly/react-core'
import type { Ref } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'

import styles from './ScopeLabel.module.css'

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
        <span className={className} ref={componentRef as Ref<HTMLSpanElement>}>
          <Button
            variant="link"
            isInline
            className={styles.labelButton}
            onClick={(e) => {
              e.stopPropagation()
              navigate(projectUrl)
            }}
          >
            {content}
          </Button>
        </span>
      )}
    >
      {projectNameMap.get(projectId) ?? projectId}
    </Label>
  )
}
