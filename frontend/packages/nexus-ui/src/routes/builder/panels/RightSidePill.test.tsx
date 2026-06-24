import { EdgeHandleEnum } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { axe } from 'vitest-axe'

import { FlowNodeType } from '../../../constants/nodeTypes'

import { RightSidePill } from './RightSidePill'

describe('RightSidePill', () => {
  describe('when onAddStep is not provided', () => {
    it('renders nothing', () => {
      const { container } = render(<RightSidePill nodeFlowType={FlowNodeType.TASK} />)
      expect(container).toBeEmptyDOMElement()
    })
  })

  describe('non-branching nodes', () => {
    it('renders a plain button for task node', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.TASK} onAddStep={onAddStep} />)

      const button = screen.getByRole('button', { name: 'Add step' })
      expect(button).toBeInTheDocument()

      await user.click(button)
      expect(onAddStep).toHaveBeenCalledWith()
      expect(onAddStep).toHaveBeenCalledTimes(1)
    })

    it('renders a plain button when nodeFlowType is undefined', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill onAddStep={onAddStep} />)

      const button = screen.getByRole('button', { name: 'Add step' })
      expect(button).toBeInTheDocument()

      await user.click(button)
      expect(onAddStep).toHaveBeenCalledWith()
    })

    it('renders a plain button for unrecognized node types', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType="unknown-node-type" onAddStep={onAddStep} />)

      const button = screen.getByRole('button', { name: 'Add step' })
      expect(button).toBeInTheDocument()

      await user.click(button)
      expect(onAddStep).toHaveBeenCalledWith()
    })
  })

  describe('branching nodes - condition', () => {
    it('renders dropdown with true/false options for condition node', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      expect(toggle).toBeInTheDocument()

      await user.click(toggle)

      expect(screen.getByText('On True')).toBeInTheDocument()
      expect(screen.getByText('On False')).toBeInTheDocument()
    })

    it('calls onAddStep with "true" handle when "On True" is selected', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      const onTrueOption = screen.getByText('On True')
      await user.click(onTrueOption)

      expect(onAddStep).toHaveBeenCalledWith(EdgeHandleEnum.TRUE)
      expect(onAddStep).toHaveBeenCalledTimes(1)
    })

    it('calls onAddStep with "false" handle when "On False" is selected', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      const onFalseOption = screen.getByText('On False')
      await user.click(onFalseOption)

      expect(onAddStep).toHaveBeenCalledWith(EdgeHandleEnum.FALSE)
      expect(onAddStep).toHaveBeenCalledTimes(1)
    })

    it('closes dropdown after selecting an option', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      expect(screen.getByText('On True')).toBeVisible()

      const onTrueOption = screen.getByText('On True')
      await user.click(onTrueOption)

      // The dropdown should close - wait for the menu to be removed from the document
      await vi.waitFor(() => {
        expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      })
    })
  })

  describe('branching nodes - approval', () => {
    it('renders dropdown with approved/rejected options for approval node', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.APPROVAL} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      expect(screen.getByText('On Approved')).toBeInTheDocument()
      expect(screen.getByText('On Rejected')).toBeInTheDocument()
    })

    it('calls onAddStep with "approved" handle when selected', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.APPROVAL} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      const approvedOption = screen.getByText('On Approved')
      await user.click(approvedOption)

      expect(onAddStep).toHaveBeenCalledWith(EdgeHandleEnum.APPROVED)
    })

    it('calls onAddStep with "rejected" handle when selected', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.APPROVAL} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      const rejectedOption = screen.getByText('On Rejected')
      await user.click(rejectedOption)

      expect(onAddStep).toHaveBeenCalledWith(EdgeHandleEnum.REJECTED)
    })
  })

  describe('branching nodes - loop', () => {
    it('renders dropdown with loop/done options for loop node', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.LOOP} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      expect(screen.getByText('In loop')).toBeInTheDocument()
      expect(screen.getByText('On done')).toBeInTheDocument()
    })

    it('calls onAddStep with "loop" handle when "In loop" is selected', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.LOOP} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      const loopOption = screen.getByText('In loop')
      await user.click(loopOption)

      expect(onAddStep).toHaveBeenCalledWith(EdgeHandleEnum.LOOP)
    })

    it('calls onAddStep with "done" handle when "On done" is selected', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.LOOP} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.click(toggle)

      const doneOption = screen.getByText('On done')
      await user.click(doneOption)

      expect(onAddStep).toHaveBeenCalledWith(EdgeHandleEnum.DONE)
    })
  })

  describe('accessibility', () => {
    it('has no accessibility violations for non-branching node', async () => {
      const onAddStep = vi.fn()

      const { container } = render(<RightSidePill nodeFlowType={FlowNodeType.TASK} onAddStep={onAddStep} />)

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations for branching node', async () => {
      const onAddStep = vi.fn()

      const { container } = render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has no accessibility violations for branching node when dropdown is open', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      const { container } = render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      await user.click(screen.getByRole('button', { name: 'Add step…' }))

      expect(await axe(container)).toHaveNoViolations()
    })

    it('has accessible label on non-branching button', () => {
      const onAddStep = vi.fn()

      render(<RightSidePill nodeFlowType={FlowNodeType.TASK} onAddStep={onAddStep} />)

      const button = screen.getByRole('button', { name: 'Add step' })
      expect(button).toHaveAccessibleName('Add step')
    })

    it('has accessible label on branching dropdown toggle', () => {
      const onAddStep = vi.fn()

      render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      expect(toggle).toHaveAccessibleName('Add step…')
    })

    it('shows tooltip on non-branching button', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.TASK} onAddStep={onAddStep} />)

      const button = screen.getByRole('button', { name: 'Add step' })
      await user.hover(button)

      expect(await screen.findByText('Add step')).toBeInTheDocument()
    })

    it('shows tooltip on branching dropdown toggle', async () => {
      const onAddStep = vi.fn()
      const user = userEvent.setup()

      render(<RightSidePill nodeFlowType={FlowNodeType.CONDITION} onAddStep={onAddStep} />)

      const toggle = screen.getByRole('button', { name: 'Add step…' })
      await user.hover(toggle)

      expect(await screen.findByText('Add step…')).toBeInTheDocument()
    })
  })
})
