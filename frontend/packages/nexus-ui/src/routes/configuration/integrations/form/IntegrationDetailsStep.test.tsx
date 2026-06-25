import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { axe } from 'vitest-axe'

import { IntegrationDetailsStep } from './IntegrationDetailsStep'
import type { IntegrationFormData } from './integrationFormSchema'

function TestWrapper() {
  const { control, setValue } = useForm<IntegrationFormData>({
    defaultValues: {
      name: '',
      description: '',
      integration_type: 'mcp_server',
      configuration: { integration_type: 'mcp_server', base_url: '' },
      scope: 'global',
    },
  })
  return <IntegrationDetailsStep control={control} setValue={setValue} />
}

describe('IntegrationDetailsStep', () => {
  it('renders heading and description', () => {
    render(<TestWrapper />)

    expect(screen.getByText('Integration details')).toBeInTheDocument()
    expect(screen.getByText(/select an integration type/i)).toBeInTheDocument()
  })

  it('renders integration type selector', () => {
    render(<TestWrapper />)

    expect(screen.getByText('MCP Server')).toBeInTheDocument()
  })

  it('renders name field', () => {
    render(<TestWrapper />)

    expect(screen.getByRole('textbox', { name: /name/i })).toBeInTheDocument()
  })

  it('renders description field', () => {
    render(<TestWrapper />)

    expect(screen.getByRole('textbox', { name: /description/i })).toBeInTheDocument()
  })

  it('renders base URL field', () => {
    render(<TestWrapper />)

    expect(screen.getByRole('textbox', { name: /base url/i })).toBeInTheDocument()
  })

  it('allows typing in name field', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    const nameInput = screen.getByRole('textbox', { name: /name/i })
    await user.type(nameInput, 'My MCP Server')

    expect(nameInput).toHaveValue('My MCP Server')
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<TestWrapper />)

    let results: Awaited<ReturnType<typeof axe>>
    await act(async () => {
      results = await axe(container)
    })
    expect(results!).toHaveNoViolations()
  })
})
