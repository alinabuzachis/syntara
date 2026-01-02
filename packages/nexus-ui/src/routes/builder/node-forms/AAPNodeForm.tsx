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
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ActivityNameField } from './shared/ActivityNameField'
import { FormSubmitButton } from './shared/FormSubmitButton'

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
  const { register, control } = useFormContext<AAPFormData>()
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Validate JSON on change
  const validateJSON = (value: string | undefined): boolean | string => {
    const strValue = value ?? ''
    if (strValue.trim()) {
      try {
        JSON.parse(strValue)
        setJsonError(null)
        return true
      } catch {
        setJsonError('Invalid JSON format')
        return 'Invalid JSON format'
      }
    } else {
      setJsonError(null)
      return true
    }
  }

  return (
    <Stack hasGutter>
      <ActivityNameField register={register} fieldId="aap-name" />
      <StackItem>
        <FormGroup label="Job Template ID" isRequired fieldId="aap-jobTemplateId">
          <TextInput
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
          <TextInput {...register('inventory')} id="aap-inventory" type="number" placeholder="456" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Override default inventory</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Credentials" fieldId="aap-credentials">
          <TextInput {...register('credentials')} id="aap-credentials" placeholder="1,2,3" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Comma-separated credential IDs</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Extra Variables (JSON)" fieldId="aap-extraVars">
          <TextArea
            {...register('extraVars', {
              validate: validateJSON,
            })}
            onChange={(e) => {
              const value = (e.target as HTMLTextAreaElement).value
              validateJSON(value)
            }}
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
          <TextInput {...register('limit')} id="aap-limit" placeholder="webservers:dbservers" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Limit job execution to specific hosts</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tags" fieldId="aap-tags">
          <TextInput {...register('tags')} id="aap-tags" placeholder="install,configure" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Ansible tags to run (comma-separated)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Skip Tags" fieldId="aap-skipTags">
          <TextInput {...register('skipTags')} id="aap-skipTags" placeholder="testing,debug" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Ansible tags to skip (comma-separated)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Verbosity" fieldId="aap-verbosity">
          <Controller
            control={control}
            name="verbosity"
            render={({ field }) => (
              <FormSelect
                id="aap-verbosity"
                value={field.value || ''}
                onChange={(_event, value) => field.onChange(value)}
                aria-label="Verbosity"
              >
                <FormSelectOption value="" label="Default (0)" />
                <FormSelectOption value="0" label="0 - Normal" />
                <FormSelectOption value="1" label="1 - Verbose" />
                <FormSelectOption value="2" label="2 - More Verbose" />
                <FormSelectOption value="3" label="3 - Debug" />
                <FormSelectOption value="4" label="4 - Connection Debug" />
                <FormSelectOption value="5" label="5 - WinRM Debug" />
              </FormSelect>
            )}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Optional: Job verbosity level (0-5)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <FormSubmitButton submitButtonText={submitButtonText} isDisabled={!!jsonError} />
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

  const methods = useForm<AAPFormData>({
    defaultValues,
  })

  const handleSubmit = (data: AAPFormData) => {
    props.onSubmit(data)
  }

  return (
    <FormProvider {...methods}>
      <Form id="aap-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <AAPFormFields submitButtonText={props.submitButtonText} />
      </Form>
    </FormProvider>
  )
}
