import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import {
  AdvancedSection,
  AutoCreateGroupsState,
  EmptyMappingState,
  MappingTable,
  ReadOnlyView,
} from './GroupMappingComponents'
import type { GroupMappingEntry, NexusGroup } from './groupMappingUtils'

const mockNexusGroups: NexusGroup[] = [
  { id: 'g1', name: 'admin', description: 'Administrators' },
  { id: 'g2', name: 'users', description: 'Regular users' },
]

const mockEntries: GroupMappingEntry[] = [
  { key: 'k1', idpGroupValue: 'idp-admin', nexusGroupId: 'g1' },
  { key: 'k2', idpGroupValue: 'idp-users', nexusGroupId: 'g2' },
]

describe('EmptyMappingState', () => {
  it('renders heading and description', () => {
    render(<EmptyMappingState onTestSignIn={vi.fn()} onAddManually={vi.fn()} />)

    expect(screen.getByRole('heading', { name: /no group mappings configured/i })).toBeInTheDocument()
    expect(screen.getByText(/automatically assign users/i)).toBeInTheDocument()
  })

  it('renders Discover groups and Add manually buttons', () => {
    render(<EmptyMappingState onTestSignIn={vi.fn()} onAddManually={vi.fn()} />)

    expect(screen.getByRole('button', { name: /discover groups/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add manually/i })).toBeInTheDocument()
  })

  it('calls onTestSignIn when Discover groups button is clicked', async () => {
    const onTestSignIn = vi.fn()
    const user = userEvent.setup()
    render(<EmptyMappingState onTestSignIn={onTestSignIn} onAddManually={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /discover groups/i }))
    expect(onTestSignIn).toHaveBeenCalledOnce()
  })

  it('calls onAddManually when Add manually button is clicked', async () => {
    const onAddManually = vi.fn()
    const user = userEvent.setup()
    render(<EmptyMappingState onTestSignIn={vi.fn()} onAddManually={onAddManually} />)

    await user.click(screen.getByRole('button', { name: /add manually/i }))
    expect(onAddManually).toHaveBeenCalledOnce()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<EmptyMappingState onTestSignIn={vi.fn()} onAddManually={vi.fn()} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('AutoCreateGroupsState', () => {
  it('renders heading and description', () => {
    render(<AutoCreateGroupsState />)

    expect(screen.getByRole('heading', { name: /auto-create groups is enabled/i })).toBeInTheDocument()
    expect(screen.getByText(/automatically created and assigned/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<AutoCreateGroupsState />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('AdvancedSection', () => {
  const defaultProps = {
    expression: 'groups[*]',
    onExpressionChange: vi.fn(),
    defaultExpression: null,
    rawClaims: null,
  }

  it('renders expandable section with JMESPath label', () => {
    render(<AdvancedSection {...defaultProps} />)
    expect(screen.getByText('Advanced')).toBeInTheDocument()
  })

  it('shows expression input when expanded', async () => {
    const user = userEvent.setup()
    render(<AdvancedSection {...defaultProps} />)

    await user.click(screen.getByText('Advanced'))
    expect(screen.getByLabelText('Group extraction expression')).toBeInTheDocument()
  })

  it('calls onExpressionChange when expression is modified', async () => {
    const onExpressionChange = vi.fn()
    const user = userEvent.setup()
    render(<AdvancedSection {...defaultProps} onExpressionChange={onExpressionChange} />)

    await user.click(screen.getByText('Advanced'))
    const input = screen.getByLabelText('Group extraction expression')
    await user.type(input, 'x')

    expect(onExpressionChange).toHaveBeenCalled()
  })

  it('shows reset button when expression differs from default', async () => {
    const user = userEvent.setup()
    render(<AdvancedSection {...defaultProps} expression="custom[*]" defaultExpression="groups[*]" idpType="custom" />)

    await user.click(screen.getByText('Advanced'))
    expect(screen.getByRole('button', { name: /reset to default/i })).toBeInTheDocument()
  })

  it('does not show reset button when expression matches default', async () => {
    const user = userEvent.setup()
    render(<AdvancedSection {...defaultProps} expression="groups[*]" defaultExpression="groups[*]" />)

    await user.click(screen.getByText('Advanced'))
    expect(screen.queryByRole('button', { name: /reset to default/i })).not.toBeInTheDocument()
  })

  it('calls onExpressionChange with default when reset is clicked', async () => {
    const onExpressionChange = vi.fn()
    const user = userEvent.setup()
    render(
      <AdvancedSection
        {...defaultProps}
        expression="custom[*]"
        defaultExpression="groups[*]"
        onExpressionChange={onExpressionChange}
      />
    )

    await user.click(screen.getByText('Advanced'))
    await user.click(screen.getByRole('button', { name: /reset to default/i }))
    expect(onExpressionChange).toHaveBeenCalledWith('groups[*]')
  })

  it('shows raw claims when provided', async () => {
    const user = userEvent.setup()
    const rawClaims = JSON.stringify({ groups: ['admin'] }, null, 2)
    render(<AdvancedSection {...defaultProps} rawClaims={rawClaims} />)

    await user.click(screen.getByText('Advanced'))
    expect(screen.getByText('Raw token claims')).toBeInTheDocument()
    expect(screen.getByText(/Full token claims from the last group discovery/)).toBeInTheDocument()
  })

  it('does not show raw claims section when null', async () => {
    const user = userEvent.setup()
    render(<AdvancedSection {...defaultProps} rawClaims={null} />)

    await user.click(screen.getByText('Advanced'))
    expect(screen.queryByText('Raw token claims')).not.toBeInTheDocument()
  })
})

describe('MappingTable', () => {
  const defaultProps = {
    entries: mockEntries,
    nexusGroups: mockNexusGroups,
    onChange: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onCreateGroup: vi.fn(),
  }

  it('renders column headers', () => {
    render(<MappingTable {...defaultProps} />)

    expect(screen.getByText('IdP group value')).toBeInTheDocument()
    expect(screen.getByText('Automation Orchestrator group')).toBeInTheDocument()
  })

  it('renders mapping entries with input values', () => {
    render(<MappingTable {...defaultProps} />)

    expect(screen.getByRole('textbox', { name: 'IdP group value 1' })).toHaveValue('idp-admin')
    expect(screen.getByRole('textbox', { name: 'IdP group value 2' })).toHaveValue('idp-users')
  })

  it('renders Add mapping button when not read-only', () => {
    render(<MappingTable {...defaultProps} />)
    expect(screen.getByRole('button', { name: /add mapping/i })).toBeInTheDocument()
  })

  it('calls onAdd when Add mapping is clicked', async () => {
    const onAdd = vi.fn()
    const user = userEvent.setup()
    render(<MappingTable {...defaultProps} onAdd={onAdd} />)

    await user.click(screen.getByRole('button', { name: /add mapping/i }))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('renders remove buttons for each entry', () => {
    render(<MappingTable {...defaultProps} />)

    expect(screen.getByRole('button', { name: 'Remove mapping 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove mapping 2' })).toBeInTheDocument()
  })

  it('calls onRemove with index when remove button is clicked', async () => {
    const onRemove = vi.fn()
    const user = userEvent.setup()
    render(<MappingTable {...defaultProps} onRemove={onRemove} />)

    await user.click(screen.getByRole('button', { name: 'Remove mapping 1' }))
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it('calls onChange when IdP group value is modified', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MappingTable {...defaultProps} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: 'IdP group value 1' })
    await user.clear(input)
    await user.type(input, 'new-value')

    expect(onChange).toHaveBeenCalled()
  })

  it('hides remove buttons and Add mapping in read-only mode', () => {
    render(<MappingTable {...defaultProps} isReadOnly />)

    expect(screen.queryByRole('button', { name: 'Remove mapping 1' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add mapping/i })).not.toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<MappingTable {...defaultProps} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})

describe('ReadOnlyView', () => {
  it('renders entries in read-only mode', () => {
    render(<ReadOnlyView entries={mockEntries} nexusGroups={mockNexusGroups} />)

    expect(screen.getByRole('textbox', { name: 'IdP group value 1' })).toBeDisabled()
  })

  it('renders filter input', () => {
    render(<ReadOnlyView entries={mockEntries} nexusGroups={mockNexusGroups} />)

    expect(screen.getByRole('textbox', { name: /filter group mappings/i })).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = render(<ReadOnlyView entries={mockEntries} nexusGroups={mockNexusGroups} />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
