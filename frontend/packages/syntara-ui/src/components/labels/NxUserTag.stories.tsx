import { Flex, FlexItem, LabelGroup } from '@patternfly/react-core'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { NxUserTag } from './NxUserTag'

const meta: Meta<typeof NxUserTag> = {
  component: NxUserTag,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Outline label for user-authored content — workflow tags, user-entered values.\n\n' +
          'Renders with `variant="outline"` hardcoded. For system-generated labels ' +
          '(statuses, categories, metadata), use `NxLabel` instead.',
      },
    },
  },
}
export default meta

type Story = StoryObj<typeof meta>

/** Single user tag. */
export const Default: Story = {
  args: {
    children: 'my-workflow-tag',
  },
}

/** Multiple tags in a LabelGroup. */
export const TagGroup: Story = {
  render: () => (
    <LabelGroup>
      <NxUserTag>production</NxUserTag>
      <NxUserTag>critical</NxUserTag>
      <NxUserTag>team-platform</NxUserTag>
    </LabelGroup>
  ),
}

/** Tags with a remove callback. */
export const Removable: Story = {
  render: () => (
    <Flex gap={{ default: 'gapSm' }}>
      <FlexItem>
        <NxUserTag onClose={fn()}>production</NxUserTag>
      </FlexItem>
      <FlexItem>
        <NxUserTag onClose={fn()}>critical</NxUserTag>
      </FlexItem>
    </Flex>
  ),
}
