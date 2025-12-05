import { Button, Card, Form, Input, NativeSelect, Textarea, useFormContext } from '@ansible/nexus-ui-framework'

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
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="approval-name" className="text-xs font-medium text-gray-300">
          Activity Name <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('name', { required: true })}
          id="approval-name"
          placeholder="Enter activity name"
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="approval-approvers" className="text-xs font-medium text-gray-300">
          Approvers (comma-separated) <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('approvers', { required: true })}
          id="approval-approvers"
          placeholder="user1@example.com, user2@example.com"
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="approval-prompt" className="text-xs font-medium text-gray-300">
          Approval Prompt <span className="text-red-500">*</span>
        </label>
        <Textarea
          {...register('prompt', { required: true })}
          id="approval-prompt"
          placeholder="Please approve this deployment to production"
          rows={3}
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="approval-timeout" className="text-xs font-medium text-gray-300">
          Timeout (ISO 8601)
        </label>
        <Input {...register('timeout')} id="approval-timeout" placeholder="P1D" className="text-xs" />
        <p className="text-xs text-gray-400">Examples: PT1H (1 hour), PT30M (30 min), P1D (1 day)</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="approval-onTimeout" className="text-xs font-medium text-gray-300">
          On Timeout
        </label>
        <NativeSelect {...register('onTimeout')} id="approval-onTimeout">
          <option value="fail">Fail</option>
          <option value="approve">Auto-Approve</option>
          <option value="reject">Auto-Reject</option>
        </NativeSelect>
      </div>
      <Button type="submit" variant="primary" className="w-full justify-center text-xs">
        {submitButtonText ?? 'Add node'}
      </Button>
    </>
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
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <Form<ApprovalFormData>
        id="approval-node-form"
        defaultValues={defaultValues}
        onSubmit={props.onSubmit}
        className="flex flex-col gap-3"
      >
        {() => <ApprovalFormFields submitButtonText={props.submitButtonText} />}
      </Form>
    </Card>
  )
}
