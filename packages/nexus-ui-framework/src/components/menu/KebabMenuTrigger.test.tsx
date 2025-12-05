import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { KebabMenuTrigger } from './KebabMenuTrigger'
import { Menu } from './Menu'
import { MenuItem } from './MenuItem'
import { MenuItems } from './MenuItems'

describe('KebabMenuTrigger', () => {
  it('renders correctly within Menu component', () => {
    render(
      <Menu>
        <KebabMenuTrigger label="Test actions" />
        <MenuItems>
          <MenuItem>Action 1</MenuItem>
        </MenuItems>
      </Menu>
    )

    expect(screen.getByRole('button', { name: 'Test actions' })).toBeInTheDocument()
  })

  it('uses default label when not provided', () => {
    render(
      <Menu>
        <KebabMenuTrigger />
        <MenuItems>
          <MenuItem>Action 1</MenuItem>
        </MenuItems>
      </Menu>
    )

    expect(screen.getByRole('button', { name: 'Actions menu' })).toBeInTheDocument()
  })

  it('opens menu when clicked', async () => {
    const user = userEvent.setup()

    render(
      <Menu>
        <KebabMenuTrigger label="Test actions" />
        <MenuItems>
          <MenuItem>Edit</MenuItem>
          <MenuItem>Delete</MenuItem>
        </MenuItems>
      </Menu>
    )

    const trigger = screen.getByRole('button', { name: 'Test actions' })
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    })
  })

  it('calls menu item onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <Menu>
        <KebabMenuTrigger label="Test actions" />
        <MenuItems>
          <MenuItem onClick={handleClick}>Delete</MenuItem>
        </MenuItems>
      </Menu>
    )

    const trigger = screen.getByRole('button', { name: 'Test actions' })
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('applies custom className', () => {
    render(
      <Menu>
        <KebabMenuTrigger label="Test actions" className="custom-class" />
        <MenuItems>
          <MenuItem>Action 1</MenuItem>
        </MenuItems>
      </Menu>
    )

    const trigger = screen.getByRole('button', { name: 'Test actions' })
    expect(trigger).toHaveClass('custom-class')
  })

  it('throws error when used outside Menu component', () => {
    // Suppress console.error for this test since we expect an error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => {
      render(<KebabMenuTrigger label="Test actions" />)
    }).toThrow()

    consoleSpy.mockRestore()
  })
})
