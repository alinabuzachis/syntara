import { Form, FormGroup, FormSelect, FormSelectOption, Stack, StackItem, TextArea } from '@patternfly/react-core'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ActivityNameField } from './shared/ActivityNameField'
import { FormSubmitButton } from './shared/FormSubmitButton'

// Type definitions
export interface AIAgentFormData {
  name: string
  model: string
  prompt: string
  tools: string
}

interface AIAgentNodeFormProps {
  onSubmit: (data: AIAgentFormData) => void
  onCancel: () => void
  submitButtonText?: string
  initialData?: Partial<AIAgentFormData>
}

/**
 * Form fields component for AI Agent node configuration
 */
function AIAgentFormFields({ submitButtonText }: { submitButtonText?: string }) {
  const { register, control } = useFormContext<AIAgentFormData>()
  return (
    <Stack hasGutter>
      <ActivityNameField register={register} fieldId="agent-name" label="Agent name" placeholder="Enter agent name" />
      <StackItem>
        <FormGroup label="Prompt" fieldId="agent-prompt" isRequired>
          <TextArea
            {...register('prompt', { required: true })}
            id="agent-prompt"
            placeholder="Natural language instructions for the agent..."
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tools" fieldId="agent-tools">
          <Controller
            control={control}
            name="tools"
            defaultValue=""
            render={({ field }) => (
              <FormSelect
                id="agent-tools"
                aria-label="Tools"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
                isDisabled
              >
                <FormSelectOption value="" label="All tools selected" />
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>
      <FormSubmitButton submitButtonText={submitButtonText} />
    </Stack>
  )
}

export function AIAgentNodeForm(props: AIAgentNodeFormProps) {
  // Get model from environment variable or use default
  const defaultModel = import.meta.env.VITE_NEXUS_OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'

  const defaultValues: AIAgentFormData = {
    name: '',
    model: defaultModel,
    prompt: '',
    tools: '',
    ...props.initialData,
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
