import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { CircleDashed, Loader2, Pause, CheckCircle2, XCircle, Ban } from 'lucide-react'

type ExecutionStatus = WorkflowAPI.components['schemas']['ExecutionStatus']

export const statusIcons: Record<ExecutionStatus, React.ComponentType<{ className?: string }>> = {
  pending: CircleDashed,
  running: Loader2,
  paused: Pause,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: Ban,
}

export const statusColors: Record<ExecutionStatus, string> = {
  pending: 'text-gray-400',
  running: 'text-blue-400',
  paused: 'text-yellow-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-orange-400',
}
