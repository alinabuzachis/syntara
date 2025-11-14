import { ClockIcon } from 'lucide-react'
import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { SidePanel } from '@ansible/nexus-ui-framework'
import { StatusLabel } from './ExecutionStatus'

type Execution = WorkflowAPI.components['schemas']['Execution']

interface AutomationHistoryCardProps {
  executions: Execution[]
  onClose: () => void
}

export function AutomationHistoryCard(props: AutomationHistoryCardProps) {
  return (
    <SidePanel onClose={props.onClose} title="Run History" icon={ClockIcon} width="md" textSize="text-xs">
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/20">
            <th className="pb-2 text-left font-semibold">Created At</th>
            <th className="pb-2 text-left font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {props.executions.map((execution) => {
            const date = execution.created_at ? new Date(execution.created_at) : null
            return (
              <tr key={execution.id} className="border-b border-white/10">
                <td className="py-2">
                  {date ? (
                    <div className="flex flex-col">
                      <span className="whitespace-nowrap">{date.toLocaleDateString()}</span>
                      <span className="whitespace-nowrap text-white/60">{date.toLocaleTimeString()}</span>
                    </div>
                  ) : (
                    <span>Unknown</span>
                  )}
                </td>
                <td className="py-2">
                  <StatusLabel status={execution.status!} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {props.executions.length === 0 && (
        <div className="py-8 text-center text-white/50">No execution history available</div>
      )}
    </SidePanel>
  )
}
