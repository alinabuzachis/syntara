import { Button, Content, StackItem } from '@patternfly/react-core'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'

import { ErrorState } from '../states/ErrorState'

import { NxPage, NxPageBody } from './NxPage'
import { NxPageHeader } from './NxPageHeader'
import { NxPanel } from './NxPanel'
import { NxPanelContentStack } from './NxPanelContentStack'

const meta: Meta<typeof NxPage> = {
  component: NxPage,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '`NxPage` + `NxPageHeader` + `NxPageBody` form the standard page layout skeleton.\n\n' +
          '`NxPageBody` is the main content area below the header. ' +
          'Pass `isCentered` to center content on both axes — use this for loading spinners and empty states.',
      },
    },
  },
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

export const FullListPageLayout: Story = {
  name: 'Full list page layout',
  parameters: {
    docs: {
      description: {
        story:
          'Standard list page layout: fixed filter bar row above a filled table area, with horizontal inset padding.',
      },
    },
  },
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

export const FullDetailPageLayout: Story = {
  name: 'Full detail page layout (breadcrumbs)',
  parameters: {
    docs: {
      description: {
        story: 'Detail page with breadcrumb navigation. Use when the user drills into a specific resource from a list.',
      },
    },
  },
  render: () => (
    <NxPage>
      <NxPageHeader
        title="my-workflow"
        breadcrumbs={[{ label: 'Workflows', href: '/workflows' }, { label: 'my-workflow' }]}
      />
      <NxPageBody>
        <NxPanel isFullHeight>
          <NxPanelContentStack>
            <StackItem>
              <Content component="p">Tab bar</Content>
            </StackItem>
            <StackItem isFilled>
              <Content component="p">Tab content area</Content>
            </StackItem>
          </NxPanelContentStack>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}

export const FullFormPageLayout: Story = {
  name: 'Full form page layout (breadcrumbs + toolbar)',
  parameters: {
    docs: {
      description: {
        story: 'Create/edit form page with breadcrumb trail and Save/Cancel toolbar.',
      },
    },
  },
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
            <Button variant="secondary">Cancel</Button>
            <Button variant="primary">Save</Button>
          </>
        }
      />
      <NxPageBody>
        <NxPanel>
          <Content component="p">Form fields</Content>
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}

export const ErrorPageLayout: Story = {
  name: 'Error state in panel',
  parameters: {
    docs: {
      description: {
        story:
          'Error states live inside `NxPanel` within the page body — the same panel that normally holds table or form content.',
      },
    },
  },
  render: () => (
    <NxPage>
      <NxPageHeader title="Workflows" toolbar={<Button variant="primary">Create workflow</Button>} />
      <NxPageBody isCentered>
        <NxPanel isFullHeight>
          <ErrorState message={{ detail: 'Connection timed out.', retryable: true }} onRetry={fn()} />
        </NxPanel>
      </NxPageBody>
    </NxPage>
  ),
}
