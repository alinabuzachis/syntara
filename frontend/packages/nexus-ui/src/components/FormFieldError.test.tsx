import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { FormFieldError } from './FormFieldError'

describe('FormFieldError', () => {
  it('renders nothing when message is omitted', () => {
    const { container } = render(<FormFieldError />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders error message when provided', () => {
    render(<FormFieldError message="Project is required" />)
    expect(screen.getByText('Project is required')).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<FormFieldError message="Select at least one role" />)
    expect(await axe(container)).toHaveNoViolations()
  })
})
