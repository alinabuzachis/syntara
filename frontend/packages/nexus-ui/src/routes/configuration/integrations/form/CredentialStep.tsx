import { Button, Content, ContentVariants, Form, FormGroup, Title } from '@patternfly/react-core'
import { Controller, type Control, type UseFormSetValue } from 'react-hook-form'

import { CredentialSelector } from '../../../builder/components/CredentialSelector'
import { CREDENTIAL_TYPES_BY_INTEGRATION } from '../integrationFilters'

import type { IntegrationFormData } from './integrationFormSchema'
import styles from './WizardSteps.module.css'

type CredentialStepProps = Readonly<{
  control: Control<IntegrationFormData>
  setValue: UseFormSetValue<IntegrationFormData>
  credentialId: string | null | undefined
  isTesting: boolean
  onTestConnection: () => void
  onCredentialChange: () => void
}>

export function CredentialStep({
  control,
  setValue,
  credentialId,
  isTesting,
  onTestConnection,
  onCredentialChange,
}: CredentialStepProps) {
  return (
    <>
      <Title headingLevel="h2" size="lg" className={styles.stepTitle}>
        Connection credential
      </Title>
      <Content component={ContentVariants.p} className={styles.stepDescription}>
        This credential is used to discover resources for this integration. Workflow credentials are configured
        separately in the workflow builder. Test the connection to discover available resources for this integration.
      </Content>
      <Form className={styles.stepForm}>
        <Controller
          name="management_credential_id"
          control={control}
          render={({ field }) => (
            <CredentialSelector
              value={field.value ?? undefined}
              onChange={(id) => {
                setValue('management_credential_id', id ?? null)
                onCredentialChange()
              }}
              compatibleTypeNames={CREDENTIAL_TYPES_BY_INTEGRATION.mcp_server}
              label="Health check credential"
              fieldId="credential-select"
              allowCreate
              placeholder="Select a credential"
              helpText="Used to test and monitor the connection to this integration."
            />
          )}
        />
        <FormGroup fieldId="test-connection">
          <Button
            variant="secondary"
            onClick={!credentialId || isTesting ? undefined : onTestConnection}
            isLoading={isTesting}
            isAriaDisabled={!credentialId || isTesting}
          >
            Test connection
          </Button>
        </FormGroup>
      </Form>
    </>
  )
}
