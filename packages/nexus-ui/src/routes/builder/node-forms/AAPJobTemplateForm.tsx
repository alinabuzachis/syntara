import { Stack, StackItem, Switch, Title } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { CredentialSelector } from '../../../components/CredentialSelector'
import { credentialHelpText } from '../../../components/credentialSelectorHelpText'
import type { ExpandableCodeEditorHandle } from '../../../components/ExpandableCodeEditor'
import { useAAPBrowser } from '../../../hooks/useAAPBrowser'
import { detachPromise } from '../../../utils/detachPromise'

import { applyDefaultValues, isExpression, sanitizeArrayField } from './aapFormHelpers'
import { aapJobTemplateSchema, type AAPJobTemplateFormData } from './aapJobTemplateSchema'
import { PromptOnLaunchFields } from './AAPPromptOnLaunchFields'
import { AAPResourcePickers } from './AAPResourcePickers'
import { ExpressionTextField } from './ExpressionTextField'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'

export type { AAPJobTemplateFormData } from './aapJobTemplateSchema'

type AAPNodeFormProps = {
  onSubmit: (data: AAPJobTemplateFormData) => void
  onCancel?: () => void
  initialData?: Partial<AAPJobTemplateFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}

function AAPFormFields({
  onHeaderContentChange,
  extraVarsEditorRef,
  initialData,
  selectedCredentialId,
  projectId,
}: Readonly<{
  onHeaderContentChange?: (content: ReactNode | null) => void
  extraVarsEditorRef: React.RefObject<ExpandableCodeEditorHandle | null>
  initialData?: Partial<AAPJobTemplateFormData>
  selectedCredentialId: string | undefined
  projectId?: string
}>) {
  const { register, setValue, getValues, control } = useFormContext<AAPJobTemplateFormData>()

  // Auto-detect expression mode from initial data
  const hasExpressionInInitialData =
    isExpression(initialData?.organization_name) ||
    isExpression(initialData?.job_template_name) ||
    isExpression(initialData?.inventory_name) ||
    isExpression(initialData?.limit)

  const [expressionMode, setExpressionMode] = useState(hasExpressionInInitialData)

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

  // Pre-populate prompt-on-launch fields with defaults when template detail is loaded
  // This includes BOTH resource defaults (inventory, credentials, etc.) AND scalar defaults
  // (verbosity, job_type, forks, timeout, diff_mode, limit, tags, skip_tags, labels, extra_vars)
  // Track the last template ID to detect template switches and re-apply defaults
  // Initialize with the initial template ID to avoid overwriting saved values when editing
  const lastTemplateIdRef = useRef<number | undefined>(initialData?.job_template_id)

  useEffect(() => {
    const detail = browser.templateDetail
    if (!detail || browser.loadingTemplateDetail) return

    const templateChanged = lastTemplateIdRef.current !== detail.id
    lastTemplateIdRef.current = detail.id

    // applyDefaultValues calls applyResourceDefaults, applyScalarDefaults, applyExtraVarsDefaults, and applyLabelsDefaults
    applyDefaultValues(detail, templateChanged, getValues, setValue)
    // getValues is stable from react-hook-form, no need to include in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browser.templateDetail, setValue])

  const parametersContent = (
    <Stack hasGutter>
      <StackItem>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Title headingLevel="h3">AAP Controller</Title>
          <Switch
            id="aap-expression-mode"
            label="Use expressions"
            isChecked={expressionMode}
            onChange={(_e, checked) => setExpressionMode(checked)}
            isReversed
          />
        </div>
      </StackItem>

      <StackItem>
        <Controller
          control={control}
          name="credential_id"
          render={({ field }) => (
            <CredentialSelector
              value={field.value}
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

      {expressionMode ? (
        <>
          <StackItem>
            <ExpressionTextField
              name="organization_name"
              id="aap-organization-expr"
              label="Organization"
              placeholder="org name or drag expression"
              isRequired
            />
          </StackItem>
          <StackItem>
            <ExpressionTextField
              name="job_template_name"
              id="aap-jobTemplate-expr"
              label="Job template"
              placeholder="template name or drag expression"
              isRequired
            />
          </StackItem>
          <StackItem>
            <ExpressionTextField
              name="inventory_name"
              id="aap-inventory-expr"
              label="Inventory"
              placeholder="inventory name or drag expression"
            />
          </StackItem>
          <StackItem>
            <ExpressionTextField
              name="limit"
              id="aap-limit-expr"
              label="Limit"
              placeholder="host pattern or drag expression"
            />
          </StackItem>
          <StackItem>
            <ExpressionTextField name="tags" id="aap-tags-expr" label="Tags" placeholder="tags or drag expression" />
          </StackItem>
          <StackItem>
            <ExpressionTextField
              name="skip_tags"
              id="aap-skipTags-expr"
              label="Skip tags"
              placeholder="skip tags or drag expression"
            />
          </StackItem>
          <StackItem>
            <ExpressionTextField
              name="extra_vars"
              id="aap-extraVars-expr"
              label="Extra variables"
              placeholder='{"key": "value"} or drag expression'
            />
          </StackItem>
        </>
      ) : (
        <>
          <AAPResourcePickers browser={browser} />

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
              labels={browser.labels}
              loadingLabels={browser.loadingLabels}
              onSearchInventories={browser.searchInventories}
              onSearchExecutionEnvironments={browser.searchExecutionEnvironments}
              onSearchCredentials={browser.searchCredentials}
              onSearchInstanceGroups={browser.searchInstanceGroups}
              onSearchLabels={browser.searchLabels}
            />
          </StackItem>
        </>
      )}
    </Stack>
  )

  return <NodeFormTabsLayout parametersContent={parametersContent} />
}

export function AAPJobTemplateForm(props: Readonly<AAPNodeFormProps>) {
  const extraVarsEditorRef = useRef<ExpandableCodeEditorHandle | null>(null)
  const [, setSubmitValidationTick] = useState(0)

  // Sanitize initialData to handle legacy data with invalid types
  const sanitizedInitialData = props.initialData
    ? {
        ...props.initialData,
        // Ensure job_credentials is always an array
        job_credentials: sanitizeArrayField(props.initialData.job_credentials),
        // Ensure labels is always an array
        labels: Array.isArray(props.initialData.labels) ? props.initialData.labels : [],
      }
    : undefined

  const defaultValues: AAPJobTemplateFormData = {
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
    job_credentials: [],
    labels: [],
    job_type: '',
    diff_mode: false,
    ...sanitizedInitialData,
  }

  const methods = useForm<AAPJobTemplateFormData>({
    resolver: zodResolver(aapJobTemplateSchema, undefined, { mode: 'sync' }),
    defaultValues,
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  // Watch credential_id using useWatch for proper reactivity
  const selectedCredentialId = useWatch({
    control: methods.control,
    name: 'credential_id',
  })

  const handleSubmit = (data: AAPJobTemplateFormData) => {
    props.onSubmit(data)
  }

  const onSubmitWithFlush = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const valueFromEditor = extraVarsEditorRef.current?.getValue() ?? methods.getValues('extra_vars') ?? ''
    methods.setValue('extra_vars', valueFromEditor)
    detachPromise(
      methods.trigger().then((valid) => {
        if (!valid && import.meta.env.DEV) {
          // eslint-disable-next-line no-console -- development-only debugging output
          console.error('[AAPNodeForm] Validation failed:', methods.formState.errors)
        }
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
      <NodeFormContainer formId="aap-job-template-form" onSubmit={onSubmitWithFlush}>
        <AAPFormFields
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
