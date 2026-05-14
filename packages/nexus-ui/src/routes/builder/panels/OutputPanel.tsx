import { EmptyState, EmptyStateBody, Stack, StackItem, Title } from '@patternfly/react-core'
import { useState } from 'react'

import { NxPanel } from '../../../components/layout/NxPanel'

import styles from './panels.module.css'
import { OutputJsonView } from './views/OutputJsonView'
import { OutputSchemaView } from './views/OutputSchemaView'
import { OutputTableView } from './views/OutputTableView'
import { ViewToggle, type PanelView } from './ViewToggle'

export type OutputPanelProps = {
  outputData?: Record<string, unknown> | null
}

export function OutputPanel({ outputData }: Readonly<OutputPanelProps>) {
  const [activeView, setActiveView] = useState<PanelView>('json')

  function renderView() {
    if (!outputData) return null

    switch (activeView) {
      case 'schema':
        return <OutputSchemaView data={outputData} />
      case 'table':
        return <OutputTableView data={outputData} />
      case 'json':
        return <OutputJsonView data={outputData} />
      default: {
        const _exhaustive: never = activeView
        return _exhaustive
      }
    }
  }

  return (
    <NxPanel
      variant="raised"
      isFullHeight
      className={styles.panelContainer}
      panelMainProps={{ className: styles.panelMain }}
      panelMainBodyProps={{ className: styles.panelBody }}
    >
      <Title headingLevel="h2" size="md">
        Output
      </Title>
      {outputData ? (
        <Stack hasGutter className={styles.fillMinHeight}>
          <StackItem>
            <ViewToggle activeView={activeView} onChange={setActiveView} ariaLabel="Output view selection" />
          </StackItem>
          <StackItem isFilled className={styles.scrollableContent}>
            {renderView()}
          </StackItem>
        </Stack>
      ) : (
        <EmptyState headingLevel="h3" titleText="No output data" variant="xs">
          <EmptyStateBody>Run the workflow to see output data here.</EmptyStateBody>
        </EmptyState>
      )}
    </NxPanel>
  )
}
