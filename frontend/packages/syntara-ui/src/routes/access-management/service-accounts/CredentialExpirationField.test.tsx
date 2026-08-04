import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { CredentialExpirationField } from './CredentialExpirationField'

const defaultProps = {
  selectedDate: '2026-12-01',
  onDateChange: vi.fn(),
  dateError: '',
  validator: () => '',
  helperText: 'Maximum lifetime: 180 days (until 2026-12-01)',
}

describe('CredentialExpirationField', () => {
  it.each([
    { label: undefined, expected: 'Expiration date' },
    { label: 'Credential expiration date', expected: 'Credential expiration date' },
  ])('renders with label "$expected"', ({ label, expected }) => {
    render(<CredentialExpirationField {...defaultProps} label={label} />)

    const input: HTMLInputElement = screen.getByLabelText(expected)
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('2026-12-01')
  })

  it('uses custom fieldId for the input element', () => {
    render(<CredentialExpirationField {...defaultProps} fieldId="custom-field-id" label="Custom label" />)

    expect(screen.getByLabelText('Custom label')).toBeInTheDocument()
  })

  it('shows helper text when there is no error', () => {
    render(<CredentialExpirationField {...defaultProps} />)

    expect(screen.getByText('Maximum lifetime: 180 days (until 2026-12-01)')).toBeInTheDocument()
  })

  it('shows error text instead of helper text when dateError is set', () => {
    render(<CredentialExpirationField {...defaultProps} dateError="Date must be in the future" />)

    expect(screen.getByText('Date must be in the future')).toBeInTheDocument()
    expect(screen.queryByText('Maximum lifetime: 180 days (until 2026-12-01)')).not.toBeInTheDocument()
  })

  it('calls onDateChange when the user types a date', async () => {
    const onDateChange = vi.fn()
    const user = userEvent.setup()
    render(<CredentialExpirationField {...defaultProps} onDateChange={onDateChange} />)

    const input = screen.getByLabelText('Expiration date')
    await user.clear(input)
    await user.type(input, '2026-12-15')

    expect(onDateChange).toHaveBeenCalled()
  })

  it('marks the field as required', () => {
    render(<CredentialExpirationField {...defaultProps} />)

    expect(screen.getByText('*')).toBeInTheDocument()
  })

  describe('Accessibility', () => {
    it('has no accessibility violations', async () => {
      const { container } = render(<CredentialExpirationField {...defaultProps} />)

      await waitFor(async () => {
        const results = await axe(container)
        expect(results).toHaveNoViolations()
      })
    })

    it('has no accessibility violations with error state', async () => {
      const { container } = render(
        <CredentialExpirationField {...defaultProps} dateError="Date exceeds maximum credential lifetime" />
      )

      await waitFor(async () => {
        const results = await axe(container)
        expect(results).toHaveNoViolations()
      })
    })
  })
})
