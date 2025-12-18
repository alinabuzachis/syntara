import { Form, Input, NativeSelect, Textarea, useFormContext } from '@ansible/nexus-ui-framework'
import { Button, FormGroup, FormHelperText, HelperText, HelperTextItem, Stack, StackItem } from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
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
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Activity Name" isRequired fieldId="aap-name">
          <Input {...register('name', { required: true })} id="aap-name" placeholder="Enter activity name" />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Connector ID" isRequired fieldId="aap-connectorId">
          <Input
            {...register('connectorId', { required: true })}
            id="aap-connectorId"
            placeholder="ansible-automation-platform"
          />
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Operation" fieldId="aap-operation">
          <NativeSelect {...register('operation')} id="aap-operation">
            <option value="launch_job">Launch Job Template</option>
            <option value="launch_workflow">Launch Workflow Template</option>
            <option value="get_job_status">Get Job Status</option>
            <option value="cancel_job">Cancel Job</option>
          </NativeSelect>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Parameters (JSON)" fieldId="aap-parameters">
          <Textarea
            {...register('parameters', {
              validate: validateJSON,
              onChange: (e) => validateJSON(e.target.value),
            })}
            id="aap-parameters"
            placeholder='{"job_template_id": "123", "extra_vars": {}}'
            rows={4}
            style={{ fontFamily: 'monospace' }}
          />
          <FormHelperText>
            <HelperText>
              {jsonError ? (
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {jsonError}
                </HelperTextItem>
              ) : (
                <HelperTextItem>
                  Optional: Provide parameters as a JSON object for the connector operation
                </HelperTextItem>
              )}
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <Button type="submit" variant="primary" style={{ width: '100%' }} isDisabled={!!jsonError}>
          {submitButtonText ?? 'Add node'}
        </Button>
      </StackItem>
    </Stack>
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
    <Form<AAPFormData> id="aap-node-form" defaultValues={defaultValues} onSubmit={handleSubmit}>
      {() => <AAPFormFields submitButtonText={props.submitButtonText} />}
    </Form>
  )
}
