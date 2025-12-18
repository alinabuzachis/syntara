import { Form, Input, NativeSelect, Textarea, useFormContext } from '@ansible/nexus-ui-framework'
import { Button, FormGroup, Stack, StackItem } from '@patternfly/react-core'

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
  const { register } = useFormContext<ApprovalFormData>()
  return (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Activity Name" isRequired fieldId="approval-name">
          <Input {...register('name', { required: true })} id="approval-name" placeholder="Enter activity name" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Approvers (comma-separated)" isRequired fieldId="approval-approvers">
          <Input
            {...register('approvers', { required: true })}
            id="approval-approvers"
            placeholder="user1@example.com, user2@example.com"
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Approval Prompt" isRequired fieldId="approval-prompt">
          <Textarea
            {...register('prompt', { required: true })}
            id="approval-prompt"
            placeholder="Please approve this deployment to production"
            rows={3}
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup
          label="Timeout (ISO 8601)"
          fieldId="approval-timeout"
          helperText="Examples: PT1H (1 hour), PT30M (30 min), P1D (1 day)"
        >
          <Input {...register('timeout')} id="approval-timeout" placeholder="P1D" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="On Timeout" fieldId="approval-onTimeout">
          <NativeSelect {...register('onTimeout')} id="approval-onTimeout">
            <option value="fail">Fail</option>
            <option value="approve">Auto-Approve</option>
            <option value="reject">Auto-Reject</option>
          </NativeSelect>
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

export function ApprovalNodeForm(props: ApprovalNodeFormProps) {
  const defaultValues: ApprovalFormData = {
    name: '',
    approvers: '',
    prompt: '',
    timeout: 'P1D',
    onTimeout: 'fail',
  }

  return (
    <Form<ApprovalFormData> id="approval-node-form" defaultValues={defaultValues} onSubmit={props.onSubmit}>
      {() => <ApprovalFormFields submitButtonText={props.submitButtonText} />}
    </Form>
  )
}
