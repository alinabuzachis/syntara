import { NxLabel } from './labels/NxLabel'
import { derivePublishStatus, type PublishDisplayStatus } from './publishStatusUtils'

type BadgeConfig = {
  color: 'green' | 'yellow' | 'grey'
  label: string
}

const publishBadgeConfig: Record<PublishDisplayStatus, BadgeConfig> = {
  published: { color: 'green', label: 'Published' },
  unpublished_changes: { color: 'yellow', label: 'Unpublished changes' },
  unpublished: { color: 'grey', label: 'Draft' },
}

type WorkflowPublishStatusBadgeProps = Readonly<{
  publishedVersion: number | null | undefined
  currentVersion: number | undefined
}>

export function WorkflowPublishStatusBadge({ publishedVersion, currentVersion }: WorkflowPublishStatusBadgeProps) {
  const displayStatus = derivePublishStatus(publishedVersion, currentVersion)
  const { color, label } = publishBadgeConfig[displayStatus]

  return <NxLabel color={color}>{label}</NxLabel>
}
