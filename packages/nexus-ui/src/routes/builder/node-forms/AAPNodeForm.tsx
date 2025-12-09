import { Button, Card, Form, Input, NativeSelect, Textarea, useFormContext } from '@ansible/nexus-ui-framework'
import { useState } from 'react'

export interface AAPFormData {
  name: string
  connectorId: string
  operation: string
  parameters: string
}

interface AAPNodeFormProps {
  onSubmit: (data: AAPFormData) => void
  onCancel: () => void
  initialData?: Partial<AAPFormData>
  submitButtonText?: string
}

function AAPFormFields({ submitButtonText }: { submitButtonText?: string }) {
  const { register } = useFormContext<AAPFormData>()
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Validate JSON on change
  const validateJSON = (value: string) => {
    if (value.trim()) {
      try {
        JSON.parse(value)
        setJsonError(null)
        return true
      } catch {
        setJsonError('Invalid JSON format')
        return false
      }
    } else {
      setJsonError(null)
      return true
    }
  }

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
          {...register('parameters', {
            validate: validateJSON,
            onChange: (e) => validateJSON(e.target.value),
          })}
          id="aap-parameters"
          placeholder='{"job_template_id": "123", "extra_vars": {}}'
          rows={4}
          className={`font-mono text-xs ${jsonError ? 'ring-2 ring-red-500/50' : ''}`}
        />
        {jsonError && <span className="text-xs text-red-400">{jsonError}</span>}
        <p className="text-xs text-gray-400">
          Optional: Provide parameters as a JSON object for the connector operation
        </p>
      </div>
      <Button type="submit" variant="primary" className="w-full justify-center text-xs" disabled={!!jsonError}>
        {submitButtonText ?? 'Add node'}
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
    ...props.initialData,
  }

  const handleSubmit = (data: AAPFormData) => {
    props.onSubmit(data)
  }

  return (
    <Card variant="glass" padding="md" className="flex flex-col gap-3">
      <Form<AAPFormData>
        id="aap-node-form"
        defaultValues={defaultValues}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3"
      >
        {() => <AAPFormFields submitButtonText={props.submitButtonText} />}
      </Form>
    </Card>
  )
}
