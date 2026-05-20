import { Content } from '@patternfly/react-core'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ConfirmationDialog } from './ConfirmationDialog'

const meta: Meta<typeof ConfirmationDialog> = {
  component: ConfirmationDialog,
  args: {
    isOpen: true,
    title: 'Confirm action',
    onClose: fn(),
    onConfirm: fn(),
    children: <Content component="p">Are you sure you want to proceed?</Content>,
  },
}
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Danger: Story = {
  args: {
    title: 'Delete workflow?',
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
    titleIconVariant: 'warning',
    children: <Content component="p">This workflow will be permanently deleted. This action cannot be undone.</Content>,
  },
}

export const DestructiveAcknowledgement: Story = {
  args: {
    title: 'Delete workflow?',
    confirmLabel: 'Delete',
    confirmVariant: 'danger',
    titleIconVariant: 'warning',
    destructiveAcknowledgement: {
      checkboxId: 'delete-ack',
      label: 'I understand this cannot be undone.',
    },
    children: <Content component="p">This workflow will be permanently deleted. This action cannot be undone.</Content>,
  },
}

export const Loading: Story = {
  args: {
    confirmLoading: true,
  },
}
