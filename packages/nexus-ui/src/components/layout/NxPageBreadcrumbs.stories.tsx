import type { Meta, StoryObj } from '@storybook/react'

import { NxPageBreadcrumbs } from './NxPageBreadcrumbs'

const meta: Meta<typeof NxPageBreadcrumbs> = {
  component: NxPageBreadcrumbs,
}
export default meta

type Story = StoryObj<typeof meta>

export const SingleItemHidden: Story = {
  args: {
    items: [{ label: 'Access management', href: '/access-management' }],
  },
}

export const TwoItems: Story = {
  args: {
    items: [{ label: 'Access management', href: '/access-management' }, { label: 'Users' }],
  },
}

export const ThreeItems: Story = {
  args: {
    items: [
      { label: 'Access management', href: '/access-management' },
      { label: 'Users', href: '/access-management/users' },
      { label: 'Create user' },
    ],
  },
}

export const ManyItems: Story = {
  args: {
    items: [
      { label: 'Settings', href: '/settings' },
      { label: 'Infrastructure', href: '/settings/infrastructure' },
      { label: 'Clusters', href: '/settings/infrastructure/clusters' },
      { label: 'Regions', href: '/settings/infrastructure/clusters/regions' },
      { label: 'Add region' },
    ],
  },
}
