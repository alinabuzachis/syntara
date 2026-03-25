import { Button, Flex, FlexItem, Stack, StackItem, Tab, Tabs } from '@patternfly/react-core'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { useAlerts } from '../../../../components/alerts'

import { FormSubmitButton } from './FormSubmitButton'

interface NodeFormTabsLayoutProps {
  parametersContent: ReactNode
  settingsContent?: ReactNode
  submitButtonText?: string
  isSubmitDisabled?: boolean
}

export function NodeFormTabsLayout({
  parametersContent,
  settingsContent,
  submitButtonText,
  isSubmitDisabled,
}: NodeFormTabsLayoutProps) {
  const [activeTabKey, setActiveTabKey] = useState<number>(0)
  const { showInfo } = useAlerts()

  return (
    <Stack hasGutter style={{ height: '100%', minHeight: 0, flex: 1 }}>
      <StackItem>
        <Flex alignItems={{ default: 'alignItemsCenter' }} justifyContent={{ default: 'justifyContentSpaceBetween' }}>
          <FlexItem>
            <Tabs activeKey={activeTabKey} onSelect={(_event, key) => setActiveTabKey(Number(key))}>
              <Tab eventKey={0} title="Parameters" />
              <Tab eventKey={1} title="Settings" />
            </Tabs>
          </FlexItem>
          <FlexItem>
            <Button variant="primary" type="button" onClick={() => showInfo('Not yet implemented')}>
              Run step
            </Button>
          </FlexItem>
        </Flex>
      </StackItem>
      <StackItem isFilled style={{ minHeight: 0, overflow: 'auto', paddingRight: 'var(--pf-t--global--spacer--md)' }}>
        <Stack hasGutter>
          <StackItem>{activeTabKey === 0 ? parametersContent : (settingsContent ?? null)}</StackItem>
          <FormSubmitButton submitButtonText={submitButtonText} isDisabled={isSubmitDisabled} />
        </Stack>
      </StackItem>
    </Stack>
  )
}
