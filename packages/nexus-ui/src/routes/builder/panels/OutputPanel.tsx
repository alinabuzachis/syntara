import { EmptyState, EmptyStateBody, Title } from '@patternfly/react-core'

import { AppPanel } from '../../../components/AppPanel'

import styles from './panels.module.css'
import { OutputJsonView } from './views/OutputJsonView'

export type OutputPanelProps = {
  outputData?: Record<string, unknown> | null
}

export function OutputPanel({ outputData }: Readonly<OutputPanelProps>) {
  return (
    <AppPanel
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
        <section aria-label="JSON output">
          <OutputJsonView data={outputData} />
        </section>
      ) : (
        <EmptyState headingLevel="h3" titleText="No output data" variant="xs">
          <EmptyStateBody>Run the workflow to see output data here.</EmptyStateBody>
        </EmptyState>
      )}
    </AppPanel>
  )
}
