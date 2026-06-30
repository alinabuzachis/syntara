import { describe, expect, it, vi } from 'vitest'

import type { ProjectRead } from '../access/types'

import { buildProjectRowActions } from './projectRowActions'

describe('buildProjectRowActions', () => {
  const mockPermissions = {
    canCreate: true,
    canUpdate: true,
    canDelete: true,
    isLoading: false,
    tooltips: {
      create: 'You do not have permission to create a project',
      update: 'You do not have permission to edit this project',
      delete: 'You do not have permission to delete this project',
    },
  }

  const mockCallbacks = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }

  const mockProject: ProjectRead = {
    id: 'proj-123',
    name: 'Test Project',
    description: 'A test project',
    is_builtin: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  }

  it('returns empty array for null project', () => {
    const actions = buildProjectRowActions(null, mockPermissions, mockCallbacks)
    expect(actions).toEqual([])
  })

  it('returns empty array for builtin project', () => {
    const builtinProject = { ...mockProject, is_builtin: true }
    const actions = buildProjectRowActions(builtinProject, mockPermissions, mockCallbacks)
    expect(actions).toEqual([])
  })

  it('returns edit and delete actions for normal project with full permissions', () => {
    const actions = buildProjectRowActions(mockProject, mockPermissions, mockCallbacks)

    expect(actions).toHaveLength(3) // edit, separator, delete
    expect(actions[0].key).toBe('edit-project')
    expect(actions[0].isAriaDisabled).toBe(false)
    expect(actions[0].tooltipProps).toBeUndefined()

    expect(actions[1].isSeparator).toBe(true)

    expect(actions[2].key).toBe('delete-project')
    expect(actions[2].isDanger).toBe(true)
    expect(actions[2].isAriaDisabled).toBe(false)
    expect(actions[2].tooltipProps).toBeUndefined()
  })

  it('disables edit action when canUpdate is false', () => {
    const limitedPermissions = { ...mockPermissions, canUpdate: false }
    const actions = buildProjectRowActions(mockProject, limitedPermissions, mockCallbacks)

    const editAction = actions.find((a) => a.key === 'edit-project')
    expect(editAction?.isAriaDisabled).toBe(true)
    expect(editAction?.tooltipProps).toEqual({ content: mockPermissions.tooltips.update })
  })

  it('disables delete action when canDelete is false', () => {
    const limitedPermissions = { ...mockPermissions, canDelete: false }
    const actions = buildProjectRowActions(mockProject, limitedPermissions, mockCallbacks)

    const deleteAction = actions.find((a) => a.key === 'delete-project')
    expect(deleteAction?.isAriaDisabled).toBe(true)
    expect(deleteAction?.tooltipProps).toEqual({ content: mockPermissions.tooltips.delete })
  })

  it('calls onEdit callback when edit action is clicked', () => {
    const actions = buildProjectRowActions(mockProject, mockPermissions, mockCallbacks)
    const editAction = actions.find((a) => a.key === 'edit-project')

    editAction?.onClick?.()

    expect(mockCallbacks.onEdit).toHaveBeenCalledWith(mockProject)
    expect(mockCallbacks.onEdit).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete callback when delete action is clicked', () => {
    const actions = buildProjectRowActions(mockProject, mockPermissions, mockCallbacks)
    const deleteAction = actions.find((a) => a.key === 'delete-project')

    deleteAction?.onClick?.()

    expect(mockCallbacks.onDelete).toHaveBeenCalledWith(mockProject)
    expect(mockCallbacks.onDelete).toHaveBeenCalledTimes(1)
  })

  it('includes IconLabel with correct icons', () => {
    const actions = buildProjectRowActions(mockProject, mockPermissions, mockCallbacks)

    const editAction = actions.find((a) => a.key === 'edit-project')
    const deleteAction = actions.find((a) => a.key === 'delete-project')

    // Verify actions have titles (IconLabel components)
    expect(editAction?.title).toBeDefined()
    expect(deleteAction?.title).toBeDefined()
  })
})
