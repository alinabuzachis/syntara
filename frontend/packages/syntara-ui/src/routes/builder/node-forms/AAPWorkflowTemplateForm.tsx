import { FormGroup, Stack, StackItem, Switch } from '@patternfly/react-core'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { FormProvider, useForm, useFormContext, useWatch } from 'react-hook-form'

import { useAAPBrowser } from '../../../hooks/useAAPBrowser'
import { detachPromise } from '../../../utils/detachPromise'
import { AAPIntegrationSection } from '../components/AAPIntegrationSection'
import type { ExpandableCodeEditorHandle } from '../components/ExpandableCodeEditor'
import { useIsVersionView } from '../VersionViewContext'

import { isExpression } from './aapFormHelpers'
import { AAPWorkflowTemplatePromptFields } from './AAPWorkflowTemplatePromptFields'
import { AAPWorkflowTemplateResourcePickers } from './AAPWorkflowTemplateResourcePickers'
import { aapWorkflowTemplateSchema, type AAPWorkflowTemplateFormData } from './aapWorkflowTemplateSchema'
import { WorkflowExpressionTextField } from './ExpressionTextField'
import { ActivityNameField } from './shared/ActivityNameField'
import { zodResolver } from './shared/formSchemaUtils'
import { nodeHelp } from './shared/nodeFieldHelp'
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
  selectedIntegrationId,
  projectId,
  extraVarsEditorRef,
}: Readonly<{
  onHeaderContentChange?: (content: ReactNode | null) => void
  initialData?: Partial<AAPWorkflowTemplateFormData>
  selectedCredentialId: string | undefined
  selectedIntegrationId: string | undefined
  projectId?: string
  extraVarsEditorRef: React.RefObject<ExpandableCodeEditorHandle | null>
}>) {
  const isVersionView = useIsVersionView()
  const { register } = useFormContext<AAPWorkflowTemplateFormData>()

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
    'workflow',
    selectedIntegrationId
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
        <FormGroup label="Use input variables" labelHelp={nodeHelp.aapUseExpressions} fieldId="aap-wf-expression-mode">
          <Switch
            id="aap-wf-expression-mode"
            aria-label="Use input variables"
            isChecked={expressionMode}
            onChange={(_e, checked) => setExpressionMode(checked)}
            isDisabled={isVersionView}
          />
        </FormGroup>
      </StackItem>

      <StackItem>
        <AAPIntegrationSection
          selectedIntegrationId={selectedIntegrationId}
          selectedCredentialId={selectedCredentialId}
          isDisabled={isVersionView}
          projectId={projectId}
        />
      </StackItem>

      <StackItem>
        <fieldset disabled={isVersionView} className={nodeFormStyles.disabledFieldset}>
          <Stack hasGutter>
            {expressionMode ? (
              <>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="organization_name"
                    id="aap-wf-organization-expr"
                    label="Organization"
                    placeholder="org name or drag expression"
                    isRequired
                    labelHelp={nodeHelp.aapOrganization}
                  />
                </StackItem>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="workflow_job_template_name"
                    id="aap-wf-workflowTemplate-expr"
                    label="Workflow template"
                    placeholder="template name or drag expression"
                    isRequired
                    labelHelp={nodeHelp.aapWorkflowTemplate}
                  />
                </StackItem>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="inventory_name"
                    id="aap-wf-inventory-expr"
                    label="Inventory"
                    placeholder="inventory name or drag expression"
                    labelHelp={nodeHelp.aapInventory}
                  />
                </StackItem>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="limit"
                    id="aap-wf-limit-expr"
                    label="Limit"
                    placeholder="host pattern or drag expression"
                    labelHelp={nodeHelp.aapLimit}
                  />
                </StackItem>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="scm_branch"
                    id="aap-wf-scmBranch-expr"
                    label="Source control branch"
                    placeholder="branch name or drag expression"
                    labelHelp={nodeHelp.aapScmBranch}
                  />
                </StackItem>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="tags"
                    id="aap-wf-tags-expr"
                    label="Job tags"
                    placeholder="tags or drag expression"
                    labelHelp={nodeHelp.aapWfTags}
                  />
                </StackItem>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="skip_tags"
                    id="aap-wf-skipTags-expr"
                    label="Skip tags"
                    placeholder="skip tags or drag expression"
                    labelHelp={nodeHelp.aapWfSkipTags}
                  />
                </StackItem>
                <StackItem>
                  <WorkflowExpressionTextField
                    name="extra_vars"
                    id="aap-wf-extraVars-expr"
                    label="Extra variables"
                    placeholder='{"key": "value"} or drag expression'
                    labelHelp={nodeHelp.aapExtraVars}
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
          </Stack>
        </fieldset>
      </StackItem>
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
    integration_id: undefined,
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

  const selectedIntegrationId = useWatch({
    control: methods.control,
    name: 'integration_id',
  })

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
          selectedIntegrationId={selectedIntegrationId}
          projectId={props.projectId}
          extraVarsEditorRef={extraVarsEditorRef}
        />
      </NodeFormContainer>
    </FormProvider>
  )
}
