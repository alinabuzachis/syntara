import { Stack, StackItem, Switch, Title } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { useAAPBrowser } from '../../../hooks/useAAPBrowser'
import { detachPromise } from '../../../utils/detachPromise'
import { CredentialSelector } from '../components/CredentialSelector'
import type { ExpandableCodeEditorHandle } from '../components/ExpandableCodeEditor'
import { useIsVersionView } from '../VersionViewContext'

import { isExpression } from './aapFormHelpers'
import { AAPWorkflowTemplatePromptFields } from './AAPWorkflowTemplatePromptFields'
import { AAPWorkflowTemplateResourcePickers } from './AAPWorkflowTemplateResourcePickers'
import { aapWorkflowTemplateSchema, type AAPWorkflowTemplateFormData } from './aapWorkflowTemplateSchema'
import { credentialHelpText } from './credentialSelectorHelpText'
import { WorkflowExpressionTextField } from './ExpressionTextField'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { NodeFormContainer } from './shared/NodeFormContainer'
import nodeFormStyles from './shared/nodeFormStyles.module.css'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { NodeSettingsForm } from './shared/NodeSettingsForm'

export type { AAPWorkflowTemplateFormData } from './aapWorkflowTemplateSchema'

type AAPWorkflowTemplateFormProps = {
  onSubmit: (data: AAPWorkflowTemplateFormData) => void
  onCancel?: () => void
  initialData?: Partial<AAPWorkflowTemplateFormData>
  onHeaderContentChange?: (content: ReactNode | null) => void
  projectId?: string
}

function AAPFormFields({
  onHeaderContentChange,
  initialData,
  selectedCredentialId,
  projectId,
  extraVarsEditorRef,
}: Readonly<{
  onHeaderContentChange?: (content: ReactNode | null) => void
  initialData?: Partial<AAPWorkflowTemplateFormData>
  selectedCredentialId: string | undefined
  projectId?: string
  extraVarsEditorRef: React.RefObject<ExpandableCodeEditorHandle | null>
}>) {
  const isVersionView = useIsVersionView()
  const { register, control } = useFormContext<AAPWorkflowTemplateFormData>()

  // Auto-detect expression mode from initial data
  const hasExpressionInInitialData =
    isExpression(initialData?.organization_name) ||
    isExpression(initialData?.workflow_job_template_name) ||
    isExpression(initialData?.inventory_name) ||
    isExpression(initialData?.limit) ||
    isExpression(initialData?.scm_branch)

  const [expressionMode, setExpressionMode] = useState(hasExpressionInInitialData)

  const browser = useAAPBrowser(
    selectedCredentialId,
    {
      organization: initialData?.organization_name,
      templateId: initialData?.workflow_job_template_id,
    },
    'workflow' // Use workflow template mode
  )

  const nameField = useMemo(
    () => <ActivityNameField register={register} fieldId="aap-wf-name" ariaLabel="Name" />,
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Title headingLevel="h3">AAP Controller</Title>
          <Switch
            id="aap-wf-expression-mode"
            label="Use expressions"
            isChecked={expressionMode}
            onChange={(_e, checked) => setExpressionMode(checked)}
            isDisabled={isVersionView}
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
              fieldId="aap-wf-credential"
              placeholder="Select credential"
              allowCreate
              isDisabled={isVersionView}
              projectId={projectId}
              helpText={credentialHelpText(
                'Select a stored credential to authenticate this request. Credentials securely store sensitive information like API tokens and passwords.'
              )}
            />
          )}
        />
      </StackItem>

      <fieldset disabled={isVersionView} className={nodeFormStyles.disabledFieldset}>
        {expressionMode ? (
          <>
            <StackItem>
              <WorkflowExpressionTextField
                name="organization_name"
                id="aap-wf-organization-expr"
                label="Organization"
                placeholder="org name or drag expression"
                isRequired
              />
            </StackItem>
            <StackItem>
              <WorkflowExpressionTextField
                name="workflow_job_template_name"
                id="aap-wf-workflowTemplate-expr"
                label="Workflow template"
                placeholder="template name or drag expression"
                isRequired
              />
            </StackItem>
            <StackItem>
              <WorkflowExpressionTextField
                name="inventory_name"
                id="aap-wf-inventory-expr"
                label="Inventory"
                placeholder="inventory name or drag expression"
              />
            </StackItem>
            <StackItem>
              <WorkflowExpressionTextField
                name="limit"
                id="aap-wf-limit-expr"
                label="Limit"
                placeholder="host pattern or drag expression"
              />
            </StackItem>
            <StackItem>
              <WorkflowExpressionTextField
                name="scm_branch"
                id="aap-wf-scmBranch-expr"
                label="Source control branch"
                placeholder="branch name or drag expression"
              />
            </StackItem>
            <StackItem>
              <WorkflowExpressionTextField
                name="tags"
                id="aap-wf-tags-expr"
                label="Tags"
                placeholder="tags or drag expression"
              />
            </StackItem>
            <StackItem>
              <WorkflowExpressionTextField
                name="skip_tags"
                id="aap-wf-skipTags-expr"
                label="Skip tags"
                placeholder="skip tags or drag expression"
              />
            </StackItem>
            <StackItem>
              <WorkflowExpressionTextField
                name="extra_vars"
                id="aap-wf-extraVars-expr"
                label="Extra variables"
                placeholder='{"key": "value"} or drag expression'
              />
            </StackItem>
          </>
        ) : (
          <>
            <AAPWorkflowTemplateResourcePickers browser={browser} />

            <AAPWorkflowTemplatePromptFields
              templateDetail={browser.workflowTemplateDetail}
              isLoadingDetail={browser.loadingTemplateDetail}
              inventories={browser.inventories}
              loadingInventories={browser.loadingInventories}
              labels={browser.labels}
              loadingLabels={browser.loadingLabels}
              onSearchInventories={browser.searchInventories}
              onSearchLabels={browser.searchLabels}
              extraVarsEditorRef={extraVarsEditorRef}
            />
          </>
        )}
      </fieldset>
    </Stack>
  )

  const settingsContent = <NodeSettingsForm timeoutNodeType="aap" />

  return <NodeFormTabsLayout parametersContent={parametersContent} settingsContent={settingsContent} />
}

export function AAPWorkflowTemplateForm(props: Readonly<AAPWorkflowTemplateFormProps>) {
  const extraVarsEditorRef = useRef<ExpandableCodeEditorHandle>(null)

  const defaultValues: AAPWorkflowTemplateFormData = {
    name: '',
    credential_id: undefined,
    organization_name: '',
    workflow_job_template_name: '',
    workflow_job_template_id: undefined,
    inventory_name: '',
    extra_vars: '',
    limit: '',
    scm_branch: '',
    tags: '',
    skip_tags: '',
    labels: [],
    settings: {},
    ...props.initialData,
  }

  const methods = useForm<AAPWorkflowTemplateFormData>({
    resolver: zodResolver(aapWorkflowTemplateSchema, undefined, { mode: 'sync' }),
    defaultValues,
    mode: 'onChange',
    reValidateMode: 'onChange',
  })

  // Watch credential_id using useWatch for proper reactivity
  const selectedCredentialId = useWatch({
    control: methods.control,
    name: 'credential_id',
  })

  const handleSubmit = (data: AAPWorkflowTemplateFormData) => {
    props.onSubmit(data)
  }

  const onSubmitWithValidation = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    // Flush extra vars from editor to form state before validation
    const valueFromEditor = extraVarsEditorRef.current?.getValue() ?? methods.getValues('extra_vars') ?? ''
    methods.setValue('extra_vars', valueFromEditor)
    detachPromise(
      methods.trigger().then((valid) => {
        if (valid) {
          return methods.handleSubmit(handleSubmit)()
        }
        // Focus first error field
        const errs = methods.formState.errors
        if (errs.organization_name) methods.setFocus('organization_name')
        else if (errs.workflow_job_template_name) methods.setFocus('workflow_job_template_name')
        else if (errs.extra_vars) extraVarsEditorRef.current?.focus()
      })
    )
  }

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="aap-workflow-template-form" onSubmit={onSubmitWithValidation}>
        <AAPFormFields
          onHeaderContentChange={props.onHeaderContentChange}
          initialData={props.initialData}
          selectedCredentialId={selectedCredentialId}
          projectId={props.projectId}
          extraVarsEditorRef={extraVarsEditorRef}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
