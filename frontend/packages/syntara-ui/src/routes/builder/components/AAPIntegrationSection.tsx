import { Alert } from '@patternfly/react-core'
import { useState } from 'react'
import { useFormContext } from 'react-hook-form'

import { AAPCredentialStatus } from './AAPCredentialStatus'
import { AAPIntegrationSelector } from './AAPIntegrationSelector'

type AAPConnectionFields = {
  integration_id?: string
  credential_id?: string
}

export type AAPIntegrationSectionProps = Readonly<{
  selectedIntegrationId: string | undefined
  selectedCredentialId: string | undefined
  isDisabled?: boolean
  projectId?: string
}>

export function AAPIntegrationSection({
  selectedIntegrationId,
  selectedCredentialId,
  isDisabled = false,
  projectId,
}: AAPIntegrationSectionProps) {
  const { setValue } = useFormContext<AAPConnectionFields>()
  const [staleWarning, setStaleWarning] = useState('')

  return (
    <>
      <AAPIntegrationSelector
        value={selectedIntegrationId}
        onChange={(newIntegrationId) => {
          setValue('integration_id', newIntegrationId, { shouldDirty: true })
          if (!newIntegrationId) setValue('credential_id', undefined, { shouldDirty: true })
          setStaleWarning('')
        }}
        onStaleDetected={() => {
          setValue('integration_id', undefined, { shouldDirty: true })
          setValue('credential_id', undefined, { shouldDirty: true })
          setStaleWarning(
            'The previously selected integration is no longer available in this project. Select a new integration.'
          )
        }}
        isDisabled={isDisabled}
        isRequired
        projectId={projectId}
      />
      {staleWarning && <Alert variant="warning" isInline isPlain title={staleWarning} />}
      <AAPCredentialStatus
        integrationSelected={!!selectedIntegrationId}
        credentialId={selectedCredentialId}
        onChange={(credentialId) => setValue('credential_id', credentialId, { shouldDirty: true })}
        isDisabled={isDisabled}
        projectId={projectId}
      />
    </>
  )
}
