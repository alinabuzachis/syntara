import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Textarea } from './Textarea'

describe('Textarea', () => {
  it('renders without crashing', () => {
    render(<Textarea />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeInTheDocument()
  })

  it('applies correct default styling classes', () => {
    render(<Textarea />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveClass('w-full', 'rounded-md', 'bg-white/5', 'px-3', 'py-2')
  })

  it('accepts standard textarea props', () => {
    render(<Textarea rows={5} placeholder="Enter text" data-testid="custom-textarea" />)
    const textarea = screen.getByTestId('custom-textarea')
    expect(textarea).toHaveAttribute('rows', '5')
    expect(textarea).toHaveAttribute('placeholder', 'Enter text')
  })

  it('accepts value and onChange props', () => {
    const handleChange = vi.fn()
    render(<Textarea value="test value" onChange={handleChange} />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue('test value')
  })

  it('can be marked as required', () => {
    render(<Textarea required />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeRequired()
  })

  it('can be disabled', () => {
    render(<Textarea disabled />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).toBeDisabled()
  })
})
