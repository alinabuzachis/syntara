import { Content, StackItem } from '@patternfly/react-core'
import type { Decorator, Meta, StoryObj } from '@storybook/react'

import { NxPanelContentStack } from './NxPanelContentStack'

const panelDecorator: Decorator = (Story) => (
  <div
    style={{
      height: '300px',
      display: 'flex',
      flexDirection: 'column',
      border: '1px dashed var(--pf-t--global--border--color--default)',
    }}
  >
    <Story />
  </div>
)

const CONTENT = (
  <>
    <StackItem>
      <Content component="p">Filter bar area</Content>
    </StackItem>
    <StackItem isFilled>
      <Content component="p">Table / scrollable content area (fills remaining height)</Content>
    </StackItem>
  </>
)

const meta: Meta<typeof NxPanelContentStack> = {
  component: NxPanelContentStack,
  decorators: [panelDecorator],
  args: { children: CONTENT },
}
export default meta

type Story = StoryObj<typeof meta>

/**
 * Default — full-height flex sizing with no horizontal padding.
 * Use inside tab-based detail panels where the tab chrome already provides inset.
 */
export const Default: Story = {}

/**
 * Inset — adds a small horizontal padding (`--pf-t--global--spacer--sm`) so the filter bar
 * and table don't sit flush against the panel edge.
 * Use on top-level list pages (Workflows, Executions, Approvals, Integrations).
 */
export const Inset: Story = {
  args: { variant: 'inset' },
}
