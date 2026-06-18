import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { NxPanel } from './NxPanel'

describe('NxPanel', () => {
  it('renders children', () => {
    render(<NxPanel>Panel content</NxPanel>)

    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('renders footer content', () => {
    render(<NxPanel footer={<button>Save</button>}>Panel content</NxPanel>)

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    expect(screen.getByText('Panel content')).toBeInTheDocument()
  })

  it('does not render footer when prop is omitted', () => {
    render(<NxPanel>Panel content</NxPanel>)

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(
      <NxPanel hasNoPadding isFullHeight isScrollable>
        <p>Scrollable region</p>
      </NxPanel>
    )

    expect(await axe(container)).toHaveNoViolations()
  })

  it('has no accessibility violations with footer', async () => {
    const { container } = render(
      <NxPanel isFullHeight isScrollable footer={<button>Save</button>}>
        <p>Panel with footer</p>
      </NxPanel>
    )

    expect(await axe(container)).toHaveNoViolations()
  })
})
