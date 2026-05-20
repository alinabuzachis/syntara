import {
  ActionList,
  ActionListItem,
  Button,
  ClipboardCopy,
  Form,
  FormGroup,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MenuToggle,
  Select,
  SelectList,
  SelectOption,
  Switch,
  TextInput,
  Title,
  Wizard,
  WizardFooterWrapper,
  WizardStep,
  useWizardContext,
} from '@patternfly/react-core'
import { RhUiErrorIcon } from '@patternfly/react-icons'
import { useCallback, useState } from 'react'
import { Controller, useWatch, type Control, type UseFormSetValue, type UseFormTrigger } from 'react-hook-form'

import { OIDC_REDIRECT_URI } from '../../../../client'
import { TagInput } from '../../../../components/forms/TagInput'
import { ProviderIcon } from '../../../../components/ProviderIcon'
import { detachPromise } from '../../../../utils/detachPromise'

import { UserClaimMappingFields } from './ClaimMappingFields'
import { ConnectionFields } from './ConnectionFields'
import { FieldErrorMessage, FieldHelpPopover, HintOrError } from './formFieldHelpers'
import { type IdentityProviderFormData } from './identityProviderFormSchema'
import { IdpTypeKey, IDP_TYPE_OPTIONS, IDP_TYPE_PRESETS } from './idpTypePresets'

function getScopesHelperText(hasError: unknown, isPresetTemplate: boolean): string | undefined {
  if (hasError) return undefined
  if (isPresetTemplate) return 'Pre-configured by provider template. Select Custom to modify.'
  return 'Type a scope and press Enter or comma to add'
}

type IdpTypeSelectDeps = Readonly<{
  onTypeChange: (value: string) => void
  onBlur: () => void
  setIsOpen: (open: boolean) => void
}>

function idpTypeOnSelect(deps: IdpTypeSelectDeps, _event: unknown, value: unknown): void {
  const val = String(value)
  deps.onTypeChange(val)
  deps.onBlur()
  deps.setIsOpen(false)
}

function toggleIdpTypeMenuExpanded(setIsOpen: React.Dispatch<React.SetStateAction<boolean>>): void {
  setIsOpen((prev) => !prev)
}

type IdpTypeMenuToggleProps = Readonly<{
  toggleRef: React.Ref<HTMLButtonElement>
  isOpen: boolean
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>
  fieldValue: string | undefined
  selectedLabel: string | undefined
  hasError: boolean
}>

function IdpTypeMenuToggle({
  toggleRef,
  isOpen,
  setIsOpen,
  fieldValue,
  selectedLabel,
  hasError,
}: IdpTypeMenuToggleProps) {
  function handleToggleClick(): void {
    toggleIdpTypeMenuExpanded(setIsOpen)
  }

  return (
    <MenuToggle
      ref={toggleRef}
      onClick={handleToggleClick}
      isExpanded={isOpen}
      isFullWidth
      status={hasError ? 'danger' : undefined}
    >
      {fieldValue ? (
        <>
          <ProviderIcon
            name={selectedLabel ?? ''}
            idpType={fieldValue}
            style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}
          />
          {selectedLabel}
        </>
      ) : (
        'Select a provider template...'
      )}
    </MenuToggle>
  )
}

// Fields validated before advancing from step 1 to step 2 in the wizard.
// Boolean toggles (enabled, autoDiscovery, enableRpInitiatedLogout,
// allowAllAuthenticated) are intentionally excluded — they have no validation
// constraints and always hold a valid default value.
const STEP1_FIELDS: (keyof IdentityProviderFormData)[] = [
  'idpType',
  'name',
  'issuerUrl',
  'clientId',
  'clientSecret',
  'scopes',
  'authorizationEndpoint',
  'tokenEndpoint',
  'jwksUri',
  'endSessionEndpoint',
]

function WizardNavFooter({ trigger }: Readonly<{ trigger?: UseFormTrigger<IdentityProviderFormData> }>) {
  const { goToNextStep, goToPrevStep, activeStep, steps } = useWizardContext()
  const isFirst = activeStep.index === 1
  const isLast = activeStep.index === steps.length

  const handleNext = useCallback(async () => {
    if (trigger && isFirst) {
      const valid = await trigger(STEP1_FIELDS)
      if (valid) await goToNextStep()
      return
    }
    await goToNextStep()
  }, [trigger, isFirst, goToNextStep])

  return (
    <WizardFooterWrapper>
      <ActionList>
        {!isFirst && (
          <ActionListItem>
            <Button variant="secondary" onClick={goToPrevStep}>
              Back
            </Button>
          </ActionListItem>
        )}
        {!isLast && (
          <ActionListItem>
            <Button variant="primary" onClick={() => detachPromise(handleNext())}>
              Next
            </Button>
          </ActionListItem>
        )}
      </ActionList>
    </WizardFooterWrapper>
  )
}

function IdpTypeField({
  control,
  onTypeChange,
}: Readonly<{ control: Control<IdentityProviderFormData>; onTypeChange: (value: string) => void }>) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Controller
      name="idpType"
      control={control}
      render={({ field, fieldState }) => {
        const selectedLabel = IDP_TYPE_OPTIONS.find((o) => o.value === field.value)?.label
        const selectDeps: IdpTypeSelectDeps = {
          onTypeChange,
          onBlur: field.onBlur,
          setIsOpen,
        }

        return (
          <FormGroup label="Provider template" fieldId="idp-type" isRequired>
            <Select
              id="idp-type"
              isOpen={isOpen}
              selected={field.value || undefined}
              onSelect={(event, value) => idpTypeOnSelect(selectDeps, event, value)}
              onOpenChange={setIsOpen}
              toggle={(toggleRef) => (
                <IdpTypeMenuToggle
                  toggleRef={toggleRef}
                  isOpen={isOpen}
                  setIsOpen={setIsOpen}
                  fieldValue={field.value}
                  selectedLabel={selectedLabel}
                  hasError={Boolean(fieldState.error)}
                />
              )}
            >
              <SelectList>
                {IDP_TYPE_OPTIONS.map((opt) => (
                  <SelectOption key={opt.value} value={opt.value} isSelected={field.value === opt.value}>
                    <ProviderIcon
                      name={opt.label}
                      idpType={opt.value}
                      style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}
                    />
                    {opt.label}
                  </SelectOption>
                ))}
              </SelectList>
            </Select>
            <FieldErrorMessage error={fieldState.error} />
          </FormGroup>
        )
      }}
    />
  )
}

function RpInitiatedLogoutField({ control }: Readonly<{ control: Control<IdentityProviderFormData> }>) {
  return (
    <Controller
      name="enableRpInitiatedLogout"
      control={control}
      render={({ field }) => (
        <FormGroup fieldId="enable-rp-initiated-logout">
          <Switch
            id="enable-rp-initiated-logout"
            label="Single logout"
            hasCheckIcon
            isChecked={field.value}
            onChange={(_event, checked) => field.onChange(checked)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                When enabled, users will be redirected to the identity provider&apos;s logout page on sign-out.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}
    />
  )
}

function ScopesField({
  control,
  isPresetTemplate,
}: Readonly<{ control: Control<IdentityProviderFormData>; isPresetTemplate: boolean }>) {
  return (
    <Controller
      name="scopes"
      control={control}
      render={({ field, fieldState }) => {
        const scopesList = field.value ? field.value.split(/\s+/).filter(Boolean) : []
        return (
          <FormGroup
            label="Scopes"
            fieldId="scopes"
            isRequired
            labelHelp={
              <FieldHelpPopover helpText="OAuth 2.0 scopes to request from the identity provider during authentication." />
            }
          >
            <TagInput
              id="scopes"
              value={scopesList}
              onChange={(arr) => field.onChange(arr.join(' '))}
              ariaLabel="Add scope"
              placeholder="openid"
              isDisabled={isPresetTemplate}
              helperText={getScopesHelperText(fieldState.error, isPresetTemplate)}
            />
            {fieldState.error && (
              <FormHelperText>
                <HelperText>
                  <HelperTextItem icon={<RhUiErrorIcon />} variant="error">
                    {fieldState.error.message}
                  </HelperTextItem>
                </HelperText>
              </FormHelperText>
            )}
          </FormGroup>
        )
      }}
    />
  )
}

function AllowAllAuthenticatedField({ control }: Readonly<{ control: Control<IdentityProviderFormData> }>) {
  return (
    <Controller
      name="allowAllAuthenticated"
      control={control}
      render={({ field }) => (
        <FormGroup fieldId="allow-all-authenticated">
          <Switch
            id="allow-all-authenticated"
            label="Allow all authenticated"
            hasCheckIcon
            isChecked={field.value}
            onChange={(_event, checked) => field.onChange(checked)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Allow all users from this identity provider to log in, even without group mapping matches.
              </HelperTextItem>
              {field.value && (
                <HelperTextItem variant="warning">
                  Any user who authenticates via this provider will be granted access. Only enable this if you trust all
                  users from this identity provider.
                </HelperTextItem>
              )}
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}
    />
  )
}

function AapRoleMappingField({ control }: Readonly<{ control: Control<IdentityProviderFormData> }>) {
  return (
    <Controller
      name="aapRoleMappingEnabled"
      control={control}
      render={({ field }) => (
        <FormGroup fieldId="aap-role-mapping-enabled">
          <Switch
            id="aap-role-mapping-enabled"
            label="Map AAP system roles to groups"
            hasCheckIcon
            isChecked={field.value}
            onChange={(_event, checked) => field.onChange(checked)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Map AAP system roles (administrator, auditor, user) to built-in admins, auditors, and users groups.
              </HelperTextItem>
            </HelperText>
          </FormHelperText>
        </FormGroup>
      )}
    />
  )
}

function JmespathExpressionField({
  control,
  idpType,
}: Readonly<{ control: Control<IdentityProviderFormData>; idpType?: string | null }>) {
  const defaultExpression = idpType ? (IDP_TYPE_PRESETS[idpType]?.groupMappingExpression ?? null) : null

  return (
    <Controller
      name="groupMapping.jmespathExpression"
      control={control}
      render={({ field, fieldState }) => {
        const currentValue = field.value ?? 'groups[*]'
        const showReset = defaultExpression && currentValue !== defaultExpression

        return (
          <FormGroup label="Group extraction expression" fieldId="jmespath-expression">
            <TextInput
              id="jmespath-expression"
              placeholder="groups[*]"
              validated={fieldState.error ? 'error' : 'default'}
              {...field}
              value={currentValue}
            />
            <HintOrError
              error={fieldState.error}
              hint="JMESPath expression to extract group values from the ID token. Pre-filled by provider template selection."
            />
            {showReset && (
              <Button
                variant="link"
                onClick={() => field.onChange(defaultExpression)}
                style={{ marginTop: 'var(--pf-t--global--spacer--sm)' }}
              >
                Reset to default for {IDP_TYPE_PRESETS[idpType ?? '']?.label ?? 'this provider'}
              </Button>
            )}
          </FormGroup>
        )
      }}
    />
  )
}

export type TestResultData = {
  claimsSupported?: string[] | null
  claimAliases?: Record<string, string[]> | null
}

type IdentityProviderFormFieldsProps = {
  control: Control<IdentityProviderFormData>
  setValue: UseFormSetValue<IdentityProviderFormData>
  trigger: UseFormTrigger<IdentityProviderFormData>
  isEdit?: boolean
  testResult?: TestResultData | null
  onTestConnection?: () => Promise<void>
  isTesting?: boolean
}

export function IdentityProviderFormFields({
  control,
  setValue,
  trigger,
  isEdit,
  testResult,
  onTestConnection,
  isTesting,
}: Readonly<IdentityProviderFormFieldsProps>) {
  const claimsSupported = testResult?.claimsSupported
  const claimAliases = testResult?.claimAliases
  const autoDiscovery = useWatch({ control, name: 'autoDiscovery' })
  const idpType = useWatch({ control, name: 'idpType' })
  const isPresetTemplate = Boolean(idpType && idpType !== IdpTypeKey.CUSTOM)

  const handleIdpTypeChange = useCallback(
    (value: string) => {
      setValue('idpType', value, { shouldValidate: true })
      const preset = IDP_TYPE_PRESETS[value]
      if (!preset) return
      setValue('scopes', preset.scopes)
      setValue('claimMapping', preset.claimMapping)
      setValue('groupMapping', { jmespathExpression: preset.groupMappingExpression, entries: [] })
      setValue('aapRoleMappingEnabled', preset.aapRoleMappingEnabled)
      setValue('enableRpInitiatedLogout', preset.enableRpInitiatedLogout)
    },
    [setValue]
  )

  return (
    <Wizard isVisitRequired={false} footer={<WizardNavFooter trigger={trigger} />}>
      <WizardStep name="Provider configuration" id="provider-config">
        <Title headingLevel="h2" size="lg" style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}>
          Provider configuration
        </Title>
        <Form style={{ maxWidth: '600px' }}>
          <IdpTypeField control={control} onTypeChange={handleIdpTypeChange} />

          <Controller
            name="name"
            control={control}
            render={({ field, fieldState }) => (
              <FormGroup
                label="Provider name"
                fieldId="provider-name"
                isRequired
                labelHelp={<FieldHelpPopover helpText="A unique display name for this identity provider." />}
              >
                <TextInput
                  id="provider-name"
                  placeholder="Enter provider name"
                  validated={fieldState.error ? 'error' : 'default'}
                  {...field}
                />
                <FieldErrorMessage error={fieldState.error} />
              </FormGroup>
            )}
          />

          <Controller
            name="enabled"
            control={control}
            render={({ field }) => (
              <FormGroup label="Enable provider" fieldId="provider-enabled">
                <Switch
                  id="provider-enabled"
                  label="Enabled"
                  hasCheckIcon
                  isChecked={field.value}
                  onChange={(_event, checked) => field.onChange(checked)}
                />
              </FormGroup>
            )}
          />

          <ConnectionFields control={control} autoDiscovery={autoDiscovery} isEdit={isEdit} />

          <FormGroup
            label="Redirect URI"
            fieldId="redirect-uri"
            labelHelp={
              <FieldHelpPopover helpText="Copy this value into your identity provider's OAuth app configuration as the allowed redirect URI." />
            }
          >
            <ClipboardCopy isReadOnly>{OIDC_REDIRECT_URI}</ClipboardCopy>
          </FormGroup>

          <ScopesField control={control} isPresetTemplate={isPresetTemplate} />
          <AllowAllAuthenticatedField control={control} />
          {idpType === IdpTypeKey.AAP && <AapRoleMappingField control={control} />}
          <RpInitiatedLogoutField control={control} />
          {onTestConnection && (
            <FormGroup fieldId="test-connection">
              <Button
                variant="secondary"
                onClick={() => detachPromise(onTestConnection())}
                isLoading={isTesting}
                isDisabled={isTesting}
              >
                Test connection
              </Button>
            </FormGroup>
          )}
        </Form>
      </WizardStep>

      <WizardStep name="Claim mapping" id="claim-mapping">
        <Title headingLevel="h2" size="lg" style={{ marginBottom: 'var(--pf-t--global--spacer--lg)' }}>
          Claim mapping
        </Title>
        <Form style={{ maxWidth: '600px' }}>
          <UserClaimMappingFields
            control={control}
            claimsSupported={claimsSupported}
            claimAliases={claimAliases}
            isReadOnly={isPresetTemplate}
          />
          <JmespathExpressionField control={control} idpType={idpType} />
        </Form>
      </WizardStep>
    </Wizard>
  )
}
