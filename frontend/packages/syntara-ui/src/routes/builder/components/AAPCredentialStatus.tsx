import { Button, Content, Flex, FlexItem, Skeleton } from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiWarningFillIcon } from '@patternfly/react-icons'
import { useState } from 'react'

import { useCredentialName } from '../../workflows/canvas/nodes/hooks/useCredentialName'

import styles from './AAPCredentialStatus.module.css'
import { CredentialSelector } from './CredentialSelector'

export type AAPCredentialStatusProps = {
  integrationSelected: boolean
  credentialId: string | undefined
  onChange: (credentialId: string | undefined) => void
  isDisabled?: boolean
  projectId?: string
}

export function AAPCredentialStatus({
  integrationSelected,
  credentialId,
  onChange,
  isDisabled = false,
  projectId,
}: Readonly<AAPCredentialStatusProps>) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const { name: credentialName, isPending: isCredentialPending } = useCredentialName(credentialId)

  if (!integrationSelected) return null

  const handleChange = (newCredentialId: string | undefined) => {
    onChange(newCredentialId)
    if (newCredentialId) setIsPickerOpen(false)
  }

  if (credentialId && isCredentialPending && !isPickerOpen) {
    return (
      <div className={styles.statusContainer}>
        <Skeleton screenreaderText="Loading credential" width="60%" height="24px" />
      </div>
    )
  }

  if (credentialId && credentialName && !isPickerOpen) {
    return (
      <div className={styles.statusContainer}>
        <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
          <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
            <FlexItem>
              <RhUiCheckCircleIcon className={styles.checkIcon} aria-hidden />
            </FlexItem>
            <FlexItem>
              <Content component="small" className={styles.statusText}>
                {credentialName}
              </Content>
            </FlexItem>
          </Flex>
          {!isDisabled && (
            <FlexItem>
              <Button variant="link" size="sm" onClick={() => setIsPickerOpen(true)}>
                Change
              </Button>
            </FlexItem>
          )}
        </Flex>
      </div>
    )
  }

  const showPicker = isPickerOpen || (credentialId && !credentialName)

  return (
    <div className={styles.statusContainer}>
      <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
        <Flex spaceItems={{ default: 'spaceItemsSm' }} alignItems={{ default: 'alignItemsCenter' }}>
          <FlexItem>
            <RhUiWarningFillIcon className={styles.warningIcon} aria-hidden />
          </FlexItem>
          <FlexItem>
            <Content component="small" className={styles.statusText}>
              AAP credential not configured
            </Content>
          </FlexItem>
        </Flex>
        {!isDisabled && (
          <FlexItem>
            <Button variant="link" size="sm" onClick={() => setIsPickerOpen((prev) => !prev)}>
              {showPicker ? 'Cancel' : 'Set up connection'}
            </Button>
          </FlexItem>
        )}
      </Flex>
      {showPicker && (
        <div className={styles.pickerContainer}>
          <CredentialSelector
            value={credentialId}
            onChange={handleChange}
            compatibleTypeNames={['Ansible Automation Platform']}
            label=""
            fieldId="aap-execution-credential"
            placeholder="Select a credential"
            allowCreate
            isDisabled={isDisabled}
            projectId={projectId}
          />
        </div>
      )}
    </div>
  )
}
