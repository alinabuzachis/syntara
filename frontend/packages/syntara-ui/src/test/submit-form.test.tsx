import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { submitForm } from './submit-form'

describe('submitForm', () => {
  it('triggers form submit handler when no form argument is provided', async () => {
    const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form aria-label="test form" onSubmit={handleSubmit}>
        <input name="field" defaultValue="value" />
      </form>
    )

    await submitForm()

    expect(handleSubmit).toHaveBeenCalledOnce()
  })

  it('triggers submit on the specific form passed as argument', async () => {
    const handleFirst = vi.fn((e: React.FormEvent) => e.preventDefault())
    const handleSecond = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <div>
        <form aria-label="first form" onSubmit={handleFirst}>
          <input name="a" />
        </form>
        <form aria-label="second form" onSubmit={handleSecond}>
          <input name="b" />
        </form>
      </div>
    )

    const secondForm = screen.getByRole<HTMLFormElement>('form', { name: 'second form' })
    await submitForm(secondForm)

    expect(handleFirst).not.toHaveBeenCalled()
    expect(handleSecond).toHaveBeenCalledOnce()
  })

  it('removes the temporary submit button after submission', async () => {
    const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form aria-label="test form" onSubmit={handleSubmit}>
        <input name="field" />
      </form>
    )

    await submitForm()

    expect(screen.queryByRole('button', { hidden: true })).not.toBeInTheDocument()
  })
})
