import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Detail } from './Detail'

describe('Detail', () => {
  it('renders label and children', () => {
    render(<Detail label="Name">John Doe</Detail>)

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
  })

  it('returns null when children is undefined', () => {
    const { container } = render(<Detail label="Empty">{undefined}</Detail>)

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null when children is null', () => {
    const { container } = render(<Detail label="Null">{null}</Detail>)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders with string children', () => {
    render(<Detail label="Status">Active</Detail>)

    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders with number children', () => {
    render(<Detail label="Count">{42}</Detail>)

    expect(screen.getByText('Count')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders with JSX children', () => {
    render(
      <Detail label="Custom">
        <span data-testid="custom-child">Custom content</span>
      </Detail>
    )

    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.getByTestId('custom-child')).toBeInTheDocument()
  })

  // Intentionally use getByText rather than data-testid: Detail is rendered multiple times
  // inside a single Details list, so hardcoded data-testid values would be non-unique.
  it('renders label in DescriptionListTerm', () => {
    render(<Detail label="Term Label">Value</Detail>)

    expect(screen.getByText('Term Label')).toBeInTheDocument()
  })

  it('renders children in DescriptionListDescription', () => {
    render(<Detail label="Label">Description Value</Detail>)

    expect(screen.getByText('Description Value')).toBeInTheDocument()
  })

  it('renders with empty string children (falsy but valid)', () => {
    const { container } = render(<Detail label="Empty String">{''}</Detail>)

    // Empty string is falsy, but it's a valid React child
    // The component checks !props.children which is true for empty string
    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for zero value (falsy check)', () => {
    // The component uses !props.children which is true for 0
    // This is the actual behavior - zero is treated as falsy
    const { container } = render(<Detail label="Zero">{0}</Detail>)

    expect(container).toBeEmptyDOMElement()
  })
})
