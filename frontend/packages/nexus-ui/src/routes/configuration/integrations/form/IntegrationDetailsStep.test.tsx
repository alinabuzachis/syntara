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

  describe('LLM Provider type', () => {
    function LLMTestWrapper() {
      const { control, setValue } = useForm<IntegrationFormData>({
        defaultValues: {
          name: '',
          description: '',
          integration_type: 'llm_provider',
          configuration: { integration_type: 'llm_provider', provider_hint: 'red_hat_ai', base_url: '' },
          scope: 'global',
        },
      })
      return <IntegrationDetailsStep control={control} setValue={setValue} />
    }

    it('shows provider hint dropdown when LLM Provider is selected', () => {
      render(<LLMTestWrapper />)

      expect(screen.getByText('Red Hat AI')).toBeInTheDocument()
    })

    it('shows name label as "Name" (not "Server name / ID") for LLM', () => {
      render(<LLMTestWrapper />)

      expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
    })

    it('shows base URL field for red_hat_ai provider', () => {
      render(<LLMTestWrapper />)

      expect(screen.getByRole('textbox', { name: /base url/i })).toBeInTheDocument()
    })

    it('switching from LLM Provider to MCP Server resets configuration', async () => {
      const user = userEvent.setup()
      render(<TestWrapper />)

      const typeToggle = screen.getByText('MCP Server')
      await user.click(typeToggle)
      await user.click(screen.getByRole('option', { name: 'LLM Provider' }))

      expect(screen.getByText('Red Hat AI')).toBeInTheDocument()

      const typeToggle2 = screen.getByRole('button', { name: 'LLM Provider' })
      await user.click(typeToggle2)
      await user.click(screen.getByRole('option', { name: 'MCP Server' }))

      expect(screen.queryByText('Red Hat AI')).not.toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: /base url/i })).toBeInTheDocument()
    })

    it('has no accessibility violations with LLM Provider selected', async () => {
      const { container } = render(<LLMTestWrapper />)

      let results: Awaited<ReturnType<typeof axe>>
      await act(async () => {
        results = await axe(container)
      })
      expect(results!).toHaveNoViolations()
    })
  })
})
