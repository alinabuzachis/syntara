import { Form, Input, NativeSelect, Textarea, useFormContext } from '@ansible/nexus-ui-framework'
import { Button, FormGroup, FormHelperText, HelperText, HelperTextItem, Stack, StackItem } from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useState } from 'react'

export interface AAPFormData {
  name: string
  jobTemplateId: string // String in form, converted to number
  inventory?: string // Optional, string in form, converted to number
  credentials?: string // Optional, comma-separated credential IDs, converted to number[]
  extraVars?: string // Optional JSON string
  limit?: string // Optional, limit job to specific hosts
  tags?: string // Optional, Ansible tags to run (comma-separated)
  skipTags?: string // Optional, Ansible tags to skip (comma-separated)
  verbosity?: string // Optional, string in form, converted to number (0-5)
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
        <FormGroup label="Job Template ID" isRequired fieldId="aap-jobTemplateId">
          <Input
            {...register('jobTemplateId', { required: true })}
            id="aap-jobTemplateId"
            type="number"
            placeholder="123"
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>AAP job template ID to launch</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Inventory ID" fieldId="aap-inventory">
          <Input {...register('inventory')} id="aap-inventory" type="number" placeholder="456" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Override default inventory</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Credentials" fieldId="aap-credentials">
          <Input {...register('credentials')} id="aap-credentials" placeholder="1,2,3" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Comma-separated credential IDs</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Extra Variables (JSON)" fieldId="aap-extraVars">
          <Textarea
            {...register('extraVars', {
              validate: validateJSON,
              onChange: (e) => validateJSON(e.target.value),
            })}
            id="aap-extraVars"
            placeholder='{"version": "1.0", "environment": "prod"}'
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
                <HelperTextItem>Optional: Extra variables to pass to the job (JSON object)</HelperTextItem>
              )}
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Limit" fieldId="aap-limit">
          <Input {...register('limit')} id="aap-limit" placeholder="webservers:dbservers" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Limit job execution to specific hosts</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tags" fieldId="aap-tags">
          <Input {...register('tags')} id="aap-tags" placeholder="install,configure" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Ansible tags to run (comma-separated)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Skip Tags" fieldId="aap-skipTags">
          <Input {...register('skipTags')} id="aap-skipTags" placeholder="testing,debug" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Ansible tags to skip (comma-separated)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Verbosity" fieldId="aap-verbosity">
          <NativeSelect {...register('verbosity')} id="aap-verbosity">
            <option value="">Default (0)</option>
            <option value="0">0 - Normal</option>
            <option value="1">1 - Verbose</option>
            <option value="2">2 - More Verbose</option>
            <option value="3">3 - Debug</option>
            <option value="4">4 - Connection Debug</option>
            <option value="5">5 - WinRM Debug</option>
          </NativeSelect>
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Job verbosity level (0-5)</HelperTextItem>
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
    jobTemplateId: '',
    inventory: '',
    credentials: '',
    extraVars: '',
    limit: '',
    tags: '',
    skipTags: '',
    verbosity: '',
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
