import { Table, Tbody } from '@patternfly/react-table'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { ModelRow, type ModelRowProps } from './ModelRow'

function renderRow(overrides: Partial<ModelRowProps> = {}) {
  const props: ModelRowProps = {
    model: { id: 'model-1', name: 'GPT-4o', description: 'Large language model' },
    index: 0,
    isEnabled: true,
    isDefault: false,
    onSelect: vi.fn(),
    onSetDefault: vi.fn(),
    onRemoveDefault: vi.fn(),
    ...overrides,
  }
  const view = render(
    <Table aria-label="test table">
      <Tbody>
        <ModelRow {...props} />
      </Tbody>
    </Table>
  )
  return { ...view, props }
}

describe('ModelRow', () => {
  describe('rendering', () => {
    it('renders model name', () => {
      renderRow()
      expect(screen.getByText('GPT-4o')).toBeInTheDocument()
    })

    it('renders model description when present', () => {
      renderRow()
      expect(screen.getByText('Large language model')).toBeInTheDocument()
    })

    it('omits description when null', () => {
      renderRow({ model: { id: 'm1', name: 'Test', description: null } })
      expect(screen.queryByText('null')).not.toBeInTheDocument()
    })

    it('omits description when empty string', () => {
      renderRow({ model: { id: 'm1', name: 'Test Model', description: '' } })
      expect(screen.getByText('Test Model')).toBeInTheDocument()
      expect(screen.queryByRole('definition')).not.toBeInTheDocument()
    })

    it('shows Default badge when isDefault is true', () => {
      renderRow({ isDefault: true })
      expect(screen.getByText('Default')).toBeInTheDocument()
    })

    it('does not show Default badge when isDefault is false', () => {
      renderRow({ isDefault: false })
      expect(screen.queryByText('Default')).not.toBeInTheDocument()
    })

    it('checkbox is checked when isEnabled is true', () => {
      renderRow({ isEnabled: true })
      expect(screen.getByRole('checkbox')).toBeChecked()
    })

    it('checkbox is unchecked when isEnabled is false', () => {
      renderRow({ isEnabled: false })
      expect(screen.getByRole('checkbox')).not.toBeChecked()
    })
  })

  describe('kebab actions', () => {
    it('shows Set as default for enabled non-default models', async () => {
      const user = userEvent.setup()
      renderRow({ isEnabled: true, isDefault: false })

      await user.click(screen.getByRole('button', { name: 'Actions for GPT-4o' }))
      expect(screen.getByRole('menuitem', { name: /Set as default model/ })).toBeInTheDocument()
    })

    it('shows Remove default for default models', async () => {
      const user = userEvent.setup()
      renderRow({ isEnabled: true, isDefault: true })

      await user.click(screen.getByRole('button', { name: 'Actions for GPT-4o' }))
      expect(screen.getByRole('menuitem', { name: /Remove default model/ })).toBeInTheDocument()
    })

    it('renders no kebab menu for disabled models', () => {
      renderRow({ isEnabled: false })
      expect(screen.queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
    })

    it('calls onSetDefault with model id', async () => {
      const user = userEvent.setup()
      const { props } = renderRow({ isEnabled: true, isDefault: false })

      await user.click(screen.getByRole('button', { name: 'Actions for GPT-4o' }))
      await user.click(screen.getByRole('menuitem', { name: /Set as default model/ }))

      expect(props.onSetDefault).toHaveBeenCalledWith('model-1')
    })

    it('calls onRemoveDefault with model id', async () => {
      const user = userEvent.setup()
      const { props } = renderRow({ isEnabled: true, isDefault: true })

      await user.click(screen.getByRole('button', { name: 'Actions for GPT-4o' }))
      await user.click(screen.getByRole('menuitem', { name: /Remove default model/ }))

      expect(props.onRemoveDefault).toHaveBeenCalledWith('model-1')
    })
  })

  describe('checkbox interaction', () => {
    it('calls onSelect with model id and checked state', async () => {
      const user = userEvent.setup()
      const { props } = renderRow({ isEnabled: false })

      await user.click(screen.getByRole('checkbox'))
      expect(props.onSelect).toHaveBeenCalledWith('model-1', true)
    })
  })

  describe('accessibility', () => {
    it('has no violations for enabled non-default model', async () => {
      const { container } = renderRow()
      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })

    it('has no violations for default model', async () => {
      const { container } = renderRow({ isDefault: true })
      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })

    it('has no violations for disabled model', async () => {
      const { container } = renderRow({ isEnabled: false })
      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })

    it('kebab menu has proper aria-label', () => {
      renderRow({ isEnabled: true })
      expect(screen.getByRole('button', { name: 'Actions for GPT-4o' })).toBeInTheDocument()
    })
  })
})
