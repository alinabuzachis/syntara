import { NxLabel } from '../../components/labels/NxLabel'

import type { VersionStatus } from './hooks/useVersionHistory'
export type { VersionStatus }

const statusConfig: Record<VersionStatus, { label: string; color: 'grey' | 'green' | 'teal' }> = {
  draft: { label: 'Draft', color: 'grey' },
  published: { label: 'Published', color: 'green' },
  previously_published: { label: 'Prev. published', color: 'teal' },
}

export function VersionStatusBadge({ status }: Readonly<{ status: VersionStatus }>) {
  const { label, color } = statusConfig[status]
  return <NxLabel color={color}>{label}</NxLabel>
}
