import type { TaskActivity } from '@ansible/nexus-contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApprovalNodeComponent } from './ApprovalNode'

// Mock @xyflow/react
vi.mock('@xyflow/react', () => ({
  useReactFlow: () => ({
    deleteElements: vi.fn(),
    updateNode: vi.fn(),
    getNode: vi.fn(),
  }),
  Handle: () => null,
  Position: {
    Top: 'top',
    Bottom: 'bottom',
    Left: 'left',
    Right: 'right',
  },
}))

describe('ApprovalNodeComponent', () => {
  const baseApprovalNode: TaskActivity = {
    type: 'task',
    id: 'approval-1',
    name: 'Approve Deployment',
    task: {
      executor: 'script' as const,
      config: {
        language: 'python' as const,
        code: '',
      },
    },
    approval: {
      approvers: ['admin', 'manager'],
      prompt: 'Please review and approve this deployment',
    },
  }

  const createNodeProps = (data: TaskActivity) => ({
    id: data.id,
    data,
    type: 'approval' as const,
    position: { x: 0, y: 0 },
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selected: false,
    dragging: false,
    isConnectable: true,
    zIndex: 0,
    selectable: true,
    deletable: true,
    draggable: true,
  })

  describe('Rendering', () => {
    it('renders approval node with all key elements', () => {
      render(<ApprovalNodeComponent {...createNodeProps(baseApprovalNode)} />)

      expect(screen.getByText('Approval')).toBeInTheDocument()
      expect(screen.getByText('Usernames to notify')).toBeInTheDocument()
      expect(screen.getByText('admin, manager')).toBeInTheDocument()
      expect(screen.getByText('Approved')).toBeInTheDocument()
      expect(screen.getByText('Rejected')).toBeInTheDocument()
    })
  })

  describe('Approvers Display', () => {
    it('renders single approver', () => {
      const singleApproverNode = {
        ...baseApprovalNode,
        approval: {
          approvers: ['admin'],
          prompt: 'Approve',
        },
      }

      render(<ApprovalNodeComponent {...createNodeProps(singleApproverNode)} />)

      expect(screen.getByText('admin')).toBeInTheDocument()
    })

    it('renders multiple approvers comma-separated', () => {
      const multipleApproversNode = {
        ...baseApprovalNode,
        approval: {
          approvers: ['user1', 'user2', 'user3'],
          prompt: 'Approve',
        },
      }

      render(<ApprovalNodeComponent {...createNodeProps(multipleApproversNode)} />)

      expect(screen.getByText('user1, user2, user3')).toBeInTheDocument()
    })

    it('renders approvers with special characters', () => {
      const specialCharsNode = {
        ...baseApprovalNode,
        approval: {
          approvers: ['user.name@example.com', 'admin_user'],
          prompt: 'Approve',
        },
      }

      render(<ApprovalNodeComponent {...createNodeProps(specialCharsNode)} />)

      expect(screen.getByText('user.name@example.com, admin_user')).toBeInTheDocument()
    })
  })

  describe('Approval Data', () => {
    it('does not render approvers section when approval data is missing', () => {
      const noApprovalDataNode: TaskActivity = {
        type: 'task',
        id: 'approval-2',
        name: 'Incomplete Approval',
        task: {
          executor: 'script' as const,
          config: {
            language: 'python' as const,
            code: '',
          },
        },
      }

      render(<ApprovalNodeComponent {...createNodeProps(noApprovalDataNode)} />)

      expect(screen.queryByText('Usernames to notify')).not.toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('renders with many approvers', () => {
      const manyApproversNode = {
        ...baseApprovalNode,
        approval: {
          approvers: Array.from({ length: 10 }, (_, i) => `user${i + 1}`),
          prompt: 'Approve',
        },
      }

      render(<ApprovalNodeComponent {...createNodeProps(manyApproversNode)} />)

      expect(screen.getByText(/user1, user2, user3, user4, user5/)).toBeInTheDocument()
    })
  })

  describe('Branch Handles', () => {
    it('renders handles in correct order (approved first, then rejected)', () => {
      render(<ApprovalNodeComponent {...createNodeProps(baseApprovalNode)} />)

      const handles = screen.getAllByText(/Approved|Rejected/)
      expect(handles[0]).toHaveTextContent('Approved')
      expect(handles[1]).toHaveTextContent('Rejected')
    })
  })

  describe('Node Structure', () => {
    it('renders with correct structure', () => {
      const { container } = render(<ApprovalNodeComponent {...createNodeProps(baseApprovalNode)} />)

      expect(container.querySelector('.details')).toBeInTheDocument()

      expect(container.querySelector('.pf-v6-c-compass__panel')).toBeInTheDocument()
    })
  })

  describe('Data Variations', () => {
    it('renders approval with all optional fields', () => {
      const fullNode: TaskActivity = {
        type: 'task',
        id: 'full-approval',
        name: 'Full Approval',
        task: {
          executor: 'script' as const,
          config: {
            language: 'python' as const,
            code: '',
          },
          inputs: { environment: 'production' },
          outputs: { approved: 'true' },
        },
        approval: {
          approvers: ['admin', 'manager', 'team-lead'],
          prompt: 'Please review and approve this production deployment',
          timeout: 86400,
          onTimeout: 'reject',
        },
      }

      render(<ApprovalNodeComponent {...createNodeProps(fullNode)} />)

      expect(screen.getByText('admin, manager, team-lead')).toBeInTheDocument()
    })
  })
})
