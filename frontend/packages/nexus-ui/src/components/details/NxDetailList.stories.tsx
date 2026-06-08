import { Label } from '@patternfly/react-core'
import type { Meta, StoryObj } from '@storybook/react-vite'

import { NxDetail } from './NxDetail'
import { NxDetailList } from './NxDetailList'

const meta: Meta<typeof NxDetailList> = {
  component: NxDetailList,
}
export default meta

type Story = StoryObj<typeof meta>

/** Vertical detail list — the default layout for credential and workflow detail pages. */
export const Default: Story = {
  render: () => (
    <NxDetailList>
      <NxDetail label="Name">prod-aws-credentials</NxDetail>
      <NxDetail label="Credential type">
        <Label color="blue">Amazon Web Services</Label>
      </NxDetail>
      <NxDetail label="Created by">admin</NxDetail>
      <NxDetail label="Last modified">Nov 15, 2024</NxDetail>
    </NxDetailList>
  ),
}

/**
 * `isHorizontal` places the term and description side-by-side.
 * Used inside compact spaces such as workflow canvas node cards.
 */
export const Horizontal: Story = {
  render: () => (
    <NxDetailList isHorizontal>
      <NxDetail label="Name">prod-aws-credentials</NxDetail>
      <NxDetail label="Credential type">
        <Label color="blue">Amazon Web Services</Label>
      </NxDetail>
      <NxDetail label="Created by">admin</NxDetail>
    </NxDetailList>
  ),
}

/**
 * Optional fields can be passed unconditionally — `NxDetail` renders nothing when its value
 * is absent, so the list stays clean without conditional JSX at the call site.
 */
export const WithOptionalFields: Story = {
  render: () => (
    <NxDetailList>
      <NxDetail label="Name">prod-aws-credentials</NxDetail>
      <NxDetail label="Description">{undefined}</NxDetail>
      <NxDetail label="Credential type">
        <Label color="blue">Amazon Web Services</Label>
      </NxDetail>
      <NxDetail label="Last modified">Nov 15, 2024</NxDetail>
    </NxDetailList>
  ),
}
