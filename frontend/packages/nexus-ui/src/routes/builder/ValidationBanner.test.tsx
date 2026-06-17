import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import type { ValidationError } from './builderReducer'
import { ValidationBanner } from './ValidationBanner'

describe('ValidationBanner', () => {
  const mockDispatch = vi.fn()

  it('renders nothing when errors is empty', () => {
    const { container } = render(<ValidationBanner errors={[]} dispatch={mockDispatch} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('renders alert with error count and list items', () => {
    const errors: ValidationError[] = [
      { message: 'Node A is disconnected', nodeId: 'node-1' },
      { message: 'Missing trigger', nodeId: null },
    ]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)

    expect(screen.getByText('Verification failed — 2 issues found')).toBeInTheDocument()
  })

  it('uses singular "issue" for a single error', () => {
    const errors: ValidationError[] = [{ message: 'Node A is disconnected', nodeId: 'node-1' }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)

    expect(screen.getByText('Verification failed — 1 issue found')).toBeInTheDocument()
  })

  it('dispatches CLEAR_VALIDATION_ERRORS when close button is clicked', async () => {
    const user = userEvent.setup()
    const errors: ValidationError[] = [{ message: 'Some error', nodeId: null }]

    render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)

    await user.click(screen.getByRole('button', { name: /close/i }))

    expect(mockDispatch).toHaveBeenCalledWith({ type: 'CLEAR_VALIDATION_ERRORS' })
  })

  it('has no accessibility violations', async () => {
    const errors: ValidationError[] = [
      { message: 'Node A is disconnected', nodeId: 'node-1' },
      { message: 'Missing trigger', nodeId: null },
    ]

    const { container } = render(<ValidationBanner errors={errors} dispatch={mockDispatch} />)

    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
