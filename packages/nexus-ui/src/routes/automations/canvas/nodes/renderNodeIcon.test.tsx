import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RegistryNodeId } from '../../../../constants'

import { renderNodeIcon as buildNodeIconView } from './renderNodeIcon'

// Mock icon component
function MockIcon() {
  return <span data-testid="mock-icon">Icon</span>
}

// Mock icon component that accepts style prop (for custom icons)
function MockStyledIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <span data-testid="styled-icon" style={style}>
      Styled Icon
    </span>
  )
}

describe('renderNodeIcon', () => {
  it('returns undefined when no IconComponent is provided', () => {
    const view = buildNodeIconView(undefined, 'test-node')
    expect(view).toBeUndefined()
  })

  it('renders standard icon for non-custom nodes', () => {
    const view = buildNodeIconView(MockIcon, 'test-node')
    render(<>{view}</>)

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument()
  })

  it('renders custom icon with styling for aap node', () => {
    const view = buildNodeIconView(MockStyledIcon, RegistryNodeId.AAP)
    render(<>{view}</>)

    const icon = screen.getByTestId('styled-icon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveStyle({
      width: '100%',
      height: '100%',
      display: 'block',
    })
  })

  it('applies rotation transform for logic-condition node', () => {
    const view = buildNodeIconView(MockIcon, RegistryNodeId.LOGIC_CONDITION)
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveStyle({ transform: 'rotate(90deg)' })
  })

  it('applies rotation transform for logic-converge node', () => {
    const view = buildNodeIconView(MockIcon, RegistryNodeId.LOGIC_CONVERGE)
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveStyle({ transform: 'rotate(90deg)' })
  })

  it('does not apply rotation for regular nodes', () => {
    const view = buildNodeIconView(MockIcon, 'regular-node')
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).not.toHaveStyle({ transform: 'rotate(90deg)' })
  })

  it('applies color when provided so icon matches node type accent', () => {
    const token = 'var(--pf-t--global--color--brand--default)'
    const view = buildNodeIconView(MockIcon, 'test-node', 'canvas', token)
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveStyle({ color: token })
    expect(iconWrapper).toHaveStyle({
      '--pf-v6-c-icon__content--Color': token,
    })
  })

  it('does not apply color when not provided', () => {
    const view = buildNodeIconView(MockIcon, 'test-node')
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).not.toHaveStyle({ color: expect.anything() })
  })

  it('uses canvas variant by default (md size)', () => {
    const view = buildNodeIconView(MockIcon, 'test-node')
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveClass('pf-m-md')
  })

  it('uses list variant when specified (xl size)', () => {
    const view = buildNodeIconView(MockIcon, 'test-node', 'list')
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveClass('pf-m-xl')
  })

  it('uses header variant when specified (xl size)', () => {
    const view = buildNodeIconView(MockIcon, 'test-node', 'header')
    const { container } = render(<>{view}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveClass('pf-m-xl')
  })

  it('applies different custom icon offset for header variant', () => {
    const view = buildNodeIconView(MockStyledIcon, RegistryNodeId.AAP, 'header')
    render(<>{view}</>)

    const icon = screen.getByTestId('styled-icon')
    // Header variant has customIconOffsetY: 1
    expect(icon.style.transform).toContain('translateY(1px)')
  })

  it('applies zero offset for canvas variant custom icon', () => {
    const view = buildNodeIconView(MockStyledIcon, RegistryNodeId.AAP, 'canvas')
    render(<>{view}</>)

    const icon = screen.getByTestId('styled-icon')
    // Canvas variant has customIconOffsetY: 0
    expect(icon.style.transform).toContain('translateY(0px)')
  })

  it('applies correct scale for list variant custom icon', () => {
    const view = buildNodeIconView(MockStyledIcon, RegistryNodeId.AAP, 'list')
    render(<>{view}</>)

    const icon = screen.getByTestId('styled-icon')
    // List variant has customIconScale: 1.5
    expect(icon.style.transform).toContain('scale(1.5)')
  })
})
