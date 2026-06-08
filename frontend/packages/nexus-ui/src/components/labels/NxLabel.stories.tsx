import { Flex, FlexItem } from '@patternfly/react-core'
import {
  RhUiCheckCircleIcon,
  RhUiCloseCircleIcon,
  RhUiHourglassIcon,
  RhUiInformationIcon,
  RhUiSyncIcon,
  RhUiWarningIcon,
} from '@patternfly/react-icons'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { NxLabel } from './NxLabel'

const meta: Meta<typeof NxLabel> = {
  component: NxLabel,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'Standard application label. Defaults to `variant="filled"` and `isCompact={true}`.\n\n' +
          'Use for all system-generated labels: statuses, categories, metadata badges, and counts. ' +
          'Pass `status` and `icon` for status indicators; pass `color` for categorical labels.\n\n' +
          'For user-authored tags (workflow tags, user-entered values), use `NxUserTag` instead.',
      },
    },
  },
}
export default meta

type Story = StoryObj<typeof meta>

/** Default usage with a status and icon. */
export const Default: Story = {
  args: {
    status: 'success',
    icon: <RhUiCheckCircleIcon />,
    children: 'Completed',
  },
}

/** All five PatternFly `status` values. */
export const AllStatuses: Story = {
  render: () => (
    <Flex gap={{ default: 'gapSm' }}>
      <FlexItem>
        <NxLabel status="success" icon={<RhUiCheckCircleIcon />}>
          Success
        </NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel status="danger" icon={<RhUiCloseCircleIcon />}>
          Danger
        </NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel status="warning" icon={<RhUiWarningIcon />}>
          Warning
        </NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel status="info" icon={<RhUiInformationIcon />}>
          Info
        </NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel status="custom" icon={<RhUiSyncIcon />}>
          Custom
        </NxLabel>
      </FlexItem>
    </Flex>
  ),
}

/** Categorical labels using `color` for semantic distinction. */
export const ColorVariants: Story = {
  render: () => (
    <Flex gap={{ default: 'gapSm' }}>
      <FlexItem>
        <NxLabel color="blue">System</NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel color="green">Project</NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel color="purple">Custom</NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel color="grey">Built-in</NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel color="teal">User</NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel color="orange">Group</NxLabel>
      </FlexItem>
    </Flex>
  ),
}

/** Without an icon. */
export const WithoutIcon: Story = {
  render: () => (
    <Flex gap={{ default: 'gapSm' }}>
      <FlexItem>
        <NxLabel status="success">Completed</NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel status="danger">Failed</NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel status="custom">Pending</NxLabel>
      </FlexItem>
    </Flex>
  ),
}

/** Full-size labels with `isCompact={false}`. */
export const FullSize: Story = {
  render: () => (
    <Flex gap={{ default: 'gapSm' }}>
      <FlexItem>
        <NxLabel status="success" icon={<RhUiCheckCircleIcon />} isCompact={false}>
          Completed
        </NxLabel>
      </FlexItem>
      <FlexItem>
        <NxLabel status="custom" icon={<RhUiHourglassIcon />} isCompact={false}>
          Pending
        </NxLabel>
      </FlexItem>
    </Flex>
  ),
}
