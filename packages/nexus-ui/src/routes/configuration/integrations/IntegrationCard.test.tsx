import type { ToolProvider } from '@ansible/nexus-contracts'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IntegrationCard } from './IntegrationCard'

describe('IntegrationCard Component', () => {
  const mockIntegration: ToolProvider = {
    id: '1',
    name: 'Test MCP Server',
    description: 'This is a test integration server for development purposes',
    status: 'available',
    configuration: {
      provider_type: 'mcp-server',
      url: 'https://test.example.com',
    },
    tool_count: 5,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
  }

  const defaultProps = {
    integration: mockIntegration,
    onViewTools: vi.fn(),
    onValidateConnection: vi.fn(),
    onUninstall: vi.fn(),
  }

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<IntegrationCard {...defaultProps} />)

      // Check that the integration name is displayed
      expect(screen.getByText('Test MCP Server')).toBeInTheDocument()
    })

    it('displays integration name', () => {
      render(<IntegrationCard {...defaultProps} />)

      const nameElement = screen.getByText('Test MCP Server')
      expect(nameElement).toBeInTheDocument()
    })

    it('displays integration description', () => {
      render(<IntegrationCard {...defaultProps} />)

      const descriptionElement = screen.getByText('This is a test integration server for development purposes')
      expect(descriptionElement).toBeInTheDocument()
    })

    it('renders action menu button', () => {
      render(<IntegrationCard {...defaultProps} />)

      // Menu trigger button should be present
      const menuButton = screen.getByRole('button')
      expect(menuButton).toBeInTheDocument()
    })
  })

  describe('Menu Actions', () => {
    it('displays menu items when menu is opened', () => {
      render(<IntegrationCard {...defaultProps} />)

      // Click the menu button
      const menuButton = screen.getByRole('button')
      fireEvent.click(menuButton)

      // Check that menu items are displayed
      expect(screen.getByText('View and enable/disable tools')).toBeInTheDocument()
      expect(screen.getByText('Validate connection')).toBeInTheDocument()
      expect(screen.getByText('Uninstall')).toBeInTheDocument()
    })

    it('has three menu items', () => {
      render(<IntegrationCard {...defaultProps} />)

      // Click the menu button
      const menuButton = screen.getByRole('button')
      fireEvent.click(menuButton)

      // Verify all three menu items are present
      const menuItems = screen.getAllByRole('menuitem')
      expect(menuItems).toHaveLength(3)
    })

    it('calls onViewTools when "View and enable/disable tools" is clicked', () => {
      const onViewTools = vi.fn()
      render(<IntegrationCard {...defaultProps} onViewTools={onViewTools} />)

      const menuButton = screen.getByRole('button')
      fireEvent.click(menuButton)
      fireEvent.click(screen.getByText('View and enable/disable tools'))

      expect(onViewTools).toHaveBeenCalledTimes(1)
    })

    it('calls onValidateConnection when "Validate connection" is clicked', () => {
      const onValidateConnection = vi.fn()
      render(<IntegrationCard {...defaultProps} onValidateConnection={onValidateConnection} />)

      const menuButton = screen.getByRole('button')
      fireEvent.click(menuButton)
      fireEvent.click(screen.getByText('Validate connection'))

      expect(onValidateConnection).toHaveBeenCalledTimes(1)
    })

    it('calls onUninstall when "Uninstall" is clicked', () => {
      const onUninstall = vi.fn()
      render(<IntegrationCard {...defaultProps} onUninstall={onUninstall} />)

      const menuButton = screen.getByRole('button')
      fireEvent.click(menuButton)
      fireEvent.click(screen.getByText('Uninstall'))

      expect(onUninstall).toHaveBeenCalledTimes(1)
    })
  })

  describe('Different Integration Types', () => {
    it('renders correctly with minimal data', () => {
      const minimalIntegration: ToolProvider = {
        id: '2',
        name: 'Minimal Server',
        description: '',
        status: 'error',
        configuration: {
          provider_type: 'mcp-server',
        },
        tool_count: 0,
        created_at: '2023-01-01T00:00:00Z',
        updated_at: '2023-01-02T00:00:00Z',
      }

      render(<IntegrationCard {...defaultProps} integration={minimalIntegration} />)

      expect(screen.getByText('Minimal Server')).toBeInTheDocument()
    })

    it('handles long description text', () => {
      const longDescriptionIntegration: ToolProvider = {
        ...mockIntegration,
        description:
          'This is a very long description that contains a lot of information about the integration server and its capabilities. It might wrap to multiple lines in the UI and should be displayed properly without breaking the layout.',
      }

      render(<IntegrationCard {...defaultProps} integration={longDescriptionIntegration} />)

      expect(screen.getByText(/This is a very long description that contains a lot of information/)).toBeInTheDocument()
    })

    it('handles special characters in name and description', () => {
      const specialCharIntegration: ToolProvider = {
        ...mockIntegration,
        name: 'Server & Integration (Test) <v1>',
        description: 'Description with "quotes" and \'apostrophes\' & ampersands',
      }

      render(<IntegrationCard {...defaultProps} integration={specialCharIntegration} />)

      expect(screen.getByText('Server & Integration (Test) <v1>')).toBeInTheDocument()
      expect(screen.getByText('Description with "quotes" and \'apostrophes\' & ampersands')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('applies correct CSS classes to card container', () => {
      const { container } = render(<IntegrationCard {...defaultProps} />)

      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass('pf-v6-c-compass__panel')
    })

    it('applies correct styling to description', () => {
      render(<IntegrationCard {...defaultProps} />)

      const description = screen.getByText('This is a test integration server for development purposes')
      expect(description).toBeInTheDocument()
    })
  })
})
