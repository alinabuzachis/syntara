import {
  Form,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ActivityNameField } from './shared/ActivityNameField'
import { FormSubmitButton } from './shared/FormSubmitButton'

interface ApprovalFormData {
  name: string
  approvers: string
  prompt: string
  timeout: string
  onTimeout: string
}

interface ApprovalNodeFormProps {
  onSubmit: (data: ApprovalFormData) => void
  onCancel: () => void
  submitButtonText?: string
}

function ApprovalFormFields({ submitButtonText }: { submitButtonText?: string }) {
  const { register, control } = useFormContext<ApprovalFormData>()
  return (
    <Stack hasGutter>
      <ActivityNameField register={register} fieldId="approval-name" />
      <StackItem>
        <FormGroup label="Approvers (comma-separated)" isRequired fieldId="approval-approvers">
          <TextInput
            {...register('approvers', { required: true })}
            id="approval-approvers"
            placeholder="user1@example.com, user2@example.com"
            type="text"
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Approval Prompt" isRequired fieldId="approval-prompt">
          <TextArea
            {...register('prompt', { required: true })}
            id="approval-prompt"
            placeholder="Please approve this deployment to production"
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Timeout (ISO 8601)" fieldId="approval-timeout">
          <TextInput {...register('timeout')} id="approval-timeout" placeholder="P1D" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Examples: PT1H (1 hour), PT30M (30 min), P1D (1 day)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="On Timeout" fieldId="approval-onTimeout">
          <Controller
            control={control}
            name="onTimeout"
            render={({ field }) => (
              <FormSelect
                id="approval-onTimeout"
                aria-label="On Timeout"
                value={field.value}
                onChange={(_event, value) => field.onChange(value)}
              >
                <FormSelectOption value="fail" label="Fail" />
                <FormSelectOption value="approve" label="Auto-Approve" />
                <FormSelectOption value="reject" label="Auto-Reject" />
              </FormSelect>
            )}
          />
        </FormGroup>
      </StackItem>
      <FormSubmitButton submitButtonText={submitButtonText} />
    </Stack>
  )
}

export function ApprovalNodeForm(props: ApprovalNodeFormProps) {
  const defaultValues: ApprovalFormData = {
    name: '',
    approvers: '',
    prompt: '',
    timeout: 'P1D',
    onTimeout: 'fail',
  }

  const methods = useForm<ApprovalFormData>({
    defaultValues,
  })

  return (
    <FormProvider {...methods}>
      <Form id="approval-node-form" onSubmit={methods.handleSubmit(props.onSubmit)}>
        <ApprovalFormFields submitButtonText={props.submitButtonText} />
      </Form>
    </FormProvider>
  )
}
