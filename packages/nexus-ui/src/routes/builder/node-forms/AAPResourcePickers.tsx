import { Alert, Button, FormGroup, FormHelperText, HelperText, HelperTextItem, StackItem } from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { Controller, useFormContext } from 'react-hook-form'

import { CredentialSelector } from '../../../components/CredentialSelector'
import { credentialHelpText } from '../../../components/credentialSelectorHelpText'
import type { useAAPBrowser } from '../../../hooks/useAAPBrowser'
import { getErrorMessage, isRetryableError } from '../../../utils/apiErrors'
import { isValidAAPTemplateURL } from '../../../utils/urlValidation'

import type { AAPFormData } from './aapFormSchema'
import { AAPTypeaheadSelect } from './AAPTypeaheadSelect'

type AAPResourcePickersProps = {
  readonly browser: ReturnType<typeof useAAPBrowser>
  readonly projectId?: string
}

export function AAPResourcePickers({ browser, projectId }: AAPResourcePickersProps) {
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
      labels: [],
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
