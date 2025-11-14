import { FileCode } from 'lucide-react'
import type { WorkflowAPI } from '@ansible/nexus-contracts'
import { SidePanel } from '@ansible/nexus-ui-framework'
import { Detail } from '../../components/details/Detail'
import { Details } from '../../components/details/Details'
import { CodeBlock } from '../../components/details/CodeBlock'

type Workflow = WorkflowAPI.components['schemas']['Workflow']

interface WorkflowSidepanelProps {
  workflow: Workflow
  workflowName: string
  workflowDescription: string
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onClose: () => void
}

export function WorkflowSidepanel(props: WorkflowSidepanelProps) {
  return (
    <SidePanel onClose={props.onClose} title="Workflow Details" icon={FileCode} width="xl">
      <Details>
        <Detail label="Workflow Name">
          <input
            type="text"
            value={props.workflowName}
            onChange={(e) => props.onNameChange(e.target.value)}
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm"
          />
        </Detail>
        <Detail label="Description">
          <textarea
            value={props.workflowDescription}
            onChange={(e) => props.onDescriptionChange(e.target.value)}
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm"
            rows={3}
          />
        </Detail>
        {props.workflow.version?.workflow_definition && (
          <Detail label="Workflow Definition">
            <CodeBlock jsonObject={props.workflow.version.workflow_definition} />
          </Detail>
        )}
      </Details>
    </SidePanel>
  )
}
