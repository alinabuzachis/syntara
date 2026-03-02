import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { ExpandableCodeEditor } from '../../../components/ExpandableCodeEditor'

import { ActivityNameField } from './shared/ActivityNameField'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

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
  initialData?: Partial<AAPFormData>
  submitButtonText?: string
  onHeaderContentChange: (content: ReactNode | null) => void
}

function AAPFormFields({
  submitButtonText,
  onHeaderContentChange,
}: {
  submitButtonText?: string
  onHeaderContentChange: (content: ReactNode | null) => void
}) {
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

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="aap-name" ariaLabel="Name" />,
    [register]
  )

  useEffect(() => {
    onHeaderContentChange(nameField)
    return () => {
      onHeaderContentChange(null)
    }
  }, [nameField, onHeaderContentChange])

  const parametersContent = (
    <Stack hasGutter>
      <StackItem>
        <FormGroup label="Job template ID" isRequired fieldId="aap-jobTemplateId">
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
              <HelperTextItem>Override default inventory</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Credentials" fieldId="aap-credentials">
          <TextInput {...register('credentials')} id="aap-credentials" placeholder="1,2,3" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Comma-separated credential IDs</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Extra variables (JSON)" fieldId="aap-extraVars">
          <Controller
            control={control}
            name="extraVars"
            rules={{ validate: validateJSON }}
            render={({ field }) => (
              <ExpandableCodeEditor
                code={field.value ?? ''}
                onCodeChange={(value) => {
                  field.onChange(value)
                }}
                language="json"
                height="150px"
                modalTitle="Edit extra variables"
                ariaLabel="Extra variables JSON editor"
                isDarkTheme
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              {jsonError ? (
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {jsonError}
                </HelperTextItem>
              ) : (
                <HelperTextItem>Extra variables to pass to the job (JSON object)</HelperTextItem>
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
              <HelperTextItem>Limit job execution to specific hosts</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Tags" fieldId="aap-tags">
          <TextInput {...register('tags')} id="aap-tags" placeholder="install,configure" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Ansible tags to run (comma-separated)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
      <StackItem>
        <FormGroup label="Skip tags" fieldId="aap-skipTags">
          <TextInput {...register('skipTags')} id="aap-skipTags" placeholder="testing,debug" type="text" />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>Ansible tags to skip (comma-separated)</HelperTextItem>
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
              <HelperTextItem>Job verbosity level (0-5)</HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>
    </Stack>
  )

  return (
    <NodeFormTabsLayout
      parametersContent={parametersContent}
      submitButtonText={submitButtonText}
      isSubmitDisabled={!!jsonError}
    />
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
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  const handleSubmit = (data: AAPFormData) => {
    props.onSubmit(data)
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="aap-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <AAPFormFields submitButtonText={props.submitButtonText} onHeaderContentChange={props.onHeaderContentChange} />
      </NodeFormContainer>
    </FormProvider>
  )
}
