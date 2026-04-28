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
import { FieldErrorMessage, FieldHelpIcon, HintOrError } from './formFieldHelpers'
import { type IdentityProviderFormData } from './identityProviderFormSchema'
import { IdpTypeKey, IDP_TYPE_OPTIONS, IDP_TYPE_PRESETS } from './idpTypePresets'

function getScopesHelperText(hasError: unknown, isPresetTemplate: boolean): string | undefined {
  if (hasError) return undefined
  if (isPresetTemplate) return 'Pre-configured by provider template. Select Custom to modify.'
  return 'Type a scope and press Enter or comma to add'
}

// Fields validated before advancing from step 1 to step 2 in the wizard.
// Boolean toggles (enabled, autoDiscovery, enableRpInitiatedLogout,
// autoCreateGroups) are intentionally excluded — they have no validation
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
        return (
          <FormGroup label="Provider template" fieldId="idp-type" isRequired>
            <Select
              id="idp-type"
              isOpen={isOpen}
              selected={field.value || undefined}
              onSelect={(_event, value) => {
                const val = String(value)
                onTypeChange(val)
                field.onBlur()
                setIsOpen(false)
              }}
              onOpenChange={setIsOpen}
              toggle={(toggleRef) => (
                <MenuToggle
                  ref={toggleRef}
                  onClick={() => setIsOpen((prev) => !prev)}
                  isExpanded={isOpen}
                  isFullWidth
                  status={fieldState.error ? 'danger' : undefined}
                >
                  {field.value ? (
                    <>
                      <ProviderIcon
                        name={selectedLabel ?? ''}
                        idpType={field.value}
                        style={{ marginRight: 'var(--pf-t--global--spacer--sm)' }}
                      />
                      {selectedLabel}
                    </>
                  ) : (
                    'Select a provider template...'
                  )}
                </MenuToggle>
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
            labelHelp={FieldHelpIcon('OAuth 2.0 scopes to request from the identity provider during authentication.')}
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

function AutoCreateGroupsField({ control }: Readonly<{ control: Control<IdentityProviderFormData> }>) {
  return (
    <Controller
      name="autoCreateGroups"
      control={control}
      render={({ field }) => (
        <FormGroup fieldId="auto-create-groups">
          <Switch
            id="auto-create-groups"
            label="Auto-create groups"
            hasCheckIcon
            isChecked={field.value}
            onChange={(_event, checked) => field.onChange(checked)}
          />
          <FormHelperText>
            <HelperText>
              <HelperTextItem>
                Automatically create Nexus groups matching IdP group names on login. Disable to use manual group mapping
                instead.
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
                labelHelp={FieldHelpIcon('A unique display name for this identity provider.')}
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
            labelHelp={FieldHelpIcon(
              "Copy this value into your identity provider's OAuth app configuration as the allowed redirect URI."
            )}
          >
            <ClipboardCopy isReadOnly>{OIDC_REDIRECT_URI}</ClipboardCopy>
          </FormGroup>

          <ScopesField control={control} isPresetTemplate={isPresetTemplate} />
          <AutoCreateGroupsField control={control} />
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
