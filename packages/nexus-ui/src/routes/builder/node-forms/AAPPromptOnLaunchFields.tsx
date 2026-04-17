import {
  FormGroup,
  FormHelperText,
  FormSelect,
  FormSelectOption,
  HelperText,
  HelperTextItem,
  Stack,
  StackItem,
  Switch,
  TextInput,
  Title,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { Controller, useFormContext } from 'react-hook-form'

import { ExpandableCodeEditor, type ExpandableCodeEditorHandle } from '../../../components/ExpandableCodeEditor'
import { TagInput } from '../../../components/forms/TagInput'
import type {
  AAPCredential,
  AAPExecutionEnvironment,
  AAPInstanceGroup,
  AAPInventory,
  AAPJobTemplateDetail,
} from '../../../hooks/useAAPBrowser'

import type { AAPFormData } from './aapFormSchema'
import { AAPResourceMultiSelectField } from './AAPResourceMultiSelectField'
import { AAPResourceSelectField } from './AAPResourceSelectField'

interface PromptOnLaunchFieldsProps {
  readonly extraVarsEditorRef: React.RefObject<ExpandableCodeEditorHandle | null>
  readonly templateDetail?: AAPJobTemplateDetail
  readonly isLoadingDetail?: boolean
  readonly inventories?: AAPInventory[]
  readonly loadingInventories?: boolean
  readonly executionEnvironments?: AAPExecutionEnvironment[]
  readonly loadingExecutionEnvironments?: boolean
  readonly credentials?: AAPCredential[]
  readonly loadingCredentials?: boolean
  readonly instanceGroups?: AAPInstanceGroup[]
  readonly loadingInstanceGroups?: boolean
  readonly onSearchInventories?: (search: string) => void
  readonly onSearchExecutionEnvironments?: (search: string) => void
  readonly onSearchCredentials?: (search: string) => void
  readonly onSearchInstanceGroups?: (search: string) => void
}

/** All ask_* flag keys that control field visibility. */
const PROMPT_FLAGS = [
  'ask_job_type_on_launch',
  'ask_inventory_on_launch',
  'ask_variables_on_launch',
  'ask_limit_on_launch',
  'ask_tags_on_launch',
  'ask_skip_tags_on_launch',
  'ask_verbosity_on_launch',
  'ask_diff_mode_on_launch',
  'ask_forks_on_launch',
  'ask_job_slice_count_on_launch',
  'ask_execution_environment_on_launch',
  'ask_credential_on_launch',
  'ask_instance_groups_on_launch',
  'ask_labels_on_launch',
  'ask_timeout_on_launch',
] as const

function hasAnyPromptFlag(detail: AAPJobTemplateDetail): boolean {
  return PROMPT_FLAGS.some((flag) => detail[flag])
}

// ── Individual field sub-components ──────────────────────────────────────

function RunTypeField() {
  const { control } = useFormContext<AAPFormData>()
  return (
    <StackItem>
      <FormGroup label="Run type" fieldId="aap-jobType">
        <Controller
          control={control}
          name="jobType"
          render={({ field }) => (
            <FormSelect
              id="aap-jobType"
              value={field.value ?? ''}
              onChange={(_event, value) => field.onChange(value)}
              aria-label="Run type"
            >
              <FormSelectOption value="" label="[ run type ]" isPlaceholder />
              <FormSelectOption value="run" label="Run" />
              <FormSelectOption value="check" label="Check (Dry Run)" />
            </FormSelect>
          )}
        />
      </FormGroup>
    </StackItem>
  )
}

function VerbosityField() {
  const { control } = useFormContext<AAPFormData>()
  return (
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
              <FormSelectOption value="" label="[ verbosity ]" isPlaceholder />
              <FormSelectOption value="0" label="0 - Normal" />
              <FormSelectOption value="1" label="1 - Verbose" />
              <FormSelectOption value="2" label="2 - More Verbose" />
              <FormSelectOption value="3" label="3 - Debug" />
              <FormSelectOption value="4" label="4 - Connection Debug" />
              <FormSelectOption value="5" label="5 - WinRM Debug" />
            </FormSelect>
          )}
        />
      </FormGroup>
    </StackItem>
  )
}

function DiffModeField() {
  const { control } = useFormContext<AAPFormData>()
  return (
    <StackItem>
      <Controller
        control={control}
        name="diffMode"
        render={({ field }) => (
          <Switch
            id="aap-diffMode"
            label="Show changes"
            isChecked={field.value ?? false}
            onChange={(_event, checked) => field.onChange(checked)}
            aria-label="Show changes"
          />
        )}
      />
    </StackItem>
  )
}

function ExtraVariablesField({
  editorRef,
}: {
  readonly editorRef: React.RefObject<ExpandableCodeEditorHandle | null>
}) {
  const {
    control,
    formState: { errors },
  } = useFormContext<AAPFormData>()
  const extraVarsMessage = errors.extraVars?.message

  return (
    <StackItem>
      <FormGroup label="Extra variables" fieldId="aap-extraVars">
        <Controller
          control={control}
          name="extraVars"
          render={({ field }) => (
            <div className={extraVarsMessage ? 'pf-v6-c-form-control pf-m-error' : undefined}>
              <ExpandableCodeEditor
                ref={editorRef}
                code={field.value ?? ''}
                onCodeChange={field.onChange}
                onBlur={field.onBlur}
                language="json"
                height="150px"
                modalTitle="Edit extra variables"
                ariaLabel="Extra Variables"
              />
            </div>
          )}
        />
        {extraVarsMessage && (
          <FormHelperText>
            <HelperText>
              <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                {extraVarsMessage}
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        )}
      </FormGroup>
    </StackItem>
  )
}

function TextInputField({
  label,
  fieldId,
  name,
}: {
  readonly label: string
  readonly fieldId: string
  readonly name: keyof AAPFormData
}) {
  const { register } = useFormContext<AAPFormData>()
  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <TextInput {...register(name)} id={fieldId} type="text" />
      </FormGroup>
    </StackItem>
  )
}

function NumberInputField({
  label,
  fieldId,
  name,
  placeholder,
  min,
}: {
  readonly label: string
  readonly fieldId: string
  readonly name: keyof AAPFormData
  readonly placeholder: string
  readonly min: number
}) {
  const { register } = useFormContext<AAPFormData>()
  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <TextInput
          {...register(name, { valueAsNumber: true })}
          id={fieldId}
          type="number"
          placeholder={placeholder}
          min={min}
        />
      </FormGroup>
    </StackItem>
  )
}

function TagInputField({
  label,
  fieldId,
  name,
  placeholder,
  helperText,
}: {
  readonly label: string
  readonly fieldId: string
  readonly name: keyof AAPFormData
  readonly placeholder: string
  readonly helperText: string
}) {
  const { control } = useFormContext<AAPFormData>()
  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <Controller
          control={control}
          name={name}
          render={({ field }) => {
            const items = field.value
              ? String(field.value)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)
              : []
            return (
              <TagInput
                id={fieldId}
                value={items}
                onChange={(arr) => field.onChange(arr.join(', '))}
                ariaLabel={label}
                placeholder={placeholder}
                helperText={helperText}
              />
            )
          }}
        />
      </FormGroup>
    </StackItem>
  )
}

// ── Main component ──────────────────────────────────────────────────────

function PromptOnLaunchFieldList({
  templateDetail,
  inventories,
  loadingInventories,
  executionEnvironments,
  loadingExecutionEnvironments,
  credentials,
  loadingCredentials,
  instanceGroups,
  loadingInstanceGroups,
  extraVarsEditorRef,
  onSearchInventories,
  onSearchExecutionEnvironments,
  onSearchCredentials,
  onSearchInstanceGroups,
}: {
  readonly templateDetail: AAPJobTemplateDetail
  readonly inventories: AAPInventory[]
  readonly loadingInventories: boolean
  readonly executionEnvironments: AAPExecutionEnvironment[]
  readonly loadingExecutionEnvironments: boolean
  readonly credentials: AAPCredential[]
  readonly loadingCredentials: boolean
  readonly instanceGroups: AAPInstanceGroup[]
  readonly loadingInstanceGroups: boolean
  readonly extraVarsEditorRef: React.RefObject<ExpandableCodeEditorHandle | null>
  readonly onSearchInventories: (search: string) => void
  readonly onSearchExecutionEnvironments: (search: string) => void
  readonly onSearchCredentials: (search: string) => void
  readonly onSearchInstanceGroups: (search: string) => void
}) {
  return (
    <>
      {templateDetail.ask_job_type_on_launch && <RunTypeField />}
      {templateDetail.ask_inventory_on_launch && (
        <AAPResourceSelectField
          label="Inventory"
          fieldId="aap-inventory"
          nameField="inventory"
          idField="inventoryId"
          items={inventories}
          isLoading={loadingInventories}
          helperText="Override default inventory for the job"
          placeholderText="Use default inventory"
          onSearchChange={onSearchInventories}
        />
      )}
      {templateDetail.ask_execution_environment_on_launch && (
        <AAPResourceSelectField
          label="Execution environment"
          fieldId="aap-executionEnvironment"
          nameField="executionEnvironment"
          idField="executionEnvironmentId"
          items={executionEnvironments}
          isLoading={loadingExecutionEnvironments}
          helperText="Override default execution environment for the job"
          placeholderText="Use default execution environment"
          onSearchChange={onSearchExecutionEnvironments}
        />
      )}
      {templateDetail.ask_credential_on_launch && (
        <AAPResourceMultiSelectField
          label="Credentials"
          fieldId="aap-credentials"
          nameField="credentials"
          items={credentials}
          isLoading={loadingCredentials}
          helperText="Select one or more credentials for the job"
          placeholderText="Use default credentials"
          onSearchChange={onSearchCredentials}
        />
      )}
      {templateDetail.ask_labels_on_launch && <TextInputField label="Labels" fieldId="aap-labels" name="labels" />}
      {templateDetail.ask_verbosity_on_launch && <VerbosityField />}
      {templateDetail.ask_forks_on_launch && (
        <NumberInputField label="Forks" fieldId="aap-forks" name="forks" placeholder="0" min={0} />
      )}
      {templateDetail.ask_job_slice_count_on_launch && (
        <NumberInputField label="Job slicing" fieldId="aap-jobSlicing" name="jobSlicing" placeholder="1" min={1} />
      )}
      {templateDetail.ask_diff_mode_on_launch && <DiffModeField />}
      {templateDetail.ask_timeout_on_launch && (
        <NumberInputField label="Timeout" fieldId="aap-timeout" name="timeout" placeholder="0" min={0} />
      )}
      {templateDetail.ask_instance_groups_on_launch && (
        <AAPResourceSelectField
          label="Instance groups"
          fieldId="aap-instanceGroups"
          nameField="instanceGroup"
          idField="instanceGroupId"
          items={instanceGroups}
          isLoading={loadingInstanceGroups}
          helperText="Override default instance groups for the job"
          placeholderText="Use default instance groups"
          onSearchChange={onSearchInstanceGroups}
        />
      )}
      {templateDetail.ask_tags_on_launch && (
        <TagInputField
          label="Job tags"
          fieldId="aap-tags"
          name="tags"
          placeholder="tag1"
          helperText="Type a tag and press Enter or comma to add"
        />
      )}
      {templateDetail.ask_skip_tags_on_launch && (
        <TagInputField
          label="Skip tags"
          fieldId="aap-skipTags"
          name="skipTags"
          placeholder="tag1"
          helperText="Type a tag and press Enter or comma to add"
        />
      )}
      {templateDetail.ask_limit_on_launch && <TextInputField label="Limit" fieldId="aap-limit" name="limit" />}
      {templateDetail.ask_variables_on_launch && <ExtraVariablesField editorRef={extraVarsEditorRef} />}
    </>
  )
}

const noop = () => {}

export function PromptOnLaunchFields({
  extraVarsEditorRef,
  templateDetail,
  isLoadingDetail,
  inventories = [],
  loadingInventories = false,
  executionEnvironments = [],
  loadingExecutionEnvironments = false,
  credentials = [],
  loadingCredentials = false,
  instanceGroups = [],
  loadingInstanceGroups = false,
  onSearchInventories = noop,
  onSearchExecutionEnvironments = noop,
  onSearchCredentials = noop,
  onSearchInstanceGroups = noop,
}: Readonly<PromptOnLaunchFieldsProps>) {
  if (!templateDetail || isLoadingDetail || !hasAnyPromptFlag(templateDetail)) {
    return null
  }

  return (
    <Stack hasGutter>
      <StackItem>
        <Title headingLevel="h4">Prompt on Launch</Title>
      </StackItem>
      <PromptOnLaunchFieldList
        templateDetail={templateDetail}
        inventories={inventories}
        loadingInventories={loadingInventories}
        executionEnvironments={executionEnvironments}
        loadingExecutionEnvironments={loadingExecutionEnvironments}
        credentials={credentials}
        loadingCredentials={loadingCredentials}
        instanceGroups={instanceGroups}
        loadingInstanceGroups={loadingInstanceGroups}
        extraVarsEditorRef={extraVarsEditorRef}
        onSearchInventories={onSearchInventories}
        onSearchExecutionEnvironments={onSearchExecutionEnvironments}
        onSearchCredentials={onSearchCredentials}
        onSearchInstanceGroups={onSearchInstanceGroups}
      />
    </Stack>
  )
}
