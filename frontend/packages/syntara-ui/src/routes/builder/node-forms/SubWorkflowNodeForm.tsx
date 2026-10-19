import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Flex, FlexItem, Spinner, Stack, StackItem } from '@patternfly/react-core'
import type { Activity } from '@syntara/contracts'
import { useCallback, use, useEffect, useMemo } from 'react'
import { Controller, FormProvider, useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'

import { selectCurrentWorkflow, useWorkflowStore } from '../../../stores/useWorkflowStore'
import { buildContextExpression, tryBuildExpression } from '../../../utils/expressions/templateBuilder'
import { NodeEditorAutoSubmitContext, useRegisterAutoSubmit } from '../hooks/useNodeEditorAutoSubmit'
import type { BaseNodeFormProps } from '../registry/NodeRegistry'
import { useIsVersionView } from '../VersionViewContext'

import { ChildWorkflowSelector } from './ChildWorkflowSelector'
import { InputMappingFields, type VariableOption } from './InputMappingFields'
import {
  formatInputMappingJson,
  getInvocationInputFields,
  parseFreeformInputMapping,
  serializeInvocationInputMapping,
  type InvocationInputField,
} from './invocationSchemaUtils'
import { ActivityNameField } from './shared/ActivityNameField'
import { nodeHelp } from './shared/nodeFieldHelp'
import { NodeFormContainer } from './shared/NodeFormContainer'
import { NodeFormTabsLayout } from './shared/NodeFormTabsLayout'
import { nodeSettingsSchema } from './shared/nodeSettingsSchema'
import { SubWorkflowSettingsForm } from './SubWorkflowSettingsForm'
import {
  isInvocationSchemaForbidden,
  isInvocationSchemaNotFound,
  useChildWorkflowSelector,
  type InvocationTrigger,
} from './useChildWorkflowSelector'

const subWorkflowSettingsSchema = nodeSettingsSchema.omit({ retry_policy: true })

export type SubWorkflowFormData = {
  name: string
  workflow_id: string
  trigger_node_id: string
  input_mapping: Record<string, unknown>
  settings?: z.infer<typeof subWorkflowSettingsSchema>
}

type SubWorkflowFormValues = SubWorkflowFormData & {
  input_mapping_json: string
}

type WorkflowSelectorState = ReturnType<typeof useChildWorkflowSelector>
type SubWorkflowMethods = UseFormReturn<SubWorkflowFormValues>

const subWorkflowFormSchema = z.object({
  name: z.string().trim().min(1, 'Step name is required'),
  workflow_id: z.string().min(1, 'Select a child workflow'),
  trigger_node_id: z.string(),
  input_mapping: z.record(z.string(), z.unknown()),
  input_mapping_json: z.string(),
  settings: subWorkflowSettingsSchema.optional(),
})

const WORKFLOW_CONTEXT_VARIABLES = [
  { label: 'Workflow context · now', path: 'workflow_context.now' },
  { label: 'Workflow context · today', path: 'workflow_context.today' },
  { label: 'Workflow context · workflow ID', path: 'workflow_context.workflow.id' },
  { label: 'Workflow context · workflow name', path: 'workflow_context.workflow.name' },
  { label: 'Workflow context · execution ID', path: 'workflow_context.execution.id' },
]

function buildVariableOptions(activities: Activity[] = []): VariableOption[] {
  const contextOptions = WORKFLOW_CONTEXT_VARIABLES.map(({ label, path }) => ({
    label,
    expression: buildContextExpression(path),
  }))
  const activityOptions = activities.flatMap((activity) =>
    Object.keys(activity.outputs ?? {}).flatMap((outputName) => {
      const expression = tryBuildExpression({ nodeId: activity.id, fieldPath: [outputName] })
      return expression ? [{ label: `${activity.name ?? activity.id} · ${outputName}`, expression }] : []
    })
  )

  return [...contextOptions, ...activityOptions]
}

function resolveSelectedTrigger(triggers: InvocationTrigger[], triggerNodeId: string): InvocationTrigger | undefined {
  const selectedTrigger = triggers.find((trigger) => trigger.trigger_node_id === triggerNodeId)
  if (selectedTrigger) return selectedTrigger
  return triggers.length === 1 ? triggers[0] : undefined
}

function normalizeProjectId(projectId: string | undefined): string | null {
  return projectId ?? null
}

function normalizeWorkflowId(workflowId: string): string | null {
  return workflowId || null
}

function getInvocationTriggers(invocation: WorkflowSelectorState): InvocationTrigger[] {
  return invocation.selectedSchema?.triggers ?? invocation.selectedOption?.triggers ?? []
}

function handleWorkflowSelection(methods: SubWorkflowMethods, workflowId: string | null, triggerNodeId: string) {
  methods.setValue('workflow_id', workflowId ?? '', { shouldDirty: true, shouldValidate: true })
  methods.setValue('trigger_node_id', triggerNodeId, { shouldDirty: true, shouldValidate: true })
  methods.setValue('input_mapping', {}, { shouldDirty: true })
  methods.setValue('input_mapping_json', '{}', { shouldDirty: true })
  methods.clearErrors(['workflow_id', 'trigger_node_id', 'input_mapping', 'input_mapping_json'])
}

function handleTriggerSelection(methods: SubWorkflowMethods, triggerNodeId: string) {
  methods.setValue('trigger_node_id', triggerNodeId, { shouldDirty: true, shouldValidate: true })
  methods.setValue('input_mapping', {}, { shouldDirty: true })
  methods.setValue('input_mapping_json', '{}', { shouldDirty: true })
  methods.clearErrors(['trigger_node_id', 'input_mapping', 'input_mapping_json'])
}

function submitSubWorkflowForm(
  values: SubWorkflowFormValues,
  context: {
    onSubmit: (data: SubWorkflowFormData) => void
    methods: SubWorkflowMethods
    invocation: WorkflowSelectorState
    selectedTrigger?: InvocationTrigger
    inputFields: InvocationInputField[]
  }
): boolean {
  const { invocation, methods, selectedTrigger, inputFields, onSubmit } = context
  if (invocation.isLoading) return false

  if (isInvocationSchemaForbidden(invocation.selectedSchemaError)) {
    methods.setError('workflow_id', {
      type: 'permission',
      message: 'You do not have permission to read this workflow.',
    })
    return false
  }

  if (!invocation.selectedSchema?.is_eligible || !selectedTrigger) {
    methods.setError('trigger_node_id', {
      type: 'eligibility',
      message: 'Select a workflow with an available Subworkflow Trigger.',
    })
    return false
  }

  let inputMapping: Record<string, unknown>
  try {
    inputMapping =
      inputFields.length > 0
        ? serializeInvocationInputMapping(values.input_mapping, inputFields)
        : parseFreeformInputMapping(values.input_mapping_json)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid input mapping.'
    methods.setError(inputFields.length > 0 ? 'input_mapping' : 'input_mapping_json', {
      type: 'validation',
      message,
    })
    return false
  }

  onSubmit({
    name: values.name,
    workflow_id: values.workflow_id,
    trigger_node_id: selectedTrigger.trigger_node_id,
    input_mapping: inputMapping,
    settings: values.settings,
  })
  return true
}

function WorkflowSelectionFields({
  methods,
  invocation,
  workflowId,
  triggerNodeId,
  hasTriggers,
  isVersionView,
}: Readonly<{
  methods: SubWorkflowMethods
  invocation: WorkflowSelectorState
  workflowId: string
  triggerNodeId: string
  hasTriggers: boolean
  isVersionView: boolean
}>) {
  return (
    <Stack hasGutter>
      <StackItem>
        <Controller
          name="workflow_id"
          control={methods.control}
          render={({ field }) => (
            <ChildWorkflowSelector
              options={invocation.options}
              selectedOption={invocation.selectedOption}
              selectedWorkflowId={field.value || null}
              selectedTriggerNodeId={triggerNodeId}
              workflowError={methods.formState.errors.workflow_id?.message}
              triggerError={methods.formState.errors.trigger_node_id?.message}
              onWorkflowChange={(selectedWorkflowId, defaultTriggerId) =>
                handleWorkflowSelection(methods, selectedWorkflowId, defaultTriggerId)
              }
              onTriggerChange={(selectedTriggerId) => handleTriggerSelection(methods, selectedTriggerId)}
              setSearchTerm={invocation.setSearchTerm}
              isLoading={invocation.isLoading}
              hasError={invocation.hasError}
              labelHelp={nodeHelp.subworkflowWorkflow}
              isRequired
              isDisabled={isVersionView}
            />
          )}
        />
      </StackItem>

      {workflowId && isInvocationSchemaForbidden(invocation.selectedSchemaError) && (
        <StackItem>
          <Alert variant="warning" isInline title="You do not have permission to read this child workflow." />
        </StackItem>
      )}
      {workflowId && isInvocationSchemaNotFound(invocation.selectedSchemaError) && (
        <StackItem>
          <Alert variant="warning" isInline title="This workflow has no published version available to invoke." />
        </StackItem>
      )}
      {workflowId && invocation.selectedSchema && (!invocation.selectedSchema.is_eligible || !hasTriggers) && (
        <StackItem>
          <Alert variant="warning" isInline title="This workflow has no eligible Subworkflow Trigger." />
        </StackItem>
      )}
      {workflowId && invocation.selectedSchemaQuery?.isPending && (
        <StackItem>
          <Spinner size="sm" aria-label="Loading child workflow inputs" />
        </StackItem>
      )}
    </Stack>
  )
}

function WorkflowInputMapping({
  methods,
  inputFields,
  variableOptions,
  freeformJson,
  isDisabled,
}: Readonly<{
  methods: SubWorkflowMethods
  inputFields: InvocationInputField[]
  variableOptions: VariableOption[]
  freeformJson: string
  isDisabled: boolean
}>) {
  return (
    <Controller
      name="input_mapping"
      control={methods.control}
      render={({ field, fieldState }) => (
        <InputMappingFields
          fields={inputFields}
          values={field.value}
          variableOptions={variableOptions}
          onChange={(value) => {
            field.onChange(value)
            methods.clearErrors('input_mapping')
          }}
          freeformJson={freeformJson}
          onFreeformJsonChange={(value) => {
            methods.setValue('input_mapping_json', value, { shouldDirty: true, shouldValidate: true })
            methods.clearErrors('input_mapping_json')
          }}
          isDisabled={isDisabled}
          labelHelp={nodeHelp.subworkflowInputMapping}
          error={fieldState.error?.message ?? methods.formState.errors.input_mapping_json?.message}
        />
      )}
    />
  )
}

/** Configure a child workflow, its Subworkflow Trigger, and input mappings. */
export function SubWorkflowNodeForm({
  onSubmit,
  initialData,
  onHeaderContentChange,
  projectId,
}: BaseNodeFormProps<SubWorkflowFormData>) {
  const isVersionView = useIsVersionView()
  const currentWorkflow = useWorkflowStore(selectCurrentWorkflow)
  const methods = useForm<SubWorkflowFormValues>({
    resolver: zodResolver(subWorkflowFormSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: initialData?.name ?? '',
      workflow_id: initialData?.workflow_id ?? '',
      trigger_node_id: initialData?.trigger_node_id ?? '',
      input_mapping: initialData?.input_mapping ?? {},
      input_mapping_json: formatInputMappingJson(initialData?.input_mapping),
      settings: initialData?.settings ?? {},
    },
  })

  const { control } = methods
  const workflowId = useWatch({ control, name: 'workflow_id' })
  const triggerNodeId = useWatch({ control, name: 'trigger_node_id' })
  const freeformJson = useWatch({ control, name: 'input_mapping_json' })
  const invocation = useChildWorkflowSelector({
    projectId: normalizeProjectId(projectId),
    selectedWorkflowId: normalizeWorkflowId(workflowId),
  })
  const triggers = getInvocationTriggers(invocation)
  const selectedTrigger = resolveSelectedTrigger(triggers, triggerNodeId)
  const canConfigureInputMapping =
    Boolean(workflowId) && invocation.selectedSchema?.is_eligible === true && selectedTrigger !== undefined
  const inputFields = useMemo(
    () => getInvocationInputFields(selectedTrigger?.input_schema),
    [selectedTrigger?.input_schema]
  )
  const variableOptions = useMemo(
    () => buildVariableOptions(currentWorkflow?.workflow.activities),
    [currentWorkflow?.workflow.activities]
  )
  const autoSubmitRef = use(NodeEditorAutoSubmitContext)

  const submitForm = useCallback(
    (values: SubWorkflowFormValues) =>
      submitSubWorkflowForm(values, { onSubmit, methods, invocation, selectedTrigger, inputFields }),
    [inputFields, invocation, methods, onSubmit, selectedTrigger]
  )
  useRegisterAutoSubmit(autoSubmitRef, methods, submitForm)

  const headerContent = useMemo(
    () => (
      <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
        <FlexItem>
          <ActivityNameField
            control={control}
            fieldId="sub-workflow-name"
            placeholder="Enter step name"
            ariaLabel="Name"
          />
        </FlexItem>
      </Flex>
    ),
    [control]
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
    <Stack hasGutter>
      <StackItem>
        <WorkflowSelectionFields
          methods={methods}
          invocation={invocation}
          workflowId={workflowId}
          triggerNodeId={triggerNodeId}
          hasTriggers={triggers.length > 0}
          isVersionView={isVersionView}
        />
      </StackItem>
      {canConfigureInputMapping && (
        <StackItem>
          <WorkflowInputMapping
            methods={methods}
            inputFields={inputFields}
            variableOptions={variableOptions}
            freeformJson={freeformJson}
            isDisabled={isVersionView}
          />
        </StackItem>
      )}
    </Stack>
  )

  return (
    <FormProvider {...methods}>
      <NodeFormContainer formId="sub-workflow-node-form" onSubmit={methods.handleSubmit(submitForm)}>
        <NodeFormTabsLayout parametersContent={parametersContent} settingsContent={<SubWorkflowSettingsForm />} />
      </NodeFormContainer>
    </FormProvider>
  )
}
