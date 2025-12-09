import { Button, Card, Form, Input, NativeSelect, Textarea, useFormContext } from '@ansible/nexus-ui-framework'

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
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="agent-name" className="text-xs font-medium text-gray-300">
          Activity Name <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('name', { required: true })}
          id="agent-name"
          placeholder="Enter activity name"
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="agent-agent" className="text-xs font-medium text-gray-300">
          Agent / MCP Server <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('agent', { required: true })}
          id="agent-agent"
          placeholder="mcp://agent-server"
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="agent-tools" className="text-xs font-medium text-gray-300">
          Tools (comma-separated)
        </label>
        <Input {...register('tools')} id="agent-tools" placeholder="tool1, tool2, tool3" className="text-xs" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="agent-model" className="text-xs font-medium text-gray-300">
          Model
        </label>
        <NativeSelect {...register('model')} id="agent-model">
          <option value="claude-3-opus">Claude 3 Opus</option>
          <option value="claude-3-sonnet">Claude 3 Sonnet</option>
          <option value="gpt-4">GPT-4</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
          <option value="gemini-pro">Gemini Pro</option>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="agent-prompt" className="text-xs font-medium text-gray-300">
          Prompt
        </label>
        <Textarea
          {...register('prompt')}
          id="agent-prompt"
          placeholder="Natural language instructions for the agent..."
          rows={3}
          className="text-xs"
        />
      </div>
      <Button type="submit" variant="primary" className="w-full justify-center text-xs">
        {submitButtonText ?? 'Add node'}
      </Button>
    </>
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
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <Form<AIAgentFormData>
        id="ai-agent-node-form"
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {() => <AIAgentFormFields submitButtonText={props.submitButtonText} />}
      </Form>
    </Card>
  )
}
