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
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext } from 'react-hook-form'

import { CredentialSelector } from '../../../components/CredentialSelector'
import { credentialHelpText } from '../../../components/credentialSelectorHelpText'
import { ExpandableCodeEditor, type ExpandableCodeEditorHandle } from '../../../components/ExpandableCodeEditor'

import { aapFormSchema, type AAPFormData } from './aapFormSchema'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

export type { AAPFormData }

interface AAPNodeFormProps {
  onSubmit: (data: AAPFormData) => void
  onCancel?: () => void
  initialData?: Partial<AAPFormData>
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
}

function AAPFormFields({
  submitButtonText,
  onHeaderContentChange,
  extraVarsEditorRef,
  validationErrors,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
  extraVarsEditorRef?: React.RefObject<ExpandableCodeEditorHandle | null>
  validationErrors?: { jobTemplateId?: { message?: string }; extraVars?: { message?: string } }
}) {
  const {
    register,
    control,
    formState: { errors: contextErrors },
  } = useFormContext<AAPFormData>()
  const errors = validationErrors ?? contextErrors
  const extraVarsMessage = errors.extraVars?.message

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="aap-name" ariaLabel="Name" />,
    [register]
  )

  useEffect(() => {
    onHeaderContentChange?.(nameField)
    return () => {
      onHeaderContentChange?.(null)
    }
  }, [nameField, onHeaderContentChange])

  const parametersContent = (
    <Stack hasGutter>
      <StackItem>
        <Controller
          control={control}
          name="credentialId"
          render={({ field }) => (
            <CredentialSelector
              value={field.value ?? undefined}
              onChange={field.onChange}
              compatibleTypeNames={['Ansible Automation Platform']}
              label="Authentication credential"
              fieldId="aap-credential"
              placeholder="Select credential"
              allowCreate
              helpText={credentialHelpText(
                'Select a stored credential to authenticate this request. Credentials securely store sensitive information like API tokens and passwords.'
              )}
            />
          )}
        />
      </StackItem>
      <StackItem>
        <FormGroup label="Job template ID" isRequired fieldId="aap-jobTemplateId">
          <TextInput
            {...register('jobTemplateId')}
            id="aap-jobTemplateId"
            type="number"
            placeholder="123"
            validated={errors.jobTemplateId ? 'error' : 'default'}
          />
          <FormHelperText>
            <HelperText>
              {errors.jobTemplateId ? (
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.jobTemplateId.message}
                </HelperTextItem>
              ) : (
                <HelperTextItem>AAP job template ID to launch</HelperTextItem>
              )}
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
            render={({ field }) => (
              <div className={extraVarsMessage ? 'pf-v6-c-form-control pf-m-error' : undefined}>
                <ExpandableCodeEditor
                  ref={extraVarsEditorRef ?? undefined}
                  code={field.value ?? ''}
                  onCodeChange={field.onChange}
                  onBlur={field.onBlur}
                  language="json"
                  height="150px"
                  modalTitle="Edit extra variables"
                  ariaLabel="Extra variables JSON editor"
                  isDarkTheme
                />
              </div>
            )}
          />
          <FormHelperText>
            <HelperText>
              {extraVarsMessage ? (
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {extraVarsMessage}
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
                value={field.value ?? ''}
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

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function AAPNodeForm(props: Readonly<AAPNodeFormProps>) {
  const extraVarsEditorRef = useRef<ExpandableCodeEditorHandle | null>(null)
  const [, setSubmitValidationTick] = useState(0)

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
    resolver: zodResolver(aapFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  const {
    formState: { errors },
  } = methods

  const handleSubmit = (data: AAPFormData) => {
    props.onSubmit(data)
  }

  const onSubmitWithFlush = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const valueFromEditor = extraVarsEditorRef.current?.getValue() ?? methods.getValues('extraVars') ?? ''
    methods.setValue('extraVars', valueFromEditor)
    void methods.trigger().then((valid) => {
      setSubmitValidationTick((t) => t + 1)
      const extraVarsError = methods.getFieldState('extraVars').error
      if (valid && !extraVarsError) {
        void methods.handleSubmit(handleSubmit)()
      } else {
        const errs = methods.formState.errors
        if (errs.jobTemplateId) methods.setFocus('jobTemplateId')
        else if (errs.extraVars) extraVarsEditorRef.current?.focus()
      }
    })
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="aap-node-form" onSubmit={onSubmitWithFlush}>
        <AAPFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
          extraVarsEditorRef={extraVarsEditorRef}
          validationErrors={errors}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
