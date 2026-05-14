import { Button } from '@patternfly/react-core'
import type { Meta, StoryObj } from '@storybook/react'

import { NxPageHeader } from './NxPageHeader'

const meta: Meta<typeof NxPageHeader> = {
  component: NxPageHeader,
  args: {
    title: 'Page title',
  },
}
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithToolbar: Story = {
  args: {
    toolbar: (
      <>
        <Button variant="primary">Create</Button>
        <Button variant="secondary">Export</Button>
      </>
    ),
  },
}

export const WithBreadcrumbs: Story = {
  args: {
    title: 'Create user',
    breadcrumbs: [
      { label: 'Access management', href: '/access-management' },
      { label: 'Users', href: '/access-management/users' },
      { label: 'Create user' },
    ],
  },
}

export const WithBreadcrumbsAndToolbar: Story = {
  args: {
    title: 'Edit workflow',
    breadcrumbs: [
      { label: 'Automation', href: '/automation' },
      { label: 'Workflows', href: '/automation/workflows' },
      { label: 'Edit workflow' },
    ],
    toolbar: (
      <>
        <Button variant="primary">Save</Button>
        <Button variant="secondary">Cancel</Button>
      </>
    ),
  },
}

export const SingleBreadcrumbHidden: Story = {
  args: {
    title: 'Users',
    breadcrumbs: [{ label: 'Access management', href: '/access-management' }],
  },
}
