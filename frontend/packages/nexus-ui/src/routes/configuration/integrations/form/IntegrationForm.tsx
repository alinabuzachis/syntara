import type { IntegrationsAPI } from '@ansible/nexus-contracts'
import { IntegrationTypeEnum } from '@ansible/nexus-contracts'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ActionList,
  ActionListGroup,
  ActionListItem,
  Button,
  Wizard,
  WizardFooterWrapper,
  WizardStep,
  useWizardContext,
} from '@patternfly/react-core'
import { useCallback, useState } from 'react'
import { useForm, useWatch, type UseFormTrigger } from 'react-hook-form'

import { AppRoute } from '../../../../app/AppRoute'
import { breadcrumbsIntegrationConfigure } from '../../../../app/breadcrumbBuilders'
import { integrationsClient } from '../../../../client'
import { NxPage, NxPageBody } from '../../../../components/layout/NxPage'
import { NxPageHeader } from '../../../../components/layout/NxPageHeader'
import { NxPanel } from '../../../../components/layout/NxPanel'
import { navigate } from '../../../../hooks/routing/navigate'
import { useFormMutationErrorHandler } from '../../../../hooks/useFormMutationErrorHandler'
import { useAlerts } from '../../../../providers/alerts'
import { getErrorMessage } from '../../../../utils/apiErrors'
import { detachPromise } from '../../../../utils/detachPromise'
import { useDocLink } from '../../../../utils/docs/useDocLink'

import { CredentialStep } from './CredentialStep'
import { EnableModelsWrapper } from './EnableModelsStep'
import { EnableToolsWrapper } from './EnableToolsStep'
import { IntegrationDetailsStep } from './IntegrationDetailsStep'
import {
  integrationFormSchema,
  LLM_STEP1_FIELDS,
  MCP_STEP1_FIELDS,
  type IntegrationFormData,
} from './integrationFormSchema'
import { useCreateIntegration } from './useCreateIntegration'
import styles from './WizardSteps.module.css'

type DiscoverResult = IntegrationsAPI.components['schemas']['DiscoverResult']
type InitialModelSelection = IntegrationsAPI.components['schemas']['InitialModelSelection']

function discoveredDescription(count: number, singular: string): string {
  if (count === 0) return 'Successfully connected. The integration is reachable.'
  const noun = count === 1 ? singular : `${singular}s`
  return `Successfully connected. Discovered ${String(count)} ${noun}.`
}

type WizardNavFooterProps = Readonly<{
  trigger: UseFormTrigger<IntegrationFormData>
  onSubmit: () => void
  credentialId: string | null | undefined
  integrationType: string
  onStep1Validated: () => void
}>

function WizardNavFooter({ trigger, onSubmit, credentialId, integrationType, onStep1Validated }: WizardNavFooterProps) {
  const { goToNextStep, goToPrevStep, activeStep, steps } = useWizardContext()
  const isFirst = activeStep.index === 1
  const isSecond = activeStep.id === 'credential'
  const isLast = activeStep.index === steps.length

  const handleNext = useCallback(async () => {
    if (isFirst) {
      const step1Fields = integrationType === IntegrationTypeEnum.LLM_PROVIDER ? LLM_STEP1_FIELDS : MCP_STEP1_FIELDS
      const valid = await trigger(step1Fields)
      if (valid) {
        onStep1Validated()
        await goToNextStep()
      }
      return
    }
    await goToNextStep()
  }, [trigger, isFirst, integrationType, goToNextStep, onStep1Validated])

  const isNextDisabled = isSecond && !credentialId

  return (
    <WizardFooterWrapper>
      <ActionList>
        <ActionListGroup>
          {!isFirst && (
            <ActionListItem>
              <Button variant="secondary" onClick={goToPrevStep}>
                Back
              </Button>
            </ActionListItem>
          )}
          <ActionListItem>
            {isLast ? (
              <Button variant="primary" onClick={onSubmit}>
                Save
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={isNextDisabled ? undefined : () => detachPromise(handleNext())}
                isAriaDisabled={isNextDisabled}
              >
                Next
              </Button>
            )}
          </ActionListItem>
        </ActionListGroup>
        <ActionListGroup>
          <ActionListItem>
            <Button variant="link" onClick={() => navigate(AppRoute.Configuration.Integrations.Root)}>
              Cancel
            </Button>
          </ActionListItem>
        </ActionListGroup>
      </ActionList>
    </WizardFooterWrapper>
  )
}

export function IntegrationForm() {
  const docLink = useDocLink('integrations')
  const { control, handleSubmit, setError, trigger, setValue, getValues } = useForm<IntegrationFormData>({
    resolver: zodResolver(integrationFormSchema, undefined, { mode: 'sync' }),
    defaultValues: {
      name: '',
      description: '',
      integration_type: IntegrationTypeEnum.MCP_SERVER,
      configuration: { integration_type: IntegrationTypeEnum.MCP_SERVER, base_url: '' },
      management_credential_id: null,
      scope: 'global',
    },
  })
  const handleError = useFormMutationErrorHandler<IntegrationFormData>(setError)
  const createIntegration = useCreateIntegration({ handleError })
  const credentialId = useWatch({ control, name: 'management_credential_id' })
  const integrationType = useWatch({ control, name: 'integration_type' })

  const [testResult, setTestResult] = useState<DiscoverResult | null>(null)
  const [selectedToolNames, setSelectedToolNames] = useState<Set<string>>(new Set())
  const [selectedModels, setSelectedModels] = useState<Map<string, InitialModelSelection>>(new Map())
  const [step1Validated, setStep1Validated] = useState(false)

  const { mutate: testConnection, isPending: isTesting } = integrationsClient.useMutation(
    'post',
    '/integrations/discover'
  )
  const { showAlert } = useAlerts()

  const isLLM = integrationType === IntegrationTypeEnum.LLM_PROVIDER

  const resetTestState = useCallback(() => {
    setTestResult(null)
    setSelectedToolNames(new Set())
    setSelectedModels(new Map())
  }, [])

  const handleTypeChange = useCallback(() => {
    resetTestState()
    setStep1Validated(false)
  }, [resetTestState])

  const handleDiscoverSuccess = useCallback(
    (result: DiscoverResult, isLLMType: boolean) => {
      setTestResult(result)
      if (!result.success) {
        showAlert({
          title: 'Connection failed',
          description: result.error ?? 'Unable to connect to the integration.',
          variant: 'danger',
          autoDismiss: true,
        })
        return
      }

      if (isLLMType) {
        const discoveredModels = result.discovered_models ?? []
        const modelMap = new Map<string, InitialModelSelection>()
        for (const model of discoveredModels) {
          modelMap.set(model.id, {
            model_id: model.id,
            name: model.name,
            description: model.description ?? null,
            enabled: true,
            is_default: false,
          })
        }
        setSelectedModels(modelMap)
        showAlert({
          title: 'Connection tested',
          description: discoveredDescription(discoveredModels.length, 'model'),
          variant: 'success',
          autoDismiss: true,
        })
      } else {
        setSelectedToolNames(new Set(result.discovered_tools?.map((t) => t.name) ?? []))
        showAlert({
          title: 'Connection tested',
          description: discoveredDescription(result.discovered_tools?.length ?? 0, 'tool'),
          variant: 'success',
          autoDismiss: true,
        })
      }
    },
    [showAlert]
  )

  const handleTestConnection = useCallback(() => {
    const values = getValues()
    const credId = values.management_credential_id
    if (!credId) return

    resetTestState()

    const isLLMType = values.integration_type === IntegrationTypeEnum.LLM_PROVIDER
    testConnection(
      {
        body: {
          integration_type: values.integration_type,
          configuration: values.configuration,
          credential_id: credId,
        },
      },
      {
        onSuccess: (result) => handleDiscoverSuccess(result, isLLMType),
        onError: (error: unknown) => {
          showAlert({
            title: 'Connection test failed',
            description: getErrorMessage(error),
            variant: 'danger',
            autoDismiss: true,
          })
        },
      }
    )
  }, [getValues, testConnection, showAlert, resetTestState, handleDiscoverSuccess])

  const onSubmit = handleSubmit(
    (formData) => {
      if (formData.integration_type === IntegrationTypeEnum.LLM_PROVIDER) {
        const discoveredModels = Array.from(selectedModels.values())
        createIntegration(formData, undefined, discoveredModels)
      } else {
        const discoveredTools = testResult?.discovered_tools?.map((tool) => ({
          name: tool.name,
          description: tool.description,
          enabled: selectedToolNames.has(tool.name),
          parameters: tool.parameters as
            | { name: string; type?: string; description?: string; required?: boolean }[]
            | undefined,
        }))
        createIntegration(formData, discoveredTools)
      }
    },
    (errors) => {
      const messages: string[] = []
      if (errors.name) messages.push(errors.name.message ?? 'Name is invalid')
      if (errors.configuration?.base_url) messages.push(errors.configuration.base_url.message ?? 'Base URL is invalid')
      if (messages.length > 0) {
        showAlert({
          title: 'Unable to save integration',
          description: messages.join('. '),
          variant: 'danger',
          autoDismiss: true,
        })
      }
    }
  )

  const resourceStepName = isLLM ? 'Enable models' : 'Enable tools'

  return (
    <NxPage>
      <NxPageHeader title="Configure integration" breadcrumbs={breadcrumbsIntegrationConfigure()} docLink={docLink} />
      <NxPageBody>
        <NxPanel isFullHeight panelMainBodyProps={{ className: styles.wizardPanel }}>
          <Wizard
            isVisitRequired
            footer={
              <WizardNavFooter
                trigger={trigger}
                onSubmit={() => detachPromise(onSubmit())}
                credentialId={credentialId}
                integrationType={integrationType}
                onStep1Validated={() => setStep1Validated(true)}
              />
            }
          >
            <WizardStep name="Integration details" id="integration-details">
              <IntegrationDetailsStep control={control} setValue={setValue} onTypeChange={handleTypeChange} />
            </WizardStep>

            <WizardStep name="Connection credential" id="credential" navItem={{ isDisabled: !step1Validated }}>
              <CredentialStep
                control={control}
                setValue={setValue}
                credentialId={credentialId}
                isTesting={isTesting}
                onTestConnection={handleTestConnection}
                onCredentialChange={resetTestState}
              />
            </WizardStep>

            <WizardStep name={resourceStepName} id="enable-resources" isDisabled={!credentialId}>
              {isLLM ? (
                <EnableModelsWrapper
                  testResult={testResult}
                  selectedModels={selectedModels}
                  onSelectionChange={setSelectedModels}
                  onTestConnection={handleTestConnection}
                  isTestDisabled={!credentialId || isTesting}
                />
              ) : (
                <EnableToolsWrapper
                  testResult={testResult}
                  selectedNames={selectedToolNames}
                  onSelectionChange={setSelectedToolNames}
                  onTestConnection={handleTestConnection}
                  isTestDisabled={!credentialId || isTesting}
                />
              )}
            </WizardStep>
          </Wizard>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
