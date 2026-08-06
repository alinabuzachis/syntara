import { FlexItem } from '@patternfly/react-core'

import { NxLabel } from '../../components/labels/NxLabel'

import { formatHistoryDateTime } from './historyDateUtils'
import { isVersionStatus } from './hooks/useVersionHistory'
import { VersionStatusBadge } from './VersionStatusBadge'

export function BuilderVersionViewTitleRowAddons({
  viewedVersionDate,
  viewedVersionStatus,
}: Readonly<{
  viewedVersionDate?: string | null
  viewedVersionStatus?: string | null
}>) {
  return (
    <>
      {viewedVersionDate ? (
        <FlexItem>
          <NxLabel color="grey">Viewing {formatHistoryDateTime(viewedVersionDate)}</NxLabel>
        </FlexItem>
      ) : null}
      {viewedVersionStatus && isVersionStatus(viewedVersionStatus) ? (
        <FlexItem>
          <VersionStatusBadge status={viewedVersionStatus} />
        </FlexItem>
      ) : null}
    </>
  )
}
