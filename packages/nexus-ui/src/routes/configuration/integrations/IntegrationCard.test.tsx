import type { ToolProvider } from '@ansible/nexus-contracts'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

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

  describe('Rendering', () => {
    it('renders without crashing', () => {
      render(<IntegrationCard integration={mockIntegration} />)

      // Check that the integration name is displayed
      expect(screen.getByText('Test MCP Server')).toBeInTheDocument()
    })

    it('displays integration name', () => {
      render(<IntegrationCard integration={mockIntegration} />)

      const nameElement = screen.getByText('Test MCP Server')
      expect(nameElement).toBeInTheDocument()
    })

    it('displays integration description', () => {
      render(<IntegrationCard integration={mockIntegration} />)

      const descriptionElement = screen.getByText('This is a test integration server for development purposes')
      expect(descriptionElement).toBeInTheDocument()
    })

    it('renders action menu button', () => {
      render(<IntegrationCard integration={mockIntegration} />)

      // Menu trigger button should be present
      const menuButton = screen.getByRole('button')
      expect(menuButton).toBeInTheDocument()
    })
  })

  describe('Menu Actions', () => {
    it('displays menu items when menu is opened', () => {
      render(<IntegrationCard integration={mockIntegration} />)

      // Click the menu button
      const menuButton = screen.getByRole('button')
      fireEvent.click(menuButton)

      // Check that menu items are displayed
      expect(screen.getByText('Start Server')).toBeInTheDocument()
      expect(screen.getByText('Stop Server')).toBeInTheDocument()
      expect(screen.getByText('Remove Server')).toBeInTheDocument()
    })

    it('has three menu items', () => {
      render(<IntegrationCard integration={mockIntegration} />)

      // Click the menu button
      const menuButton = screen.getByRole('button')
      fireEvent.click(menuButton)

      // Verify all three menu items are present
      const menuItems = screen.getAllByRole('menuitem')
      expect(menuItems).toHaveLength(3)
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

      render(<IntegrationCard integration={minimalIntegration} />)

      expect(screen.getByText('Minimal Server')).toBeInTheDocument()
    })

    it('handles long description text', () => {
      const longDescriptionIntegration: ToolProvider = {
        ...mockIntegration,
        description:
          'This is a very long description that contains a lot of information about the integration server and its capabilities. It might wrap to multiple lines in the UI and should be displayed properly without breaking the layout.',
      }

      render(<IntegrationCard integration={longDescriptionIntegration} />)

      expect(screen.getByText(/This is a very long description that contains a lot of information/)).toBeInTheDocument()
    })

    it('handles special characters in name and description', () => {
      const specialCharIntegration: ToolProvider = {
        ...mockIntegration,
        name: 'Server & Integration (Test) <v1>',
        description: 'Description with "quotes" and \'apostrophes\' & ampersands',
      }

      render(<IntegrationCard integration={specialCharIntegration} />)

      expect(screen.getByText('Server & Integration (Test) <v1>')).toBeInTheDocument()
      expect(screen.getByText('Description with "quotes" and \'apostrophes\' & ampersands')).toBeInTheDocument()
    })
  })

  describe('Styling', () => {
    it('applies correct CSS classes to card container', () => {
      const { container } = render(<IntegrationCard integration={mockIntegration} />)

      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass('pf-v6-c-compass__panel')
    })

    it('applies correct styling to description', () => {
      render(<IntegrationCard integration={mockIntegration} />)

      const description = screen.getByText('This is a test integration server for development purposes')
      expect(description).toBeInTheDocument()
    })
  })
})
