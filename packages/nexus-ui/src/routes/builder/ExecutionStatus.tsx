import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { statusIcons, statusColors } from './executionStatusConstants'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

export function StatusLabel({ status }: { status: ExecutionStatus }) {
  const Icon = statusIcons[status]
  const colorClass = statusColors[status]
  const capitalizedStatus = status.charAt(0).toUpperCase() + status.slice(1)

  return (
    <div className={`flex items-center gap-1.5 ${colorClass}`}>
      <Icon className="size-4" />
      <span>{capitalizedStatus}</span>
    </div>
  )
}
