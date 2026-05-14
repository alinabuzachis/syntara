import { Button, Content, StackItem } from '@patternfly/react-core'
import type { Meta, StoryObj } from '@storybook/react'

import { NxPage, NxPageBody } from './NxPage'
import { NxPageHeader } from './NxPageHeader'
import { NxPanel } from './NxPanel'
import { NxPanelContentStack } from './NxPanelContentStack'

const meta: Meta<typeof NxPage> = {
  component: NxPage,
  decorators: [
    (Story) => (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '400px',
          border: '1px dashed var(--pf-t--global--border--color--default)',
        }}
      >
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof meta>

export const WithHeader: Story = {
  render: () => (
    <NxPage>
      <NxPageHeader title="Users" />
      <NxPageBody>
        <Content component="p">Main content area.</Content>
      </NxPageBody>
    </NxPage>
  ),
}

export const WithHeaderAndToolbar: Story = {
  render: () => (
    <NxPage>
      <NxPageHeader title="Users" toolbar={<Button variant="primary">Create user</Button>} />
      <NxPageBody>
        <Content component="p">Main content area.</Content>
      </NxPageBody>
    </NxPage>
  ),
}

export const WithBreadcrumbsAndToolbar: Story = {
  render: () => (
    <NxPage>
      <NxPageHeader
        title="Create user"
        breadcrumbs={[
          { label: 'Access management', href: '/access-management' },
          { label: 'Users', href: '/access-management/users' },
          { label: 'Create user' },
        ]}
        toolbar={
          <>
            <Button variant="primary">Save</Button>
            <Button variant="secondary">Cancel</Button>
          </>
        }
      />
      <NxPageBody>
        <Content component="p">Main content area.</Content>
      </NxPageBody>
    </NxPage>
  ),
}

export const CenteredMain: Story = {
  name: 'NxPageBody — isCentered',
  render: () => (
    <NxPage>
      <NxPageHeader title="Users" />
      <NxPageBody isCentered>
        <Content component="p">Centered layout for empty states and loading.</Content>
      </NxPageBody>
    </NxPage>
  ),
}

export const WithPanel: Story = {
  name: 'NxPageBody — with NxPanel',
  render: () => (
    <NxPage>
      <NxPageHeader title="Users" toolbar={<Button variant="primary">Create user</Button>} />
      <NxPageBody>
        <NxPanel>
          <Content component="p">Content inside a glass panel.</Content>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}

export const WithRaisedPanel: Story = {
  name: 'NxPageBody — with raised NxPanel',
  render: () => (
    <NxPage>
      <NxPageHeader title="Settings" />
      <NxPageBody>
        <NxPanel variant="raised">
          <Content component="p">Content inside a raised panel with shadow and smaller corner radius.</Content>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}

export const WithScrollablePanel: Story = {
  name: 'NxPageBody — with scrollable NxPanel',
  render: () => (
    <NxPage>
      <NxPageHeader title="Audit log" />
      <NxPageBody>
        <NxPanel isFullHeight isScrollable>
          {Array.from({ length: 20 }, (_, i) => (
            <Content key={i} component="p">
              Row {i + 1} — overflow content to demonstrate the full-height scrollable panel inside NxPageBody.
            </Content>
          ))}
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}

export const FullListPageLayout: Story = {
  name: 'NxPageBody — full list page layout',
  render: () => (
    <NxPage>
      <NxPageHeader title="Workflows" toolbar={<Button variant="primary">Create workflow</Button>} />
      <NxPageBody>
        <NxPanel isFullHeight>
          <NxPanelContentStack variant="inset">
            <StackItem>
              <Content component="p">Filter bar</Content>
            </StackItem>
            <StackItem isFilled>
              <Content component="p">Table content area</Content>
            </StackItem>
          </NxPanelContentStack>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}

export const FullTabPageLayout: Story = {
  name: 'NxPageBody — full tab panel layout',
  render: () => (
    <NxPage>
      <NxPageHeader title="User detail" />
      <NxPageBody>
        <NxPanel isFullHeight>
          <NxPanelContentStack>
            <StackItem>
              <Content component="p">Filter bar (no inset — tab chrome provides spacing)</Content>
            </StackItem>
            <StackItem isFilled>
              <Content component="p">Table content area</Content>
            </StackItem>
          </NxPanelContentStack>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}
