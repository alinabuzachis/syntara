import {
  Form,
  FormGroup,
  FormSelect,
  FormSelectOption,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ActivityNameField } from './shared/ActivityNameField'
import { FormSubmitButton } from './shared/FormSubmitButton'

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
  const { register, control } = useFormContext<AIAgentFormData>()
  return (
    <Stack hasGutter>
      <ActivityNameField register={register} fieldId="agent-name" />
      <StackItem>
        <FormGroup label="Agent / MCP Server" isRequired fieldId="agent-agent">
          <TextInput
            {...register('agent', { required: true })}
            id="agent-agent"
            placeholder="mcp://agent-server"
            type="text"
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tools (comma-separated)" fieldId="agent-tools">
          <TextInput {...register('tools')} id="agent-tools" placeholder="tool1, tool2, tool3" type="text" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Model" fieldId="agent-model">
          <Controller
            control={control}
            name="model"
            defaultValue="claude-3-sonnet"
            render={({ field }) => (
              <FormSelect
                id="agent-model"
                aria-label="Model"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
              >
                <FormSelectOption value="claude-3-opus" label="Claude 3 Opus" />
                <FormSelectOption value="claude-3-sonnet" label="Claude 3 Sonnet" />
                <FormSelectOption value="gpt-4" label="GPT-4" />
                <FormSelectOption value="gpt-4-turbo" label="GPT-4 Turbo" />
                <FormSelectOption value="gemini-pro" label="Gemini Pro" />
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Prompt" fieldId="agent-prompt">
          <TextArea
            {...register('prompt')}
            id="agent-prompt"
            placeholder="Natural language instructions for the agent..."
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <FormSubmitButton submitButtonText={submitButtonText} />
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

  const methods = useForm<AIAgentFormData>({
    defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <Form id="ai-agent-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <AIAgentFormFields submitButtonText={props.submitButtonText} />
      </Form>
    </FormProvider>
  )
}
