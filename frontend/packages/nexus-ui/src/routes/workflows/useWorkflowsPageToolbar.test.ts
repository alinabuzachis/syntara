import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { useDialogState } from '../../hooks/useDialogState'
import type { ProjectRead } from '../access/types'
import type { useProjectPermissions } from '../access-management/useProjectPermissions'

import { useWorkflowsPageToolbar } from './useWorkflowsPageToolbar'

vi.mock('./projectRowActions', () => ({
  buildProjectRowActions: vi.fn(() => []),
}))

const mockDialog = {
  isOpen: false,
  item: undefined,
  open: vi.fn(),
  close: vi.fn(),
} as unknown as ReturnType<typeof useDialogState<ProjectRead>>

const mockProjectPermissions = {
  canUpdate: true,
  canDelete: true,
  isChecking: false,
  tooltips: { update: '', delete: '' },
} as unknown as ReturnType<typeof useProjectPermissions>

const baseOptions = {
  selectedProjectId: 'proj-1' as string | null,
  projects: [{ id: 'proj-1', name: 'Test Project', is_builtin: false }] as ProjectRead[],
  projectEditDialog: mockDialog,
  projectDeleteDialog: mockDialog,
  projectPermissions: mockProjectPermissions,
}

describe('useWorkflowsPageToolbar', () => {
  describe('showImportWorkflow', () => {
    it('is true when a project is selected with no workflows', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: false,
          sortedWorkflowsLength: 0,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showImportWorkflow).toBe(true)
    })

    it('is false when viewing all projects with no workflows and no filters', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: true,
          sortedWorkflowsLength: 0,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showImportWorkflow).toBe(false)
    })

    it('is true when viewing all projects with workflows present', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: true,
          sortedWorkflowsLength: 3,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showImportWorkflow).toBe(true)
    })

    it('is true when viewing all projects with active filters', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: true,
          sortedWorkflowsLength: 0,
          hasActiveFilters: true,
        })
      )
      expect(result.current.showImportWorkflow).toBe(true)
    })
  })

  describe('showWorkflowActions', () => {
    it('is false with no workflows and no active filters', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: false,
          sortedWorkflowsLength: 0,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showWorkflowActions).toBe(false)
    })

    it('is true when workflows exist', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: false,
          sortedWorkflowsLength: 1,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showWorkflowActions).toBe(true)
    })

    it('is true when active filters are set even with no workflows', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: false,
          sortedWorkflowsLength: 0,
          hasActiveFilters: true,
        })
      )
      expect(result.current.showWorkflowActions).toBe(true)
    })
  })

  describe('showToolbar', () => {
    it('is true when project selected with no workflows (Import button shows)', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: false,
          sortedWorkflowsLength: 0,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showToolbar).toBe(true)
    })

    it('is false when viewing all projects with no workflows and no filters', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: true,
          selectedProjectId: null,
          sortedWorkflowsLength: 0,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showToolbar).toBe(false)
    })

    it('is true when viewing all projects with workflows', () => {
      const { result } = renderHook(() =>
        useWorkflowsPageToolbar({
          ...baseOptions,
          isAllProjects: true,
          sortedWorkflowsLength: 2,
          hasActiveFilters: false,
        })
      )
      expect(result.current.showToolbar).toBe(true)
    })
  })
})
