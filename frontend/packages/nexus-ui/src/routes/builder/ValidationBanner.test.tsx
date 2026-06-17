import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ValidationError } from './builderReducer'
import { ValidationBanner } from './ValidationBanner'

async function expandAlert() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /danger alert details/i }))
  return user
}

describe('ValidationBanner', () => {
  const mockDispatch = vi.fn()

  it('renders nothing when errors is empty', () => {
    const { container } = render(<ValidationBanner errors={[]} dispatch={mockDispatch} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders alert with error count and list items', async () => {
    const errors: ValidationError[] = [
      { message: 'Node A is disconnected', nodeId: 'node-1' },
      { message: 'Missing trigger', nodeId: null },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    await expandAlert()

    expect(screen.getByText('Verification failed — 2 issues found')).toBeInTheDocument()
  })

  it('uses singular "issue" for a single error', async () => {
    const errors: ValidationError[] = [{ message: 'Node A is disconnected', nodeId: 'node-1' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    await expandAlert()

    expect(screen.getByText('Verification failed — 1 issue found')).toBeInTheDocument()
  })

  it('dispatches CLEAR_VALIDATION_ERRORS when close button is clicked', async () => {
    const errors: ValidationError[] = [{ message: 'Some error', nodeId: null }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    const user = await expandAlert()

    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_VALIDATION_ERRORS' })
  })

  it('renders node name as a clickable link when nodeName is present', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [{ message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByRole('button', { name: 'MyNode' })).toBeInTheDocument()
    expect(screen.getByText(/: is disconnected/)).toBeInTheDocument()
  })

  it('calls onNavigateToNode with nodeId when node name link is clicked', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [{ message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    const user = await expandAlert()

    await user.click(screen.getByRole('button', { name: 'MyNode' }))

    expect(onNavigateToNode).toHaveBeenCalledWith('node-1')
  })

  it('renders "Go to step" fallback link when nodeId is present but nodeName is missing', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [{ message: 'Some raw error', nodeId: 'node-2' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByText('Some raw error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Go to step' })).toBeInTheDocument()
  })

  it('calls onNavigateToNode when "Go to step" fallback link is clicked', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [{ message: 'Some raw error', nodeId: 'node-2' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    const user = await expandAlert()

    await user.click(screen.getByRole('button', { name: 'Go to step' }))

    expect(onNavigateToNode).toHaveBeenCalledWith('node-2')
  })

  it('renders global errors (null nodeId) as plain text without links', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [{ message: 'Missing trigger', nodeId: null }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />)
    await expandAlert()

    expect(screen.getByText('Missing trigger')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to step' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Missing trigger' })).not.toBeInTheDocument()
  })

  it('renders all errors as plain text when onNavigateToNode is not provided', async () => {
    const errors: ValidationError[] = [
      { message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' },
      { message: 'Some raw error', nodeId: 'node-2' },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)
    await expandAlert()

    expect(screen.getByText('MyNode: is disconnected')).toBeInTheDocument()
    expect(screen.getByText('Some raw error')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'MyNode' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to step' })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const onNavigateToNode = vi.fn()
    const errors: ValidationError[] = [
      { message: 'MyNode: is disconnected', nodeId: 'node-1', nodeName: 'MyNode' },
      { message: 'Some raw error', nodeId: 'node-2' },
      { message: 'Missing trigger', nodeId: null },
    ]

    const { container } = render(
      <ValidationBanner errors={errors} dispatch={mockDispatch} onNavigateToNode={onNavigateToNode} />
    )
    await expandAlert()

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
