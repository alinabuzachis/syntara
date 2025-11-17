import { render, screen } from '@testing-library/react'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, it, expect } from 'vitest'

import { FormTextarea } from './FormTextarea'

type TestFormData = {
  code: string
  notes?: string
}

function TestWrapper({ children }: { children: React.ReactNode }) {
  const methods = useForm<TestFormData>({
    defaultValues: {
      code: '',
      notes: '',
    },
  })

  return <FormProvider {...methods}>{children}</FormProvider>
}

describe('FormTextarea', () => {
  it('renders with label', () => {
    render(
      <TestWrapper>
        <FormTextarea name="code" label="Code" />
      </TestWrapper>
    )

    expect(screen.getByText('Code')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('renders with description', () => {
    render(
      <TestWrapper>
        <FormTextarea name="code" label="Code" description="Enter your Python code" />
      </TestWrapper>
    )

    expect(screen.getByText('Enter your Python code')).toBeInTheDocument()
  })

  it('shows required indicator when required', () => {
    render(
      <TestWrapper>
        <FormTextarea name="code" label="Code" required />
      </TestWrapper>
    )

    expect(screen.getByText('Code')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeRequired()
  })

  it('accepts standard textarea props', () => {
    render(
      <TestWrapper>
        <FormTextarea name="code" label="Code" rows={10} placeholder="Enter code here..." />
      </TestWrapper>
    )

    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveAttribute('rows', '10')
    expect(textarea).toHaveAttribute('placeholder', 'Enter code here...')
  })

  it('integrates with react-hook-form', () => {
    render(
      <TestWrapper>
        <FormTextarea name="code" label="Code" />
      </TestWrapper>
    )

    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveAttribute('name', 'code')
  })
})
