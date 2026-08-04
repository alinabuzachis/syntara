import type { Meta, StoryObj } from '@storybook/react-vite'

import { NxLoadingState } from './NxLoadingState'
import { pageDecorator } from './storyDecorators'

const meta: Meta<typeof NxLoadingState> = {
  component: NxLoadingState,
  decorators: [pageDecorator],
  tags: ['autodocs'],
}
export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
