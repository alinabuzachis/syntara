import { ExecutorTypeEnum } from '@ansible/nexus-contracts'
import {
  Flex,
  FlexItem,
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Label,
  Stack,
  StackItem,
  TextArea,
  TextInput,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { CredentialSelector } from '../../../components/CredentialSelector'
import { credentialHelpText } from '../../../components/credentialSelectorHelpText'
import {
  ExpandableCodeEditor,
  type CodeLanguage,
  type ExpandableCodeEditorHandle,
} from '../../../components/ExpandableCodeEditor'
import type { ActionFormData as RegistryActionFormData } from '../hooks/useNodeCreation'
import { DroppableField } from '../panels/fields/DroppableField'

import { actionFormSchema, type ActionFormData, type ActionFormValues } from './actionFormSchema'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

// Re-export schema type for form state; registry uses useNodeCreation.ActionFormData
export type { ActionFormData }
export type ExecutorType = ActionFormData['executor']
export type ScriptLanguage = 'python' | 'bash'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

type ActionNodeFormProps = {
  onSubmit: (data: RegistryActionFormData) => void
  submitButtonText?: string
  initialData?: Partial<RegistryActionFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}

// Constants (Priority 4)
const SCRIPT_LANGUAGE_OPTIONS: Array<{ label: string; value: ScriptLanguage }> = [
  { label: 'Python', value: 'python' },
  { label: 'Bash', value: 'bash' },
]

const HTTP_METHOD_OPTIONS: Array<{ label: HttpMethod; value: HttpMethod }> = [
  { label: 'GET', value: 'GET' },
  { label: 'POST', value: 'POST' },
  { label: 'PUT', value: 'PUT' },
  { label: 'PATCH', value: 'PATCH' },
  { label: 'DELETE', value: 'DELETE' },
]

/** Script + API form fields (Stack content) for action node. */
function ActionParametersContent(props: {
  register: ReturnType<typeof useFormContext<ActionFormValues>>['register']
  control: ReturnType<typeof useFormContext<ActionFormValues>>['control']
  getValues: ReturnType<typeof useFormContext<ActionFormValues>>['getValues']
  setValue: ReturnType<typeof useFormContext<ActionFormValues>>['setValue']
  errors: { code?: { message?: string }; url?: { message?: string } }
  executor: ActionFormValues['executor']
  scriptEditorRef?: React.RefObject<ExpandableCodeEditorHandle | null>
  editorLanguage: CodeLanguage
  projectId?: string
}) {
  const { register, control, getValues, setValue, errors, executor, scriptEditorRef, editorLanguage, projectId } = props
  return (
    <Stack
      hasGutter
      style={{
        paddingLeft: 'var(--pf-t--global--spacer--xs)',
        paddingRight: 'var(--pf-t--global--spacer--xs)',
      }}
    >
      <input type="hidden" {...register('executor')} />
      {executor === ExecutorTypeEnum.SCRIPT && (
        <>
          <StackItem>
            <FormGroup label="Language" fieldId="action-language">
              <Controller
                control={control}
                name="language"
                render={({ field }) => (
                  <FormSelect
                    id="action-language"
                    aria-label="Language"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    {SCRIPT_LANGUAGE_OPTIONS.map((option) => (
                      <FormSelectOption key={option.value} value={option.value} label={option.label} />
                    ))}
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Script" isRequired fieldId="action-code">
              <Controller
                control={control}
                name="code"
                render={({ field }) => (
                  <div
                    style={
                      errors.code
                        ? {
                            borderBottom: '2px solid var(--pf-t--global--color--status--danger--default)',
                          }
                        : undefined
                    }
                  >
                    <ExpandableCodeEditor
                      ref={scriptEditorRef ?? undefined}
                      code={field.value ?? ''}
                      onCodeChange={field.onChange}
                      language={editorLanguage}
                      height="200px"
                      ariaLabel="Script code editor"
                      isDarkTheme
                      onDropText={(text) => {
                        scriptEditorRef?.current?.insertAtCursor(text)
                      }}
                    />
                  </div>
                )}
              />
              <FormHelperText>
                <HelperText>
                  {errors.code ? (
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.code.message}
                    </HelperTextItem>
                  ) : (
                    <HelperTextItem>Script code to execute</HelperTextItem>
                  )}
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Input parameters" fieldId="action-parameters">
              <TextArea {...register('parameters')} id="action-parameters" placeholder='{"key": "value"}' rows={3} />
              <FormHelperText>
                <HelperText>
                  <HelperTextItem>Define inputs for this task</HelperTextItem>
                </HelperText>
              </FormHelperText>
            </FormGroup>
          </StackItem>
        </>
      )}
      {executor === ExecutorTypeEnum.HTTP_REQUEST && (
        <>
          <StackItem>
            <Controller
              control={control}
              name="credential_id"
              render={({ field }) => (
                <CredentialSelector
                  value={field.value ?? undefined}
                  onChange={field.onChange}
                  compatibleTypeNames={['HTTP Bearer Token', 'HTTP Basic Auth']}
                  label="Authentication credential"
                  fieldId="action-credential"
                  placeholder="Select credential"
                  allowCreate
                  projectId={projectId}
                  helpText={credentialHelpText(
                    'Select a stored credential to authenticate this request. Credentials securely store sensitive information like API tokens and passwords.'
                  )}
                />
              )}
            />
          </StackItem>
          <StackItem>
            <FormGroup label="URL" isRequired fieldId="action-url">
              <DroppableField
                onDropText={(text) => {
                  const current = getValues('url')
                  setValue('url', (current ?? '') + text)
                }}
              >
                <TextInput
                  {...register('url')}
                  id="action-url"
                  type="url"
                  placeholder="https://api.example.com/endpoint"
                  validated={errors.url ? 'error' : 'default'}
                />
              </DroppableField>
              {errors.url && (
                <FormHelperText>
                  <HelperText>
                    <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                      {errors.url.message}
                    </HelperTextItem>
                  </HelperText>
                </FormHelperText>
              )}
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="HTTP Method" fieldId="action-method">
              <Controller
                control={control}
                name="method"
                render={({ field }) => (
                  <FormSelect
                    id="action-method"
                    aria-label="HTTP Method"
                    value={field.value}
                    onChange={(_event, value) => field.onChange(value)}
                  >
                    {HTTP_METHOD_OPTIONS.map((option) => (
                      <FormSelectOption key={option.value} value={option.value} label={option.label} />
                    ))}
                  </FormSelect>
                )}
              />
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Headers" fieldId="action-headers">
              <TextArea
                {...register('headers')}
                id="action-headers"
                placeholder='{"Content-Type": "application/json"}'
                rows={2}
              />
            </FormGroup>
          </StackItem>
          <StackItem>
            <FormGroup label="Body" fieldId="action-body">
              <DroppableField
                onDropText={(text) => {
                  const current = getValues('body')
                  setValue('body', (current ?? '') + text)
                }}
              >
                <TextArea {...register('body')} id="action-body" placeholder='{"key": "value"}' rows={3} />
              </DroppableField>
            </FormGroup>
          </StackItem>
        </>
      )}
    </Stack>
  )
}

/**
 * Form fields component that manually registers fields with react-hook-form
 */
function ActionFormFields({
  submitButtonText,
  onHeaderContentChange,
  validationErrors,
  scriptEditorRef,
  projectId,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
  validationErrors?: { code?: { message?: string }; url?: { message?: string } }
  scriptEditorRef?: React.RefObject<ExpandableCodeEditorHandle | null>
  projectId?: string
}) {
  const {
    register,
    control,
    getValues,
    setValue,
    formState: { errors: contextErrors },
  } = useFormContext<ActionFormValues>()
  const errors = validationErrors ?? contextErrors
  const executor = useWatch({ control, name: 'executor' })
  const language = useWatch({ control, name: 'language' })
  const editorLanguage: 'bash' | 'python' | 'plaintext' =
    language === 'bash' || language === 'python' ? language : 'plaintext'

  useEffect(() => {
    if (errors.code && scriptEditorRef?.current) scriptEditorRef.current.focus()
  }, [errors.code, scriptEditorRef])

  const headerContent = useMemo(
    () => (
      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <ActivityNameField<ActionFormValues>
            register={register}
            fieldId="action-name"
            placeholder="Enter activity name"
            ariaLabel="Name"
          />
        </FlexItem>
        {executor === ExecutorTypeEnum.SCRIPT && (
          <FlexItem>
            <Label isCompact color="purple">
              NOT SCOPED FOR GA
            </Label>
          </FlexItem>
        )}
      </Flex>
    ),
    [register, executor]
  )

  useEffect(() => {
    onHeaderContentChange?.(headerContent)
  }, [headerContent, onHeaderContentChange])

  useEffect(
    () => () => {
      onHeaderContentChange?.(null)
    },
    [onHeaderContentChange]
  )

  const parametersContent = (
    <ActionParametersContent
      register={register}
      control={control}
      getValues={getValues}
      setValue={setValue}
      errors={errors}
      executor={executor}
      scriptEditorRef={scriptEditorRef}
      editorLanguage={editorLanguage}
      projectId={projectId}
    />
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} submitButtonText={submitButtonText} />
}

export function ActionNodeForm(props: Readonly<ActionNodeFormProps>) {
  const defaultValues: ActionFormValues = {
    name: '',
    executor: props.initialData?.executor ?? ExecutorTypeEnum.SCRIPT,
    code: '',
    url: '',
    language: 'python',
    method: 'GET',
    ...props.initialData,
  }

  const handleSubmit = (data: ActionFormValues) => {
    // Clean up data based on executor type (schema type is assignable to registry type)
    const cleanedData: RegistryActionFormData = {
      name: data.name,
      executor: data.executor,
      language: data.executor === ExecutorTypeEnum.SCRIPT ? data.language : undefined,
      code: data.executor === ExecutorTypeEnum.SCRIPT ? data.code : undefined,
      method: data.executor === ExecutorTypeEnum.HTTP_REQUEST ? data.method : undefined,
      url: data.executor === ExecutorTypeEnum.HTTP_REQUEST ? data.url : undefined,
      authentication:
        data.executor === ExecutorTypeEnum.HTTP_REQUEST && data.authentication ? data.authentication : undefined,
      headers: data.executor === ExecutorTypeEnum.HTTP_REQUEST ? data.headers : undefined,
      body: data.executor === ExecutorTypeEnum.HTTP_REQUEST ? data.body : undefined,
      parameters: data.parameters ?? undefined,
      requiresApproval: props.initialData?.requiresApproval,
      credential_id: data.credential_id ?? undefined,
    }
    props.onSubmit(cleanedData)
  }

  const methods = useForm<ActionFormValues>({
    resolver: zodResolver(actionFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
  })

  const {
    formState: { errors },
  } = methods
  const scriptEditorRef = useRef<ExpandableCodeEditorHandle | null>(null)

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="action-node-form" onSubmit={methods.handleSubmit(handleSubmit)}>
        <ActionFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
          validationErrors={errors}
          scriptEditorRef={scriptEditorRef}
          projectId={props.projectId}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
