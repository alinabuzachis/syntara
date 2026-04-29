import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { NodeMenuAction } from '../hooks/useNodeMenuActions'

import { NodeMenu } from './NodeMenu'

describe('NodeMenu', () => {
  const createMenuAction = (overrides: Partial<NodeMenuAction> = {}): NodeMenuAction => ({
    id: 'test-action',
    label: 'Test Action',
    onClick: vi.fn(),
    ...overrides,
  })

  describe('rendering', () => {
    it('returns null when menuActions is empty', () => {
      const { container } = render(<NodeMenu menuActions={[]} />)
      expect(container).toBeEmptyDOMElement()
    })

    it('renders menu toggle button when actions provided', () => {
      const actions = [createMenuAction()]
      render(<NodeMenu menuActions={actions} />)

      expect(screen.getByRole('button', { name: /step actions menu/i })).toBeInTheDocument()
    })

    it('applies custom className', () => {
      const actions = [createMenuAction()]
      render(<NodeMenu menuActions={actions} className="custom-menu-class" />)

      const wrapper = screen.getByTestId('node-menu-wrapper')
      expect(wrapper).toHaveClass('custom-menu-class')
    })

    it('applies custom style', () => {
      const actions = [createMenuAction()]
      render(<NodeMenu menuActions={actions} style={{ marginTop: '10px' }} />)

      const wrapper = screen.getByTestId('node-menu-wrapper')
      expect(wrapper).toHaveStyle({ marginTop: '10px' })
    })

    it('has nodrag nopan classes', () => {
      const actions = [createMenuAction()]
      render(<NodeMenu menuActions={actions} />)

      const wrapper = screen.getByTestId('node-menu-wrapper')
      expect(wrapper).toHaveClass('nodrag')
      expect(wrapper).toHaveClass('nopan')
    })
  })

  describe('menu toggle behavior', () => {
    it('opens dropdown when toggle is clicked', async () => {
      const user = userEvent.setup()
      const actions = [createMenuAction({ label: 'Delete' })]
      render(<NodeMenu menuActions={actions} />)

      const toggle = screen.getByRole('button', { name: /step actions menu/i })
      await user.click(toggle)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
      })
    })

    it('closes dropdown when clicking outside', async () => {
      const user = userEvent.setup()
      const actions = [createMenuAction({ label: 'Delete' })]
      render(
        <div>
          <NodeMenu menuActions={actions} />
          <button data-testid="outside">Outside</button>
        </div>
      )

      // Open menu
      const toggle = screen.getByRole('button', { name: /step actions menu/i })
      await user.click(toggle)

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
      })

      // Click outside
      await user.click(screen.getByTestId('outside'))

      await waitFor(() => {
        expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
      })
    })
  })

  describe('menu items', () => {
    it('renders all menu items', async () => {
      const user = userEvent.setup()
      const actions = [
        createMenuAction({ id: '1', label: 'Edit' }),
        createMenuAction({ id: '2', label: 'Duplicate' }),
        createMenuAction({ id: '3', label: 'Delete' }),
      ]
      render(<NodeMenu menuActions={actions} />)

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Duplicate' })).toBeInTheDocument()
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
      })
    })

    it('calls onClick when menu item is clicked', async () => {
      const user = userEvent.setup()
      const onClickHandler = vi.fn()
      const actions = [createMenuAction({ label: 'Delete', onClick: onClickHandler })]
      render(<NodeMenu menuActions={actions} />)

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

      expect(onClickHandler).toHaveBeenCalledTimes(1)
    })

    it('closes menu after clicking menu item', async () => {
      const user = userEvent.setup()
      const actions = [createMenuAction({ label: 'Delete' })]
      render(<NodeMenu menuActions={actions} />)

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      await waitFor(() => {
        expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
      })

      await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

      await waitFor(() => {
        expect(screen.queryByRole('menuitem', { name: 'Delete' })).not.toBeInTheDocument()
      })
    })

    it('renders danger variant menu item', async () => {
      const user = userEvent.setup()
      const actions = [createMenuAction({ label: 'Delete', variant: 'danger' })]
      render(<NodeMenu menuActions={actions} />)

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      await waitFor(() => {
        const deleteItem = screen.getByTestId('node-menu-item-test-action')
        expect(deleteItem.closest('li')).toHaveClass('pf-m-danger')
      })
    })

    it('renders icon in menu item', async () => {
      const user = userEvent.setup()
      const icon = <svg data-testid="action-icon" />
      const actions = [createMenuAction({ label: 'Edit', icon })]
      render(<NodeMenu menuActions={actions} />)

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      await waitFor(() => {
        expect(screen.getByTestId('action-icon')).toBeInTheDocument()
      })
    })

    it('renders separator between items', async () => {
      const user = userEvent.setup()
      const actions: NodeMenuAction[] = [
        createMenuAction({ id: '1', label: 'Edit' }),
        { id: 'sep', label: '', onClick: vi.fn(), separator: true },
        createMenuAction({ id: '2', label: 'Delete', variant: 'danger' }),
      ]
      render(<NodeMenu menuActions={actions} />)

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      await waitFor(() => {
        expect(screen.getByRole('separator')).toBeInTheDocument()
      })
    })
  })

  describe('event propagation', () => {
    it('stops click propagation', async () => {
      const user = userEvent.setup()
      const parentClickHandler = vi.fn()
      const actions = [createMenuAction()]

      render(
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div onClick={parentClickHandler}>
          <NodeMenu menuActions={actions} />
        </div>
      )

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      expect(parentClickHandler).not.toHaveBeenCalled()
    })

    it('stops mousedown propagation', async () => {
      const user = userEvent.setup()
      const parentMouseDownHandler = vi.fn()
      const actions = [createMenuAction()]

      render(
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div onMouseDown={parentMouseDownHandler}>
          <NodeMenu menuActions={actions} />
        </div>
      )

      await user.click(screen.getByRole('button', { name: /step actions menu/i }))

      expect(parentMouseDownHandler).not.toHaveBeenCalled()
    })
  })

  describe('accessibility', () => {
    it('has button role on wrapper', () => {
      const actions = [createMenuAction()]
      render(<NodeMenu menuActions={actions} />)

      const wrapper = screen.getByTestId('node-menu-wrapper')
      expect(wrapper).toHaveAttribute('role', 'button')
    })

    it('has tabIndex 0 on wrapper', () => {
      const actions = [createMenuAction()]
      render(<NodeMenu menuActions={actions} />)

      const wrapper = screen.getByTestId('node-menu-wrapper')
      expect(wrapper).toHaveAttribute('tabIndex', '0')
    })

    it('menu toggle has aria-label', () => {
      const actions = [createMenuAction()]
      render(<NodeMenu menuActions={actions} />)

      expect(screen.getByRole('button', { name: /step actions menu/i })).toBeInTheDocument()
    })
  })
})
