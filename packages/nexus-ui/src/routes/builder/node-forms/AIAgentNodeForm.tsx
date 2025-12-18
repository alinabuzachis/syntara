import { Form, Input, NativeSelect, Textarea, useFormContext } from '@ansible/nexus-ui-framework'
import { Button, FormGroup, Stack, StackItem } from '@patternfly/react-core'

interface AIAgentFormData {
  name: string
  agent: string
  tools: string
  prompt: string
  model: string
}

interface AIAgentNodeFormProps {
  onSubmit: (data: AIAgentFormData) => void
  onCancel: () => void
  submitButtonText?: string
}

function AIAgentFormFields({ submitButtonText }: { submitButtonText?: string }) {
  const { register } = useFormContext<AIAgentFormData>()
  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Activity Name" isRequired fieldId="agent-name">
          <Input {...register('name', { required: true })} id="agent-name" placeholder="Enter activity name" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Agent / MCP Server" isRequired fieldId="agent-agent">
          <Input {...register('agent', { required: true })} id="agent-agent" placeholder="mcp://agent-server" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tools (comma-separated)" fieldId="agent-tools">
          <Input {...register('tools')} id="agent-tools" placeholder="tool1, tool2, tool3" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Model" fieldId="agent-model">
          <NativeSelect {...register('model')} id="agent-model">
            <option value="claude-3-opus">Claude 3 Opus</option>
            <option value="claude-3-sonnet">Claude 3 Sonnet</option>
            <option value="gpt-4">GPT-4</option>
            <option value="gpt-4-turbo">GPT-4 Turbo</option>
            <option value="gemini-pro">Gemini Pro</option>
          </NativeSelect>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Prompt" fieldId="agent-prompt">
          <Textarea
            {...register('prompt')}
            id="agent-prompt"
            placeholder="Natural language instructions for the agent..."
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <Button type="submit" variant="primary" style={{ width: '100%' }}>
          {submitButtonText ?? 'Add node'}
        </Button>
      </StackItem>
    </Stack>
  )
}

export function AIAgentNodeForm(props: AIAgentNodeFormProps) {
  const defaultValues: AIAgentFormData = {
    name: '',
    agent: '',
    tools: '',
    prompt: '',
    model: 'claude-3-sonnet',
  }

  const handleSubmit = (data: AIAgentFormData) => {
    props.onSubmit(data)
  }

  return (
    <Form<AIAgentFormData> id="ai-agent-node-form" defaultValues={defaultValues} onSubmit={handleSubmit}>
      {() => <AIAgentFormFields submitButtonText={props.submitButtonText} />}
    </Form>
  )
}
