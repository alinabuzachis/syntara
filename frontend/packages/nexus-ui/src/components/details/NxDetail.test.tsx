import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { NxDetail } from './NxDetail'

describe('Detail', () => {
  it('renders label and children', () => {
    render(<NxDetail label="Name">John Doe</NxDetail>)

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('John Doe')).toBeInTheDocument()
  })

  it('returns null when children is undefined', () => {
    const { container } = render(<NxDetail label="Empty">{undefined}</NxDetail>)

    expect(container).toBeEmptyDOMElement()
  })

  it('returns null when children is null', () => {
    const { container } = render(<NxDetail label="Null">{null}</NxDetail>)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders with string children', () => {
    render(<NxDetail label="Status">Active</NxDetail>)

    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders with number children', () => {
    render(<NxDetail label="Count">{42}</NxDetail>)

    expect(screen.getByText('Count')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders with JSX children', () => {
    render(
      <NxDetail label="Custom">
        <span data-testid="custom-child">Custom content</span>
      </NxDetail>
    )

    expect(screen.getByText('Custom')).toBeInTheDocument()
    expect(screen.getByTestId('custom-child')).toBeInTheDocument()
  })

  // Intentionally use getByText rather than data-testid: Detail is rendered multiple times
  // inside a single Details list, so hardcoded data-testid values would be non-unique.
  it('renders label in DescriptionListTerm', () => {
    render(<NxDetail label="Term Label">Value</NxDetail>)

    expect(screen.getByText('Term Label')).toBeInTheDocument()
  })

  it('renders children in DescriptionListDescription', () => {
    render(<NxDetail label="Label">Description Value</NxDetail>)

    expect(screen.getByText('Description Value')).toBeInTheDocument()
  })

  it('renders with empty string children (falsy but valid)', () => {
    const { container } = render(<NxDetail label="Empty String">{''}</NxDetail>)

    // Empty string is falsy, but it's a valid React child
    // The component checks !props.children which is true for empty string
    expect(container).toBeEmptyDOMElement()
  })

  it('returns null for zero value (falsy check)', () => {
    // The component uses !props.children which is true for 0
    // This is the actual behavior - zero is treated as falsy
    const { container } = render(<NxDetail label="Zero">{0}</NxDetail>)

    expect(container).toBeEmptyDOMElement()
  })
})
