import { IntegrationTypeEnum, LLMProviderHintEnum } from '@ansible/nexus-contracts'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { IntegrationDetailsStep } from './IntegrationDetailsStep'
import type { IntegrationFormData } from './integrationFormSchema'

vi.mock('../../../access/useAllProjects', () => ({
  useAllProjects: () => ({
    projects: [
      { id: 'p-001', name: 'default' },
      { id: 'p-002', name: 'alice-sandbox' },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
}))

function TestWrapper({
  defaultType = IntegrationTypeEnum.MCP_SERVER,
  onTypeChange: onTypeChangeProp = vi.fn(),
}: {
  defaultType?: string
  onTypeChange?: (newType: string) => void
} = {}) {
  const defaultValues: IntegrationFormData =
    defaultType === IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM
      ? {
          name: '',
          description: '',
          integration_type: IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM,
          configuration: {
            integration_type: IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM,
            aap_url: '',
            insecure_skip_tls_verify: false,
          },
          scope: 'global',
          project_ids: [],
        }
      : {
          name: '',
          description: '',
          integration_type: IntegrationTypeEnum.MCP_SERVER,
          configuration: { integration_type: IntegrationTypeEnum.MCP_SERVER, base_url: '' },
          scope: 'global',
          project_ids: [],
        }

  const { control, setValue } = useForm<IntegrationFormData>({ defaultValues })

  const onTypeChange = useCallback(
    (newType: string) => {
      let newConfig: IntegrationFormData['configuration']
      if (newType === IntegrationTypeEnum.LLM_PROVIDER) {
        newConfig = {
          integration_type: 'llm_provider' as const,
          provider_hint: LLMProviderHintEnum.RED_HAT_AI,
          base_url: '',
        }
      } else if (newType === IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM) {
        newConfig = {
          integration_type: 'ansible_automation_platform' as const,
          aap_url: '',
          insecure_skip_tls_verify: false,
        }
      } else {
        newConfig = { integration_type: 'mcp_server' as const, base_url: '' }
      }
      setValue('configuration', newConfig, { shouldValidate: false })
      setValue('integration_type', newType as IntegrationFormData['integration_type'])
      setValue('management_credential_id', null)
      onTypeChangeProp(newType)
    },
    [setValue, onTypeChangeProp]
  )

  return <IntegrationDetailsStep control={control} setValue={setValue} onTypeChange={onTypeChange} />
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

  it('renders base URL field for MCP Server', () => {
    render(<TestWrapper />)

    expect(screen.getByRole('textbox', { name: /base url/i })).toBeInTheDocument()
  })

  it('does not render AAP URL field for MCP Server', () => {
    render(<TestWrapper />)

    expect(screen.queryByRole('textbox', { name: /aap url/i })).not.toBeInTheDocument()
  })

  it('allows typing in name field', async () => {
    const user = userEvent.setup()
    render(<TestWrapper />)

    const nameInput = screen.getByRole('textbox', { name: /name/i })
    await user.type(nameInput, 'My MCP Server')

    expect(nameInput).toHaveValue('My MCP Server')
  })

  describe('Ansible Automation Platform', () => {
    it('renders AAP URL field for Ansible Automation Platform', () => {
      render(<TestWrapper defaultType={IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM} />)

      expect(screen.getByRole('textbox', { name: /aap url/i })).toBeInTheDocument()
    })

    it('does not render base URL field for Ansible Automation Platform', () => {
      render(<TestWrapper defaultType={IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM} />)

      expect(screen.queryByRole('textbox', { name: /base url/i })).not.toBeInTheDocument()
    })

    it('renders TLS verification switch for Ansible Automation Platform', () => {
      render(<TestWrapper defaultType={IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM} />)

      expect(screen.getByRole('switch', { name: /ssl verification/i })).toBeInTheDocument()
    })

    it('shows TLS warning when verification is disabled', async () => {
      const user = userEvent.setup()
      render(<TestWrapper defaultType={IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM} />)

      await user.click(screen.getByRole('switch', { name: /ssl verification/i }))

      expect(screen.getByText(/disabling tls verification/i)).toBeInTheDocument()
    })

    it('hides TLS warning when verification is enabled', () => {
      render(<TestWrapper defaultType={IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM} />)

      expect(screen.queryByText(/disabling tls verification/i)).not.toBeInTheDocument()
    })
  })

  describe('type change', () => {
    it('calls onTypeChange callback when type is selected', async () => {
      const onTypeChange = vi.fn()
      const user = userEvent.setup()
      render(<TestWrapper onTypeChange={onTypeChange} />)

      await user.click(screen.getByText('MCP Server'))
      await user.click(screen.getByText('Ansible Automation Platform'))

      expect(onTypeChange).toHaveBeenCalledWith(IntegrationTypeEnum.ANSIBLE_AUTOMATION_PLATFORM)
    })
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
      return <IntegrationDetailsStep control={control} setValue={setValue} onTypeChange={vi.fn()} />
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

    it('changes provider hint when selecting a different provider', async () => {
      const user = userEvent.setup()
      render(<LLMTestWrapper />)

      await user.click(screen.getByText('Red Hat AI'))
      await user.click(screen.getByRole('option', { name: 'OpenAI' }))

      expect(screen.getByRole('button', { name: 'OpenAI' })).toBeInTheDocument()
    })

    it('hides base URL field when selecting a provider with a default URL', async () => {
      const user = userEvent.setup()
      render(<LLMTestWrapper />)

      expect(screen.getByRole('textbox', { name: /base url/i })).toBeInTheDocument()

      await user.click(screen.getByText('Red Hat AI'))
      await user.click(screen.getByRole('option', { name: 'OpenAI' }))

      expect(screen.queryByRole('textbox', { name: /base url/i })).not.toBeInTheDocument()
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

  describe('scope toggle', () => {
    it('defaults to global scope', () => {
      render(<TestWrapper />)

      const toggle = screen.getByRole('switch', { name: /integration scope/i })
      expect(toggle).toBeChecked()
    })

    it('toggles to project scope', async () => {
      const user = userEvent.setup()
      render(<TestWrapper />)

      const toggle = screen.getByRole('switch', { name: /integration scope/i })
      await user.click(toggle)

      expect(toggle).not.toBeChecked()
    })

    it('toggles back to global scope', async () => {
      const user = userEvent.setup()
      render(<TestWrapper />)

      const toggle = screen.getByRole('switch', { name: /integration scope/i })
      await user.click(toggle)
      await user.click(toggle)

      expect(toggle).toBeChecked()
    })
  })
})
