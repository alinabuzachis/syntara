import { Label } from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiEditIcon, RhUiMinusCircleFillIcon } from '@patternfly/react-icons'
import type React from 'react'

import { derivePublishStatus, type PublishDisplayStatus } from './publishStatusUtils'

type BadgeConfig = {
  icon: React.ComponentType<{ className?: string }>
  label: string
} & ({ status: 'success' | 'warning' } | { color: 'grey' })

const publishBadgeConfig: Record<PublishDisplayStatus, BadgeConfig> = {
  published: { status: 'success', icon: RhUiCheckCircleIcon, label: 'Published' },
  unpublished_changes: { status: 'warning', icon: RhUiEditIcon, label: 'Unpublished changes' },
  unpublished: { color: 'grey', icon: RhUiMinusCircleFillIcon, label: 'Draft' },
}

type WorkflowPublishStatusBadgeProps = Readonly<{
  publishedVersion: number | null | undefined
  currentVersion: number | undefined
}>

export function WorkflowPublishStatusBadge({ publishedVersion, currentVersion }: WorkflowPublishStatusBadgeProps) {
  const displayStatus = derivePublishStatus(publishedVersion, currentVersion)
  const config = publishBadgeConfig[displayStatus]
  const IconComponent = config.icon

  const colorProps = 'status' in config ? { status: config.status } : { color: config.color as 'grey' }

  return (
    <Label {...colorProps} icon={<IconComponent />}>
      {config.label}
    </Label>
  )
}
