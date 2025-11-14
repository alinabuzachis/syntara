import { Button, Scrollable, Input, Textarea, Card, Heading } from '@ansible/nexus-ui-framework'
import { FileCode, XIcon } from 'lucide-react'
import type { WorkflowAPI } from '@ansible/nexus-contracts'
import clsx from 'clsx'
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
    <Card
      variant="glass"
      padding="none"
      className={clsx('flex max-h-full max-w-100 flex-col gap-4 rounded-4xl border-2 py-6')}
    >
      <header className="flex items-center justify-between px-6">
        <Heading level={2} size="lg" className="flex items-center gap-2">
          <FileCode className="size-5" />
          Workflow Details
        </Heading>
        <Button variant="plain" onClick={props.onClose} className="p-1">
          <XIcon className="size-4" />
        </Button>
      </header>
      <Scrollable className="px-6">
        <Details>
          <Detail label="Workflow Name">
            <Input
              type="text"
              value={props.workflowName}
              onChange={(e) => props.onNameChange(e.target.value)}
              className="w-full text-sm"
            />
          </Detail>
          <Detail label="Description">
            <Textarea
              value={props.workflowDescription}
              onChange={(e) => props.onDescriptionChange(e.target.value)}
              className="w-full text-sm"
              rows={3}
            />
          </Detail>
          {props.workflow.version?.workflow_definition && (
            <Detail label="Workflow Definition">
              <CodeBlock jsonObject={props.workflow.version.workflow_definition} />
            </Detail>
          )}
        </Details>
      </Scrollable>
    </Card>
  )
}
