import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { KebabAction } from './NxKebabMenu'
import { NxKebabMenu } from './NxKebabMenu'

function buildActions(overrides: Partial<KebabAction>[] = []): KebabAction[] {
  const defaults: KebabAction[] = [
    { key: 'edit', title: 'Edit', onClick: vi.fn() },
    { key: 'sep', isSeparator: true },
    { key: 'delete', title: 'Delete', isDanger: true, onClick: vi.fn() },
  ]
  return defaults.map((action, i) => ({ ...action, ...overrides[i] }))
}

describe('NxKebabMenu', () => {
  it('renders a toggle button with the provided aria-label', () => {
    render(<NxKebabMenu actions={buildActions()} aria-label="Actions for item A" />)

    expect(screen.getByRole('button', { name: 'Actions for item A' })).toBeInTheDocument()
  })

  it('opens the menu and shows items when toggled', async () => {
    const user = userEvent.setup()
    render(<NxKebabMenu actions={buildActions()} aria-label="Row actions" />)

    await user.click(screen.getByRole('button', { name: 'Row actions' }))

    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toBeInTheDocument()
  })

  it('renders separators between action groups', async () => {
    const user = userEvent.setup()
    render(<NxKebabMenu actions={buildActions()} aria-label="Row actions" />)

    await user.click(screen.getByRole('button', { name: 'Row actions' }))

    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('calls onClick for enabled items', async () => {
    const user = userEvent.setup()
    const actions = buildActions()
    render(<NxKebabMenu actions={actions} aria-label="Row actions" />)

    await user.click(screen.getByRole('button', { name: 'Row actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))

    expect(actions[0].onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick and keeps menu open for aria-disabled items', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const actions: KebabAction[] = [
      {
        key: 'edit',
        title: 'Edit',
        onClick,
        isAriaDisabled: true,
        tooltipProps: { content: 'No permission' },
      },
    ]
    render(<NxKebabMenu actions={actions} aria-label="Row actions" />)

    await user.click(screen.getByRole('button', { name: 'Row actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Edit' }))

    expect(onClick).not.toHaveBeenCalled()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
  })

  it('removes danger styling from aria-disabled items', async () => {
    const user = userEvent.setup()
    const actions: KebabAction[] = [
      { key: 'delete', title: 'Delete', isDanger: true, isAriaDisabled: true, onClick: vi.fn() },
    ]
    render(<NxKebabMenu actions={actions} aria-label="Row actions" />)

    await user.click(screen.getByRole('button', { name: 'Row actions' }))

    const menu = screen.getByRole('menu')
    const item = within(menu).getByRole('menuitem', { name: 'Delete' })
    expect(item).not.toHaveClass('pf-m-danger')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<NxKebabMenu actions={buildActions()} aria-label="Row actions" />)

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations when open', async () => {
    const user = userEvent.setup()
    const { container } = render(<NxKebabMenu actions={buildActions()} aria-label="Row actions" />)

    await user.click(screen.getByRole('button', { name: 'Row actions' }))

    expect(await axe(container)).toHaveNoViolations()
  })
})
