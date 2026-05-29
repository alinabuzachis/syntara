import type { Decorator } from '@storybook/react-vite'

import { NxPage, NxPageBody } from '../layout/NxPage'
import { NxPageHeader } from '../layout/NxPageHeader'
import { NxPanel } from '../layout/NxPanel'

export const pageDecorator: Decorator = (Story) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      height: '400px',
      border: '1px dashed var(--pf-t--global--border--color--default)',
    }}
  >
    <NxPage>
      <NxPageHeader title="Workflows" />
      <NxPageBody isCentered>
        <NxPanel isFullHeight>
          <Story />
        </NxPanel>
      </NxPageBody>
    </NxPage>
  </div>
)
