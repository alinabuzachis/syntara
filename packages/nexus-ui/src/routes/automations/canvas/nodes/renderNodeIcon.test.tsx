import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RegistryNodeId } from '../../../../constants'

import { renderNodeIcon } from './renderNodeIcon'

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
    const result = renderNodeIcon(undefined, 'test-node')
    expect(result).toBeUndefined()
  })

  it('renders standard icon for non-custom nodes', () => {
    const result = renderNodeIcon(MockIcon, 'test-node')
    render(<>{result}</>)

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument()
  })

  it('renders custom icon with styling for aap node', () => {
    const result = renderNodeIcon(MockStyledIcon, RegistryNodeId.AAP)
    render(<>{result}</>)

    const icon = screen.getByTestId('styled-icon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveStyle({
      width: '100%',
      height: '100%',
      display: 'block',
    })
  })

  it('applies rotation transform for logic-condition node', () => {
    const result = renderNodeIcon(MockIcon, RegistryNodeId.LOGIC_CONDITION)
    const { container } = render(<>{result}</>)

    // The pf-v6-c-icon span should have rotation style
    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveStyle({ transform: 'rotate(90deg)' })
  })

  it('applies rotation transform for logic-converge node', () => {
    const result = renderNodeIcon(MockIcon, RegistryNodeId.LOGIC_CONVERGE)
    const { container } = render(<>{result}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveStyle({ transform: 'rotate(90deg)' })
  })

  it('does not apply rotation for regular nodes', () => {
    const result = renderNodeIcon(MockIcon, 'regular-node')
    const { container } = render(<>{result}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).not.toHaveStyle({ transform: 'rotate(90deg)' })
  })

  it('applies color when provided so icon matches node type accent', () => {
    const token = 'var(--pf-t--global--color--brand--default)'
    const result = renderNodeIcon(MockIcon, 'test-node', 'canvas', token)
    const { container } = render(<>{result}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveStyle({ color: token })
    expect(iconWrapper).toHaveStyle({
      '--pf-v6-c-icon__content--Color': token,
    })
  })

  it('does not apply color when not provided', () => {
    const result = renderNodeIcon(MockIcon, 'test-node')
    const { container } = render(<>{result}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).not.toHaveStyle({ color: expect.anything() })
  })

  it('uses canvas variant by default (md size)', () => {
    const result = renderNodeIcon(MockIcon, 'test-node')
    const { container } = render(<>{result}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveClass('pf-m-md')
  })

  it('uses list variant when specified (xl size)', () => {
    const result = renderNodeIcon(MockIcon, 'test-node', 'list')
    const { container } = render(<>{result}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveClass('pf-m-xl')
  })

  it('uses header variant when specified (xl size)', () => {
    const result = renderNodeIcon(MockIcon, 'test-node', 'header')
    const { container } = render(<>{result}</>)

    const iconWrapper = container.querySelector('.pf-v6-c-icon')
    expect(iconWrapper).toHaveClass('pf-m-xl')
  })

  it('applies different custom icon offset for header variant', () => {
    const result = renderNodeIcon(MockStyledIcon, RegistryNodeId.AAP, 'header')
    render(<>{result}</>)

    const icon = screen.getByTestId('styled-icon')
    // Header variant has customIconOffsetY: 1
    expect(icon.style.transform).toContain('translateY(1px)')
  })

  it('applies zero offset for canvas variant custom icon', () => {
    const result = renderNodeIcon(MockStyledIcon, RegistryNodeId.AAP, 'canvas')
    render(<>{result}</>)

    const icon = screen.getByTestId('styled-icon')
    // Canvas variant has customIconOffsetY: 0
    expect(icon.style.transform).toContain('translateY(0px)')
  })

  it('applies correct scale for list variant custom icon', () => {
    const result = renderNodeIcon(MockStyledIcon, RegistryNodeId.AAP, 'list')
    render(<>{result}</>)

    const icon = screen.getByTestId('styled-icon')
    // List variant has customIconScale: 1.5
    expect(icon.style.transform).toContain('scale(1.5)')
  })
})
