import { Stack, StackItem, Tab, Tabs } from '@patternfly/react-core'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { NxPageBody } from '../../../../components/layout/NxPage'

type NodeFormTabsLayoutProps = {
  parametersContent: ReactNode
  settingsContent?: ReactNode
  /** When true, the Settings tab is not rendered. Use for node types with no configurable settings (e.g. condition, switch). */
  hideSettingsTab?: boolean
}

export function NodeFormTabsLayout({ parametersContent, settingsContent, hideSettingsTab }: NodeFormTabsLayoutProps) {
  const [activeTabKey, setActiveTabKey] = useState<number>(0)

  return (
    <Stack hasGutter style={{ height: '100%', minHeight: 0, flex: 1 }}>
      <StackItem>
        <Tabs activeKey={activeTabKey} onSelect={(_event, key) => setActiveTabKey(Number(key))}>
          <Tab eventKey={0} title="Parameters" />
          {!hideSettingsTab && <Tab eventKey={1} title="Settings" />}
        </Tabs>
      </StackItem>
      <NxPageBody>
        <Stack hasGutter>
          <StackItem>{activeTabKey === 0 ? parametersContent : (settingsContent ?? null)}</StackItem>
        </Stack>
      </NxPageBody>
    </Stack>
  )
}
