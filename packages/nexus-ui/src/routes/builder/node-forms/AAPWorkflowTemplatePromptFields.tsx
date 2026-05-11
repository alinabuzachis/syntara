import { FormGroup, FormSection, StackItem, TextInput } from '@patternfly/react-core'
import { useFormContext } from 'react-hook-form'

import type { AAPWorkflowTemplateDetail } from '../../../hooks/useAAPBrowser'
import type { ExpandableCodeEditorHandle } from '../components/ExpandableCodeEditor'

import { AAPLabelsField } from './AAPLabelsField'
import { ExtraVariablesField, TagInputField } from './AAPPromptFields'
import { AAPResourceSelectField } from './AAPResourceSelectField'
import type { AAPWorkflowTemplateFormData } from './aapWorkflowTemplateSchema'

type AAPWorkflowTemplatePromptFieldsProps = Readonly<{
  templateDetail: AAPWorkflowTemplateDetail | undefined
  isLoadingDetail: boolean
  inventories: Array<{ id: number; name: string }>
  loadingInventories: boolean
  labels: Array<{ id: number; name: string }>
  loadingLabels: boolean
  onSearchInventories: (search: string) => void
  onSearchLabels: (search: string) => void
  extraVarsEditorRef?: React.RefObject<ExpandableCodeEditorHandle | null>
}>

// Simple text input field for workflow template forms
function TextInputField({
  label,
  fieldId,
  name,
}: Readonly<{
  label: string
  fieldId: string
  name: keyof AAPWorkflowTemplateFormData
}>) {
  const { register } = useFormContext<AAPWorkflowTemplateFormData>()
  return (
    <StackItem>
      <FormGroup label={label} fieldId={fieldId}>
        <TextInput {...register(name)} id={fieldId} type="text" />
      </FormGroup>
    </StackItem>
  )
}

// eslint-disable-next-line complexity
export function AAPWorkflowTemplatePromptFields(props: AAPWorkflowTemplatePromptFieldsProps) {
  const {
    templateDetail,
    isLoadingDetail,
    inventories,
    loadingInventories,
    labels,
    loadingLabels,
    onSearchInventories,
    onSearchLabels,
    extraVarsEditorRef,
  } = props

  if (!templateDetail && !isLoadingDetail) {
    return null
  }

  const hasAnyPromptFields =
    templateDetail?.ask_inventory_on_launch ||
    templateDetail?.ask_variables_on_launch ||
    templateDetail?.ask_limit_on_launch ||
    templateDetail?.ask_scm_branch_on_launch ||
    templateDetail?.ask_labels_on_launch ||
    templateDetail?.ask_tags_on_launch ||
    templateDetail?.ask_skip_tags_on_launch

  if (!hasAnyPromptFields) {
    return null
  }

  const inventoryDefaultName = templateDetail.default_inventory?.name

  return (
    <StackItem>
      <FormSection title="Prompt on launch" titleElement="h3">
        {templateDetail.ask_inventory_on_launch && (
          <AAPResourceSelectField
            label="Inventory"
            fieldId="aap-wf-inventory"
            nameField="inventory_name"
            idField="inventory_id"
            items={inventories}
            isLoading={loadingInventories}
            helperText={
              inventoryDefaultName
                ? `Override default inventory for the workflow. Default: ${inventoryDefaultName}`
                : 'Override default inventory for the workflow'
            }
            placeholderText={inventoryDefaultName ? `${inventoryDefaultName} (default)` : 'No default inventory'}
            onSearchChange={onSearchInventories}
          />
        )}

        {templateDetail.ask_labels_on_launch && (
          <AAPLabelsField
            label="Labels"
            fieldId="aap-wf-labels"
            availableLabels={labels}
            isLoading={loadingLabels}
            helperText="Select or create labels for the workflow"
            placeholderText="Select or create labels"
            onSearchChange={onSearchLabels}
          />
        )}

        {templateDetail.ask_limit_on_launch && <TextInputField label="Limit" fieldId="aap-wf-limit" name="limit" />}

        {templateDetail.ask_scm_branch_on_launch && (
          <TextInputField label="Source control branch" fieldId="aap-wf-scmBranch" name="scm_branch" />
        )}

        {templateDetail.ask_tags_on_launch && (
          <TagInputField
            label="Job tags"
            fieldId="aap-wf-tags"
            name="tags"
            placeholder="tag1"
            helperText="Type a tag and press Enter or comma to add"
          />
        )}

        {templateDetail.ask_skip_tags_on_launch && (
          <TagInputField
            label="Skip tags"
            fieldId="aap-wf-skipTags"
            name="skip_tags"
            placeholder="tag1"
            helperText="Type a tag and press Enter or comma to add"
          />
        )}

        {templateDetail.ask_variables_on_launch && extraVarsEditorRef && (
          <ExtraVariablesField editorRef={extraVarsEditorRef} />
        )}
      </FormSection>
    </StackItem>
  )
}
