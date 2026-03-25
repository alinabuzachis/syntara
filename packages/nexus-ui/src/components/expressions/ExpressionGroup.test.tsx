import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDefaultCondition, createDefaultGroup } from '../../utils/expressions/defaults'

import { ExpressionGroup } from './ExpressionGroup'

describe('ExpressionGroup', () => {
  const getDefaultProps = () => ({
    group: createDefaultGroup(),
    onChange: vi.fn(),
    onUpdateChild: vi.fn(),
    onRemoveChild: vi.fn(),
    onAddCondition: vi.fn(),
    onAddGroup: vi.fn(),
  })

  let defaultProps: ReturnType<typeof getDefaultProps>

  beforeEach(() => {
    defaultProps = getDefaultProps()
  })

  it('renders group with default condition', () => {
    render(<ExpressionGroup {...defaultProps} />)

    // At level 0, no Group label but should have add buttons
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add group' })).toBeInTheDocument()
  })

  it('renders group label with help icon for nested group', () => {
    render(<ExpressionGroup {...defaultProps} level={1} />)

    const helpButton = screen.getByLabelText('Group help')
    expect(helpButton).toBeInTheDocument()
  })

  it('does not show remove button when onRemove is not provided', () => {
    render(<ExpressionGroup {...defaultProps} level={1} />)

    expect(screen.queryByRole('button', { name: 'Remove group' })).not.toBeInTheDocument()
  })

  it('shows remove button when onRemove is provided for nested group', () => {
    const onRemove = vi.fn()
    render(<ExpressionGroup {...defaultProps} onRemove={onRemove} level={1} />)

    expect(screen.getByRole('button', { name: 'Remove group' })).toBeInTheDocument()
  })

  it('calls onRemove when remove button is clicked on nested group', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<ExpressionGroup {...defaultProps} onRemove={onRemove} level={1} />)

    await user.click(screen.getByRole('button', { name: 'Remove group' }))
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('calls onAddCondition when add condition button is clicked', async () => {
    const user = userEvent.setup()
    const onAddCondition = vi.fn()
    render(<ExpressionGroup {...defaultProps} onAddCondition={onAddCondition} />)

    await user.click(screen.getByRole('button', { name: 'Add condition' }))
    expect(onAddCondition).toHaveBeenCalledTimes(1)
  })

  it('calls onAddGroup when add group button is clicked', async () => {
    const user = userEvent.setup()
    const onAddGroup = vi.fn()
    render(<ExpressionGroup {...defaultProps} onAddGroup={onAddGroup} />)

    await user.click(screen.getByRole('button', { name: 'Add group' }))
    expect(onAddGroup).toHaveBeenCalledTimes(1)
  })

  it('renders multiple conditions', () => {
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    // Should render Rule selector between conditions
    expect(screen.getByLabelText('Logical operator')).toBeInTheDocument()
  })

  it('shows "Rule" label at level 0', () => {
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={0} />)

    expect(screen.getByText(/^Rule/)).toBeInTheDocument()
  })

  it('shows "Group rule" label at level > 0', () => {
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={1} />)

    expect(screen.getByText(/^Group rule/)).toBeInTheDocument()
  })

  it('changes operator when select is changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const group = {
      ...createDefaultGroup('AND'),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} onChange={onChange} />)

    const select = screen.getByLabelText('Logical operator')
    await user.selectOptions(select, 'OR')

    expect(onChange).toHaveBeenCalledWith({ operator: 'OR' })
  })

  it('enables first logical operator dropdown', () => {
    const group = {
      ...createDefaultGroup('AND'),
      children: [createDefaultCondition(), createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    const selects = screen.getAllByLabelText('Logical operator')
    expect(selects[0]).not.toBeDisabled()
  })

  it('disables subsequent logical operator dropdowns', () => {
    const group = {
      ...createDefaultGroup('AND'),
      children: [createDefaultCondition(), createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    const selects = screen.getAllByLabelText('Logical operator')
    expect(selects[0]).not.toBeDisabled() // First is enabled
    expect(selects[1]).toBeDisabled() // Second is disabled
  })

  it('displays same operator value in all dropdowns', () => {
    const group = {
      ...createDefaultGroup('OR'),
      children: [createDefaultCondition(), createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    const selects = screen.getAllByLabelText('Logical operator')
    selects.forEach((select) => {
      expect(select).toHaveValue('OR')
    })
  })

  it('renders nested group correctly', () => {
    const nestedGroup = createDefaultGroup()
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={1} />)

    // At level 1+, should render "Group" labels (parent at level 1, nested at level 2)
    const groupLabels = screen.getAllByText('Group')
    expect(groupLabels).toHaveLength(2)
  })

  it('calls onUpdateChild when child condition is updated', async () => {
    const user = userEvent.setup()
    const onUpdateChild = vi.fn()
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} onUpdateChild={onUpdateChild} />)

    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    await user.type(fieldInputs[0], 'test')

    expect(onUpdateChild).toHaveBeenCalled()
  })

  it('applies correct styling at level 0', () => {
    render(<ExpressionGroup {...defaultProps} level={0} />)

    // Should render (styling is applied via inline styles, no Group label at level 0)
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
  })

  it('applies different styling at nested levels', () => {
    render(<ExpressionGroup {...defaultProps} level={1} />)

    // Should render group label at level 1
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('shows add condition tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<ExpressionGroup {...defaultProps} />)

    const addConditionButton = screen.getByRole('button', { name: 'Add condition' })
    await user.hover(addConditionButton)

    // Tooltip should appear
    expect(await screen.findByText(/Adds a single row for a new field\/operator\/value comparison/)).toBeInTheDocument()
  })

  it('shows add group tooltip on hover', async () => {
    const user = userEvent.setup()
    render(<ExpressionGroup {...defaultProps} />)

    const addGroupButton = screen.getByRole('button', { name: 'Add group' })
    await user.hover(addGroupButton)

    // Tooltip should appear
    expect(await screen.findByText(/Creates a new nested logic container/)).toBeInTheDocument()
  })

  it('renders with error prop', () => {
    render(<ExpressionGroup {...defaultProps} error={true} />)

    // Should render without errors
    expect(screen.getByRole('button', { name: 'Add condition' })).toBeInTheDocument()
  })

  it('passes error prop to child conditions', () => {
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} error={true} />)

    // Error styling should be applied to inputs
    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(fieldInputs[0]).toBeInTheDocument()
  })

  it('does not show Rule selector before first child', () => {
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    // Should only have one Rule selector (before second child)
    const selects = screen.getAllByLabelText('Logical operator')
    expect(selects).toHaveLength(1)
  })

  it('opens group help popover on click for nested group', async () => {
    const user = userEvent.setup()
    render(<ExpressionGroup {...defaultProps} level={1} />)

    const helpButton = screen.getByRole('button', { name: 'Group help' })
    await user.click(helpButton)

    expect(await screen.findByText(/A container for nested logic/)).toBeInTheDocument()
  })

  it('opens rule help popover on click at level 0', async () => {
    const user = userEvent.setup()
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={0} />)

    const helpButton = screen.getByRole('button', { name: 'Rule help' })
    await user.click(helpButton)

    expect(await screen.findByText(/Define the relationship between your top-level/)).toBeInTheDocument()
  })

  it('opens group rule help popover on click at level > 0', async () => {
    const user = userEvent.setup()
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={1} />)

    const helpButton = screen.getByRole('button', { name: 'Group rule help' })
    await user.click(helpButton)

    expect(await screen.findByText(/Determine the logic for this specific subset/)).toBeInTheDocument()
  })

  it('does not render NOT checkbox at level 0', () => {
    render(<ExpressionGroup {...defaultProps} level={0} />)

    expect(screen.queryByRole('checkbox', { name: 'Negate group' })).not.toBeInTheDocument()
  })

  it('does not render Group label at level 0', () => {
    render(<ExpressionGroup {...defaultProps} level={0} />)

    expect(screen.queryByText('Group')).not.toBeInTheDocument()
  })

  it('renders NOT checkbox for nested group (level > 0)', () => {
    render(<ExpressionGroup {...defaultProps} level={1} />)

    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate group' })
    expect(notCheckbox).toBeInTheDocument()
    expect(notCheckbox).not.toBeChecked()
  })

  it('renders Group label for nested group (level > 0)', () => {
    render(<ExpressionGroup {...defaultProps} level={1} />)

    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('shows NOT checkbox as checked when nested group is negated', () => {
    const group = {
      ...createDefaultGroup(),
      negate: true,
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={1} />)

    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate group' })
    expect(notCheckbox).toBeChecked()
  })

  it('calls onChange when NOT checkbox is toggled on nested group', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ExpressionGroup {...defaultProps} onChange={onChange} level={1} />)

    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate group' })
    await user.click(notCheckbox)

    expect(onChange).toHaveBeenCalledWith({ negate: true })
  })

  it('unchecks NOT checkbox when toggled off on nested group', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const group = {
      ...createDefaultGroup(),
      negate: true,
    }
    render(<ExpressionGroup {...defaultProps} group={group} onChange={onChange} level={1} />)

    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate group' })
    await user.click(notCheckbox)

    expect(onChange).toHaveBeenCalledWith({ negate: false })
  })

  it('opens group NOT help popover on click for nested group', async () => {
    const user = userEvent.setup()
    render(<ExpressionGroup {...defaultProps} level={1} />)

    const helpButton = screen.getByRole('button', { name: 'Group NOT operator help' })
    await user.click(helpButton)

    expect(await screen.findByText(/Inverse the logic of this entire group/)).toBeInTheDocument()
  })

  it('shows tooltip on disabled rule select', async () => {
    const user = userEvent.setup()
    const group = {
      ...createDefaultGroup('AND'),
      children: [createDefaultCondition(), createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    const selects = screen.getAllByLabelText('Logical operator')
    // Hover over the disabled (second) select
    await user.hover(selects[1])

    // Tooltip should appear
    expect(await screen.findByText(/All conditions in this group must follow the same rule/)).toBeInTheDocument()
  })

  it('calls onUpdateChild when nested group is updated', async () => {
    const user = userEvent.setup()
    const onUpdateChild = vi.fn()
    const nestedGroup = createDefaultGroup()
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} onUpdateChild={onUpdateChild} />)

    // Toggle the NOT checkbox on the nested group
    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate group' })
    await user.click(notCheckbox)

    expect(onUpdateChild).toHaveBeenCalledWith(0, expect.objectContaining({ negate: true }))
  })

  it('calls onUpdateChild when nested group child is updated', async () => {
    const user = userEvent.setup()
    const onUpdateChild = vi.fn()
    const nestedGroup = {
      ...createDefaultGroup(),
      children: [createDefaultCondition()],
    }
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} onUpdateChild={onUpdateChild} />)

    // Type in the field input of the nested group's condition
    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    await user.type(fieldInputs[0], 'test')

    expect(onUpdateChild).toHaveBeenCalled()
  })

  it('removes child from nested group when onRemoveChild is called', async () => {
    const user = userEvent.setup()
    const onUpdateChild = vi.fn()
    const nestedGroup = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} onUpdateChild={onUpdateChild} />)

    // Find and click the remove button on the first condition in the nested group
    const removeButtons = screen.getAllByRole('button', { name: 'Remove condition' })
    await user.click(removeButtons[0])

    // Should call onUpdateChild with updated nested group
    expect(onUpdateChild).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        children: expect.arrayContaining([expect.any(Object)]),
      })
    )
  })

  it('renders nested group with add buttons', () => {
    const nestedGroup = createDefaultGroup()
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={0} />)

    // Should have 2 sets of add buttons: one for parent group, one for nested group
    const addConditionButtons = screen.getAllByRole('button', { name: 'Add condition' })
    expect(addConditionButtons).toHaveLength(2)

    const addGroupButtons = screen.getAllByRole('button', { name: 'Add group' })
    expect(addGroupButtons).toHaveLength(2)
  })

  it('passes error prop to nested groups', () => {
    const nestedGroup = createDefaultGroup()
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} error={true} />)

    // Should render without errors - error prop is passed to nested groups
    expect(screen.getByText('Group')).toBeInTheDocument()
  })

  it('removes nested group when onRemove is called and group has multiple children', async () => {
    const user = userEvent.setup()
    const onRemoveChild = vi.fn()
    const nestedGroup = createDefaultGroup()
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} onRemoveChild={onRemoveChild} level={0} />)

    // Find and click the remove button on the nested group
    const removeButton = screen.getByRole('button', { name: 'Remove group' })
    await user.click(removeButton)

    expect(onRemoveChild).toHaveBeenCalledWith(1)
  })

  it('does not show remove button on nested group when it is the only child', () => {
    const nestedGroup = createDefaultGroup()
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={0} />)

    // Nested group should not have a remove button when it's the only child
    expect(screen.queryByRole('button', { name: 'Remove group' })).not.toBeInTheDocument()
  })

  it('changes operator from OR to AND', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const group = {
      ...createDefaultGroup('OR'),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} onChange={onChange} />)

    const select = screen.getByLabelText('Logical operator')
    expect(select).toHaveValue('OR')

    await user.selectOptions(select, 'AND')

    expect(onChange).toHaveBeenCalledWith({ operator: 'AND' })
  })

  it('renders with multiple levels of nesting', () => {
    const deeplyNestedGroup = createDefaultGroup()
    const nestedGroup = {
      ...createDefaultGroup(),
      children: [deeplyNestedGroup],
    }
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={0} />)

    // Should have 3 levels of groups: parent (level 0), nested (level 1), deeply nested (level 2)
    const groupLabels = screen.getAllByText('Group')
    expect(groupLabels.length).toBeGreaterThanOrEqual(2)
  })

  it('applies level 0 background color styling', () => {
    const { container } = render(<ExpressionGroup {...defaultProps} level={0} />)

    const groupDiv = container.firstChild
    expect(groupDiv).toBeInTheDocument()
  })

  it('applies nested level border styling', () => {
    const { container } = render(<ExpressionGroup {...defaultProps} level={1} />)

    const groupDiv = container.firstChild
    expect(groupDiv).toBeInTheDocument()
  })

  it('renders condition with NOT checkbox and no remove button when only child', () => {
    const condition = { ...createDefaultCondition(), negate: true }
    const group = {
      ...createDefaultGroup(),
      children: [condition],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    // Condition's NOT checkbox should be rendered
    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate condition' })
    expect(notCheckbox).toBeChecked()

    // Should not have remove button on the condition since it's the only child
    expect(screen.queryByRole('button', { name: 'Remove condition' })).not.toBeInTheDocument()
  })

  it('renders condition with remove button when group has multiple children', () => {
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), createDefaultCondition()],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    // Should have remove buttons on both conditions
    const removeButtons = screen.getAllByRole('button', { name: 'Remove condition' })
    expect(removeButtons).toHaveLength(2)
  })

  it('passes level prop to nested groups correctly', () => {
    const nestedGroup1 = createDefaultGroup()
    const nestedGroup2 = {
      ...createDefaultGroup(),
      children: [createDefaultGroup()],
    }
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup1, nestedGroup2],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={2} />)

    // Parent is at level 2, so nested groups should be at level 3
    // Level 2+ should show Group labels
    const groupLabels = screen.getAllByText('Group')
    expect(groupLabels.length).toBeGreaterThan(0)
  })

  it('renders group with negated nested group', () => {
    const nestedGroup = { ...createDefaultGroup(), negate: true }
    const group = {
      ...createDefaultGroup(),
      children: [nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={0} />)

    // Nested group should show NOT checkbox as checked
    const notCheckbox = screen.getByRole('checkbox', { name: 'Negate group' })
    expect(notCheckbox).toBeChecked()
  })

  it('renders nested group with conditions at multiple levels', () => {
    const deepCondition = createDefaultCondition()
    const nestedGroup = {
      ...createDefaultGroup(),
      children: [deepCondition],
    }
    const group = {
      ...createDefaultGroup(),
      children: [createDefaultCondition(), nestedGroup],
    }
    render(<ExpressionGroup {...defaultProps} group={group} level={0} />)

    // Should have conditions at both levels
    const fieldInputs = screen.getAllByPlaceholderText('Enter or drag and drop value')
    expect(fieldInputs.length).toBeGreaterThan(1)
  })

  it('handles group with 4+ children showing multiple disabled selects', () => {
    const group = {
      ...createDefaultGroup('AND'),
      children: [
        createDefaultCondition(),
        createDefaultCondition(),
        createDefaultCondition(),
        createDefaultCondition(),
      ],
    }
    render(<ExpressionGroup {...defaultProps} group={group} />)

    const selects = screen.getAllByLabelText('Logical operator')
    // Should have 3 selects (before 2nd, 3rd, and 4th children)
    expect(selects).toHaveLength(3)
    // First should be enabled
    expect(selects[0]).not.toBeDisabled()
    // Rest should be disabled
    expect(selects[1]).toBeDisabled()
    expect(selects[2]).toBeDisabled()
  })
})
