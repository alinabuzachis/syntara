import { Button, Label } from '@patternfly/react-core'
import { RhUiLockIcon } from '@patternfly/react-icons'
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

type ScopeLabelProps = {
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

type PolicyTypeLabelProps = {
  isBuiltin?: boolean
}

export function PolicyTypeLabel({ isBuiltin }: Readonly<PolicyTypeLabelProps>) {
  if (isBuiltin) {
    return (
      <Label color="grey" icon={<RhUiLockIcon />} isCompact>
        Built-in
      </Label>
    )
  }
  return (
    <Label color="blue" isCompact>
      Custom
    </Label>
  )
}

type ProjectLabelProps = {
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
