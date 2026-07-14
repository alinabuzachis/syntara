import { Button, Content, Flex, FlexItem, Skeleton } from '@patternfly/react-core'
import { RhUiCheckCircleIcon, RhUiWarningFillIcon } from '@patternfly/react-icons'
import { useState } from 'react'

import { useCredentialName } from '../../workflows/canvas/nodes/hooks/useCredentialName'

import { CredentialSelector } from './CredentialSelector'
import styles from './LLMCredentialStatus.module.css'

export type LLMCredentialStatusProps = {
  /** Whether a model has been selected — hides the section if false. */
  modelSelected: boolean
  /** Currently selected credential ID (UUID string) or undefined. */
  credentialId: string | undefined
  onChange: (credentialId: string | undefined) => void
  isDisabled?: boolean
  projectId?: string
}

/**
 * Contextual LLM execution credential section, shown only when a model is selected.
 *
 * States:
 *   - Hidden when modelSelected === false
 *   - Warning + "Set up connection" when no credential is set
 *   - Warning + "Cancel" + credential picker below when isPickerOpen === true
 *   - "check credential name" + "Change" when credential is set and picker is closed
 */
export function LLMCredentialStatus({
  modelSelected,
  credentialId,
  onChange,
  isDisabled = false,
  projectId,
}: Readonly<LLMCredentialStatusProps>) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)

  const { name: credentialName, isPending: isCredentialPending } = useCredentialName(credentialId)

  if (!modelSelected) return null

  const handleChange = (newCredentialId: string | undefined) => {
    onChange(newCredentialId)
    if (newCredentialId) setIsPickerOpen(false)
  }

  // State: credential name still loading
  if (credentialId && isCredentialPending && !isPickerOpen) {
    return (
      <div className={styles.statusContainer}>
        <Skeleton screenreaderText="Loading credential" width="60%" height="24px" />
      </div>
    )
  }

  // State: credential configured + picker closed
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

  // States: no credential / picker open
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
              LLM credential not configured
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
            compatibleTypeNames={['LLM Provider']}
            label=""
            fieldId="llm-execution-credential"
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
