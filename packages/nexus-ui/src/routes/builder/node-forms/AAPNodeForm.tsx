import { Button, Card, Checkbox, Form, Input, NativeSelect, Textarea } from '@ansible/nexus-ui-framework'
import { Controller, type UseFormRegister, type Control } from 'react-hook-form'

interface AAPFormData {
  name: string
  connectorId: string
  operation: string
  parameters: string
  requiresApproval?: boolean
}

interface AAPNodeFormProps {
  onSubmit: (data: AAPFormData) => void
  onCancel: () => void
}

function AAPFormFields({
  register,
  control,
}: {
  register: UseFormRegister<AAPFormData>
  control: Control<AAPFormData>
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="aap-name" className="text-xs font-medium text-gray-300">
          Activity Name <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('name', { required: true })}
          id="aap-name"
          placeholder="Enter activity name"
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="aap-connectorId" className="text-xs font-medium text-gray-300">
          Connector ID <span className="text-red-500">*</span>
        </label>
        <Input
          {...register('connectorId', { required: true })}
          id="aap-connectorId"
          placeholder="ansible-automation-platform"
          className="text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="aap-operation" className="text-xs font-medium text-gray-300">
          Operation
        </label>
        <NativeSelect {...register('operation')} id="aap-operation">
          <option value="launch_job">Launch Job Template</option>
          <option value="launch_workflow">Launch Workflow Template</option>
          <option value="get_job_status">Get Job Status</option>
          <option value="cancel_job">Cancel Job</option>
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="aap-parameters" className="text-xs font-medium text-gray-300">
          Parameters (JSON)
        </label>
        <Textarea
          {...register('parameters')}
          id="aap-parameters"
          placeholder='{"job_template_id": "123", "extra_vars": {}}'
          rows={4}
          className="font-mono text-xs"
        />
      </div>
      <Controller
        control={control}
        name="requiresApproval"
        render={({ field }) => (
          <Checkbox checked={field.value} onCheckedChange={field.onChange} label="Require approval" />
        )}
      />
      <Button type="submit" variant="primary" className="w-full justify-center text-xs">
        Add node
      </Button>
    </>
  )
}

export function AAPNodeForm(props: AAPNodeFormProps) {
  const defaultValues: AAPFormData = {
    name: '',
    connectorId: '',
    operation: 'launch_job',
    parameters: '',
    requiresApproval: false,
  }

  const handleSubmit = (data: AAPFormData) => {
    const cleanedData: AAPFormData = {
      ...data,
      requiresApproval: data.requiresApproval || undefined,
    }
    props.onSubmit(cleanedData)
  }

  return (
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <Form<AAPFormData>
        id="aap-node-form"
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {({ register, control }) => <AAPFormFields register={register} control={control} />}
      </Form>
    </Card>
  )
}
