import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { Flex, FlexItem } from '@patternfly/react-core'

import { statusIcons, statusColors } from './executionStatusConstants'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

export function StatusLabel({ status }: { status: ExecutionStatus }) {
  const IconComponent = statusIcons[status]
  const color = statusColors[status]
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
      <FlexItem>
        <IconComponent style={{ color, fill: color, stroke: color }} />
      </FlexItem>
      <FlexItem style={{ color }}>{capitalizedStatus}</FlexItem>
    </Flex>
  )
}
