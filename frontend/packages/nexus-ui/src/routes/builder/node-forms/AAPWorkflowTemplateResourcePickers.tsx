import { Button, FormGroup, FormHelperText, HelperText, HelperTextItem, StackItem } from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { Controller, useFormContext } from 'react-hook-form'

import type { useAAPBrowser } from '../../../hooks/useAAPBrowser'
import { isValidAAPTemplateURL } from '../../../utils/urlValidation'

import { AAPTypeaheadSelect } from './AAPTypeaheadSelect'
import type { AAPWorkflowTemplateFormData } from './aapWorkflowTemplateSchema'
import { AAPErrorAlert } from './shared/AAPErrorAlert'
import { nodeHelp } from './shared/nodeFieldHelp'

type AAPWorkflowTemplateResourcePickersProps = {
  readonly browser: ReturnType<typeof useAAPBrowser>
}

export function AAPWorkflowTemplateResourcePickers({ browser }: AAPWorkflowTemplateResourcePickersProps) {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<AAPWorkflowTemplateFormData>()

  const {
    organizations,
    workflowTemplates,
    selectOrganization,
    selectTemplate,
    searchOrganizations,
    searchTemplates,
    loadingOrgs,
    loadingTemplates,
    workflowTemplateDetail,
    error: browserError,
    retryAll,
  } = browser

  const orgOptions = organizations.map((org) => ({ value: org.name, label: org.name }))
  // Extract description safely to avoid error-typed assignments
  const templateOptions = workflowTemplates.map((template) => ({
    value: template.name,
    label: template.name,
    description:
      'description' in template && typeof template.description === 'string' && template.description.length > 0
        ? template.description
        : undefined,
  }))

  return (
    <>
      {/* Organization */}
      <StackItem>
        <FormGroup label="Organization" labelHelp={nodeHelp.aapOrganization} isRequired fieldId="aap-wf-organization">
          <Controller
            control={control}
            name="organization_name"
            render={({ field }) => (
              <AAPTypeaheadSelect
                id="aap-wf-organization"
                ariaLabel="Organization"
                options={orgOptions}
                selected={field.value ?? ''}
                onChange={(value) => {
                  field.onChange(value)
                  selectOrganization(value)
                  // Clear downstream selections
                  setValue('workflow_job_template_name', '')
                  setValue('workflow_job_template_id', undefined)
                  // Clear prompt-on-launch overrides (matches AAPResourcePickers behavior)
                  setValue('inventory_name', '')
                  setValue('inventory_id', undefined)
                  setValue('extra_vars', '')
                  setValue('limit', '')
                  setValue('scm_branch', '')
                  setValue('tags', '')
                  setValue('skip_tags', '')
                  setValue('labels', [])
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

      {/* Workflow Template */}
      <StackItem>
        <FormGroup
          label="Workflow template"
          labelHelp={nodeHelp.aapWorkflowTemplate}
          isRequired
          fieldId="aap-wf-workflowTemplate"
        >
          <Controller
            control={control}
            name="workflow_job_template_name"
            render={({ field }) => (
              <AAPTypeaheadSelect
                id="aap-wf-workflowTemplate"
                ariaLabel="Workflow template"
                options={templateOptions}
                selected={field.value ?? ''}
                onChange={(value) => {
                  field.onChange(value)
                  const selected = workflowTemplates.find((t) => t.name === value)
                  setValue('workflow_job_template_id', selected?.id)
                  selectTemplate(selected?.id)
                  // Clear prompt-on-launch overrides when template changes
                  setValue('inventory_name', '')
                  setValue('inventory_id', undefined)
                  setValue('extra_vars', '')
                  setValue('limit', '')
                  setValue('scm_branch', '')
                  setValue('tags', '')
                  setValue('skip_tags', '')
                  setValue('labels', [])
                }}
                onSearchChange={searchTemplates}
                placeholder="Select a workflow template"
                isLoading={loadingTemplates}
                hasError={!!errors.workflow_job_template_name}
              />
            )}
          />
          <FormHelperText>
            <HelperText>
              {errors.workflow_job_template_name ? (
                <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                  {errors.workflow_job_template_name.message}
                </HelperTextItem>
              ) : (
                <HelperTextItem>AAP workflow template to launch</HelperTextItem>
              )}
            </HelperText>
          </FormHelperText>
          {workflowTemplateDetail?.url && isValidAAPTemplateURL(workflowTemplateDetail.url) && (
            <FormHelperText>
              <HelperText>
                <HelperTextItem>
                  <Button variant="link" component="a" href={workflowTemplateDetail.url} target="_blank" isInline>
                    View workflow template in AAP
                  </Button>
                </HelperTextItem>
              </HelperText>
            </FormHelperText>
          )}
        </FormGroup>
      </StackItem>

      <AAPErrorAlert error={browserError} onRetry={retryAll} />
    </>
  )
}
