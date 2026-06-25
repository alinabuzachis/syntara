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
import { EnableToolsWrapper } from './EnableToolsStep'
import { IntegrationDetailsStep } from './IntegrationDetailsStep'
import { integrationFormSchema, STEP1_FIELDS, type IntegrationFormData } from './integrationFormSchema'
import { useCreateIntegration } from './useCreateIntegration'
import styles from './WizardSteps.module.css'

type DiscoverResult = IntegrationsAPI.components['schemas']['DiscoverResult']

type WizardNavFooterProps = Readonly<{
  trigger: UseFormTrigger<IntegrationFormData>
  onSubmit: () => void
  credentialId: string | null | undefined
}>

function WizardNavFooter({ trigger, onSubmit, credentialId }: WizardNavFooterProps) {
  const { goToNextStep, goToPrevStep, activeStep, steps } = useWizardContext()
  const isFirst = activeStep.index === 1
  const isSecond = activeStep.id === 'credential'
  const isLast = activeStep.index === steps.length

  const handleNext = useCallback(async () => {
    if (isFirst) {
      const valid = await trigger(STEP1_FIELDS as unknown as (keyof IntegrationFormData)[])
      if (valid) await goToNextStep()
      return
    }
    await goToNextStep()
  }, [trigger, isFirst, goToNextStep])

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

  const [testResult, setTestResult] = useState<DiscoverResult | null>(null)
  const [selectedToolNames, setSelectedToolNames] = useState<Set<string>>(new Set())

  const { mutate: testConnection, isPending: isTesting } = integrationsClient.useMutation(
    'post',
    '/integrations/discover'
  )
  const { showAlert } = useAlerts()

  /** Tests connection via POST /integrations/discover. Populates testResult with discovered tools for step 3. Clears on credential change. */
  const handleTestConnection = useCallback(() => {
    const values = getValues()
    const credId = values.management_credential_id
    if (!credId) return

    setTestResult(null)

    testConnection(
      {
        body: {
          integration_type: values.integration_type,
          configuration: values.configuration,
          credential_id: credId,
        },
      },
      {
        onSuccess: (result) => {
          setTestResult(result)
          if (result.success) {
            setSelectedToolNames(new Set(result.discovered_tools?.map((t) => t.name) ?? []))
            const toolCount = result.discovered_tools?.length ?? 0
            showAlert({
              title: 'Connection tested',
              description:
                toolCount > 0
                  ? `Successfully connected. Discovered ${String(toolCount)} tool(s).`
                  : 'Successfully connected. The integration is reachable.',
              variant: 'success',
              autoDismiss: true,
            })
          } else {
            showAlert({
              title: 'Connection failed',
              description: result.error ?? 'Unable to connect to the integration.',
              variant: 'danger',
              autoDismiss: true,
            })
          }
        },
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
  }, [getValues, testConnection, showAlert])

  const onSubmit = handleSubmit(
    (formData) => {
      const discoveredTools = testResult?.discovered_tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        enabled: selectedToolNames.has(tool.name),
        parameters: tool.parameters as
          | { name: string; type?: string; description?: string; required?: boolean }[]
          | undefined,
      }))
      createIntegration(formData, discoveredTools)
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
              />
            }
          >
            <WizardStep name="Integration details" id="integration-details">
              <IntegrationDetailsStep control={control} setValue={setValue} />
            </WizardStep>

            <WizardStep name="Connection credential" id="credential">
              <CredentialStep
                control={control}
                setValue={setValue}
                credentialId={credentialId}
                isTesting={isTesting}
                onTestConnection={handleTestConnection}
                onCredentialChange={() => {
                  setTestResult(null)
                  setSelectedToolNames(new Set())
                }}
              />
            </WizardStep>

            <WizardStep name="Enable tools" id="enable-tools" isDisabled={!credentialId}>
              <EnableToolsWrapper
                testResult={testResult}
                selectedNames={selectedToolNames}
                onSelectionChange={setSelectedToolNames}
                onTestConnection={handleTestConnection}
                isTestDisabled={!credentialId || isTesting}
              />
            </WizardStep>
          </Wizard>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  )
}
