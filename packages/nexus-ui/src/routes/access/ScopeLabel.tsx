import { Button, Label } from '@patternfly/react-core'
import type { Ref } from 'react'
import { navigate } from 'wouter/use-browser-location'

import { AppRoute } from '../../app/AppRoute'

import styles from './ScopeLabel.module.css'

const SCOPE_DISPLAY: Record<string, { label: string; color: 'blue' | 'green' | 'teal' }> = {
  system: { label: 'System', color: 'blue' },
  any: { label: 'Any', color: 'blue' },
  self: { label: 'Self', color: 'teal' },
  project: { label: 'Project', color: 'green' },
}

interface ScopeLabelProps {
  scope?: string | null
}

export function ScopeLabel({ scope }: Readonly<ScopeLabelProps>) {
  const display = SCOPE_DISPLAY[scope ?? ''] ?? SCOPE_DISPLAY.system

  return (
    <Label color={display.color} isCompact>
      {display.label}
    </Label>
  )
}

interface ProjectLabelProps {
  projectId?: string | null
  projectNameMap: Map<string, string>
}

export function ProjectLabel({ projectId, projectNameMap }: Readonly<ProjectLabelProps>) {
  if (!projectId) {
    return <>-</>
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
