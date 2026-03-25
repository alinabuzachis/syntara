import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { EmptyStateNoData } from './EmptyStateNoData'

describe('EmptyStateNoData', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<EmptyStateNoData />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('renders with default title and description', () => {
    render(<EmptyStateNoData />)

    expect(screen.getByText('No data available')).toBeInTheDocument()
    expect(screen.getByText('There is no data to display at this time.')).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<EmptyStateNoData title="No automations found" />)

    expect(screen.getByText('No automations found')).toBeInTheDocument()
  })

  it('renders with custom description', () => {
    render(<EmptyStateNoData description="Create your first item to get started." />)

    expect(screen.getByText('Create your first item to get started.')).toBeInTheDocument()
  })

  it('shows add data button when addData is provided', () => {
    const addData = vi.fn()
    render(<EmptyStateNoData addData={addData} />)

    expect(screen.getByRole('button', { name: 'Add data' })).toBeInTheDocument()
  })

  it('does not show add data button when addData is not provided', () => {
    render(<EmptyStateNoData />)

    expect(screen.queryByRole('button', { name: 'Add data' })).not.toBeInTheDocument()
  })

  it('calls addData when button is clicked', () => {
    const addData = vi.fn()
    render(<EmptyStateNoData addData={addData} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add data' }))
    expect(addData).toHaveBeenCalledTimes(1)
  })

  it('renders with custom button text', () => {
    const addData = vi.fn()
    render(<EmptyStateNoData addData={addData} buttonText="Create Automation" />)

    expect(screen.getByRole('button', { name: 'Create Automation' })).toBeInTheDocument()
  })

  it('renders with custom image', () => {
    render(<EmptyStateNoData imageSrc="/empty-state.png" imageAlt="No items" />)

    const image = screen.getByRole('img', { name: 'No items' })
    expect(image).toBeInTheDocument()
    expect(image).toHaveAttribute('src', '/empty-state.png')
  })

  it('uses default alt text for image when not provided', () => {
    render(<EmptyStateNoData imageSrc="/empty-state.png" />)

    const image = screen.getByRole('img', { name: 'No data' })
    expect(image).toBeInTheDocument()
  })

  it('renders all custom props together', () => {
    const addData = vi.fn()
    render(
      <EmptyStateNoData
        title="No Workflows"
        description="Create your first workflow"
        buttonText="New Workflow"
        imageSrc="/workflow.png"
        imageAlt="Workflow icon"
        addData={addData}
      />
    )

    expect(screen.getByText('No Workflows')).toBeInTheDocument()
    expect(screen.getByText('Create your first workflow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Workflow' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Workflow icon' })).toBeInTheDocument()
  })

  it('renders primary variant button', () => {
    const addData = vi.fn()
    render(<EmptyStateNoData addData={addData} />)

    const button = screen.getByRole('button', { name: 'Add data' })
    expect(button).toHaveClass('pf-m-primary')
  })
})
