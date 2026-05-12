import { CheckCircleIcon } from '@patternfly/react-icons'
import type { Meta, StoryObj } from '@storybook/react'

import { IconLabel } from './IconLabel'

const meta: Meta<typeof IconLabel> = {
  component: IconLabel,
}
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    icon: <CheckCircleIcon />,
    children: 'Workflow enabled',
  },
}

export const NoIcon: Story = {
  args: {
    children: 'Label only',
  },
}

export const CustomColor: Story = {
  args: {
    icon: <CheckCircleIcon />,
    children: 'Success',
    color: 'var(--pf-t--global--color--status--success--default)',
  },
}
