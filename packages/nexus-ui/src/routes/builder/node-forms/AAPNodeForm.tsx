import {
  Alert,
  Button,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  Title,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { CredentialSelector } from '../../../components/CredentialSelector'
import { credentialHelpText } from '../../../components/credentialSelectorHelpText'
import type { ExpandableCodeEditorHandle } from '../../../components/ExpandableCodeEditor'
import { useAAPBrowser } from '../../../hooks/useAAPBrowser'
import { getErrorMessage, isRetryableError } from '../../../utils/apiErrors'
import { detachPromise } from '../../../utils/detachPromise'
import { isValidAAPTemplateURL } from '../../../utils/urlValidation'

import { aapFormSchema, type AAPFormData } from './aapFormSchema'
import { PromptOnLaunchFields } from './AAPPromptOnLaunchFields'
import { AAPTypeaheadSelect } from './AAPTypeaheadSelect'
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
  projectId?: string
}

// ── Sub-components ──────────────────────────────────────────────────────

interface AAPResourcePickersProps {
  readonly browser: ReturnType<typeof useAAPBrowser>
  readonly projectId?: string
}

function AAPResourcePickers({ browser, projectId }: AAPResourcePickersProps) {
  const {
    control,
    setValue,
    reset,
    getValues,
    formState: { errors },
  } = useFormContext<AAPFormData>()

  const {
    organizations,
    jobTemplates,
    selectOrganization,
    selectJobTemplate,
    searchOrganizations,
    searchJobTemplates,
    loadingOrgs,
    loadingTemplates,
    error: browserError,
    retryAll,
  } = browser

  const orgOptions = organizations.map((org) => ({ value: org.name, label: org.name }))
  const templateOptions = jobTemplates.map((t) => ({
    value: t.name,
    label: t.name,
    description: t.description ?? undefined,
  }))

  /**
   * Clear all prompt-on-launch field overrides.
   * Called when organization or template changes to reset user-provided values.
   * Uses reset() to batch updates and avoid unnecessary re-renders.
   */
  const clearPromptOverrides = () => {
    const clearedOverrides = {
      inventory_name: '',
      inventory_id: undefined,
      extra_vars: '',
      limit: '',
      tags: '',
      skip_tags: '',
      verbosity: '',
      job_credentials: [],
      job_type: '',
      forks: undefined,
      timeout: undefined,
      job_slice_count: undefined,
      diff_mode: false,
      execution_environment: '',
      execution_environment_id: undefined,
      instance_group: '',
      instance_group_id: undefined,
      labels: '',
    }
    reset({ ...getValues(), ...clearedOverrides }, { keepDirty: false })
  }

  return (
    <>
      {/* Authentication credential selector - first field to match origin/main */}
      <StackItem>
        <Controller
          control={control}
          name="credential_id"
          render={({ field }) => (
            <CredentialSelector
              value={field.value ?? undefined}
              onChange={field.onChange}
              compatibleTypeNames={['Ansible Automation Platform']}
              label="Authentication credential"
              fieldId="aap-credential"
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

      {/* Organization */}
      <StackItem>
        <FormGroup label="Organization" isRequired fieldId="aap-organization">
          <Controller
            control={control}
            name="organization_name"
            render={({ field }) => (
              <AAPTypeaheadSelect
                id="aap-organization"
                ariaLabel="Organization"
                options={orgOptions}
                selected={field.value ?? ''}
                onChange={(value) => {
                  field.onChange(value)
                  selectOrganization(value)
                  // Clear downstream selections and all prompt-on-launch overrides
                  setValue('job_template_name', '')
                  setValue('job_template_id', undefined)
                  clearPromptOverrides()
                }}
                onSearchChange={searchOrganizations}
                placeholder="Select an organization"
                isLoading={loadingOrgs}
                hasError={!!errors.organization_name}
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              {errors.organization_name ? (
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.organization_name.message}
                </HelperTextItem>
              ) : (
                <HelperTextItem>AAP organization to browse resources from</HelperTextItem>
              )}
            </HelperText>
          </FormHelperText>
        </FormGroup>
      </StackItem>

      {/* Job Template */}
      <StackItem>
        <FormGroup label="Job template" isRequired fieldId="aap-jobTemplate">
          <Controller
            control={control}
            name="job_template_name"
            render={({ field }) => (
              <AAPTypeaheadSelect
                id="aap-jobTemplate"
                ariaLabel="Job template"
                options={templateOptions}
                selected={field.value ?? ''}
                onChange={(value) => {
                  field.onChange(value)
                  const selected = jobTemplates.find((t) => t.name === value)
                  setValue('job_template_id', selected?.id)
                  selectJobTemplate(selected?.id)
                  // Clear all prompt-on-launch overrides when template changes
                  clearPromptOverrides()
                }}
                onSearchChange={searchJobTemplates}
                placeholder="Select a job template"
                isLoading={loadingTemplates}
                hasError={!!errors.job_template_name}
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              {errors.job_template_name ? (
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.job_template_name.message}
                </HelperTextItem>
              ) : (
                <HelperTextItem>AAP job template to launch</HelperTextItem>
              )}
            </HelperText>
          </FormHelperText>
          {browser.templateDetail?.url && isValidAAPTemplateURL(browser.templateDetail.url) && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  <a href={browser.templateDetail.url} target="_blank" rel="noopener noreferrer">
                    View job template in AAP
                  </a>
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </StackItem>

      {browserError && (
        <StackItem>
          <Alert
            variant="danger"
            title="Failed to load AAP resources"
            isInline
            actionLinks={
              isRetryableError(browserError) ? (
                <Button variant="link" onClick={retryAll}>
                  Retry
                </Button>
              ) : undefined
            }
          >
            {getErrorMessage(browserError)}
          </Alert>
        </StackItem>
      )}
    </>
  )
}

// ── Main form ────────────────────────────────────────────────────────────

function AAPFormFields({
  submitButtonText,
  onHeaderContentChange,
  extraVarsEditorRef,
  initialData,
  selectedCredentialId,
  projectId,
}: {
  submitButtonText?: string
  onHeaderContentChange?: (content: ReactNode | null) => void
  extraVarsEditorRef: React.RefObject<ExpandableCodeEditorHandle | null>
  initialData?: Partial<AAPFormData>
  selectedCredentialId: string | undefined
  projectId?: string
}) {
  const { register } = useFormContext<AAPFormData>()

  const browser = useAAPBrowser(selectedCredentialId, {
    organization: initialData?.organization_name,
    jobTemplateId: initialData?.job_template_id,
  })

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
        <Title headingLevel="h3">AAP Controller</Title>
      </StackItem>

      <AAPResourcePickers browser={browser} projectId={projectId} />

      <StackItem>
        <PromptOnLaunchFields
          extraVarsEditorRef={extraVarsEditorRef}
          templateDetail={browser.templateDetail}
          isLoadingDetail={browser.loadingTemplateDetail}
          inventories={browser.inventories}
          loadingInventories={browser.loadingInventories}
          executionEnvironments={browser.executionEnvironments}
          loadingExecutionEnvironments={browser.loadingExecutionEnvironments}
          credentials={browser.credentials}
          loadingCredentials={browser.loadingCredentials}
          instanceGroups={browser.instanceGroups}
          loadingInstanceGroups={browser.loadingInstanceGroups}
          onSearchInventories={browser.searchInventories}
          onSearchExecutionEnvironments={browser.searchExecutionEnvironments}
          onSearchCredentials={browser.searchCredentials}
          onSearchInstanceGroups={browser.searchInstanceGroups}
        />
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
    credential_id: undefined,
    organization_name: '',
    job_template_name: '',
    job_template_id: undefined,
    inventory_name: '',
    extra_vars: '',
    limit: '',
    tags: '',
    skip_tags: '',
    verbosity: '',
    job_type: '',
    diff_mode: false,
    ...props.initialData,
  }

  const methods = useForm<AAPFormData>({
    resolver: zodResolver(aapFormSchema, undefined, { mode: 'sync' }),
    defaultValues,
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  // Watch credential_id using useWatch for proper reactivity
  const selectedCredentialId = useWatch({
    control: methods.control,
    name: 'credential_id',
  })

  const handleSubmit = (data: AAPFormData) => {
    props.onSubmit(data)
  }

  const onSubmitWithFlush = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const valueFromEditor = extraVarsEditorRef.current?.getValue() ?? methods.getValues('extra_vars') ?? ''
    methods.setValue('extra_vars', valueFromEditor)
    detachPromise(
      methods.trigger().then((valid) => {
        setSubmitValidationTick((t) => t + 1)
        const extraVarsError = methods.getFieldState('extra_vars').error
        if (valid && !extraVarsError) {
          return methods.handleSubmit(handleSubmit)()
        }
        const errs = methods.formState.errors
        if (errs.organization_name) methods.setFocus('organization_name')
        else if (errs.job_template_name) methods.setFocus('job_template_name')
        else if (errs.extra_vars) extraVarsEditorRef.current?.focus()
      })
    )
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="aap-node-form" onSubmit={onSubmitWithFlush}>
        <AAPFormFields
          submitButtonText={props.submitButtonText}
          onHeaderContentChange={props.onHeaderContentChange}
          extraVarsEditorRef={extraVarsEditorRef}
          initialData={props.initialData}
          selectedCredentialId={selectedCredentialId}
          projectId={props.projectId}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
