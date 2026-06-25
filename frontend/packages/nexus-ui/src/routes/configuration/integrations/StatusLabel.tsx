import { IntegrationStatusEnum } from '@ansible/nexus-contracts'
import { RhUiCheckCircleIcon, RhUiCloseCircleIcon, RhUiMinusCircleIcon, RhUiSyncIcon } from '@patternfly/react-icons'

import { NxLabel } from '../../../components/labels/NxLabel'

type IntegrationStatus = (typeof IntegrationStatusEnum)[keyof typeof IntegrationStatusEnum]

const statusMap: Record<IntegrationStatus, 'success' | 'danger' | 'custom'> = {
  [IntegrationStatusEnum.UNKNOWN]: 'custom',
  [IntegrationStatusEnum.AVAILABLE]: 'success',
  [IntegrationStatusEnum.ERROR]: 'danger',
  [IntegrationStatusEnum.VALIDATING]: 'custom',
}

const statusIcons: Record<IntegrationStatus, React.ComponentType<{ className?: string }>> = {
  [IntegrationStatusEnum.UNKNOWN]: RhUiMinusCircleIcon,
  [IntegrationStatusEnum.AVAILABLE]: RhUiCheckCircleIcon,
  [IntegrationStatusEnum.ERROR]: RhUiCloseCircleIcon,
  [IntegrationStatusEnum.VALIDATING]: RhUiSyncIcon,
}

export function StatusLabel({ status }: Readonly<{ status: string }>) {
  const integrationStatus = status as IntegrationStatus
  const Icon = statusIcons[integrationStatus] || RhUiCloseCircleIcon
  const labelStatus = statusMap[integrationStatus] || 'custom'
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <NxLabel status={labelStatus} icon={<Icon />}>
      {capitalizedStatus}
    </NxLabel>
  )
}
