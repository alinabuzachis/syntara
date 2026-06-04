import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../hooks/useCanI', () => ({
  useCanI: vi.fn(() => ({
    allowed: true,
    isChecking: false,
  })),
}))

import { permissionTooltip } from '../../hooks/permissionUtils'
import { useCanI } from '../../hooks/useCanI'

import { useBuilderPermissions } from './useBuilderPermissions'

const mockedUseCanI = vi.mocked(useCanI)

describe('useBuilderPermissions', () => {
  it('returns canCreate for canEdit when isNew is true', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: action === 'create',
      isChecking: false,
    }))

    const { result } = renderHook(() => useBuilderPermissions(true))

    expect(result.current.canEdit).toBe(true)
  })

  it('returns canUpdate for canEdit when isNew is false', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: action === 'update',
      isChecking: false,
    }))

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.canEdit).toBe(true)
  })

  it('returns false canEdit when create is denied for new workflows', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: action !== 'create',
      isChecking: false,
    }))

    const { result } = renderHook(() => useBuilderPermissions(true))

    expect(result.current.canEdit).toBe(false)
  })

  it('returns false canEdit when update is denied for existing workflows', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: action !== 'update',
      isChecking: false,
    }))

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.canEdit).toBe(false)
  })

  it('reports isLoading when any permission is still checking', async () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: false,
      isChecking: action === 'run',
    }))

    const { result } = renderHook(() => useBuilderPermissions(false))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
    })
  })

  it('defaults canEdit, canRun, canDelete to false (safe-false) while loading', () => {
    mockedUseCanI.mockReturnValue({ allowed: false, isChecking: true })

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.canEdit).toBe(false)
    expect(result.current.canRun).toBe(false)
    expect(result.current.canDelete).toBe(false)
  })

  it('reports isLoading when only create permission is checking', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: true,
      isChecking: action === 'create',
    }))

    const { result } = renderHook(() => useBuilderPermissions(true))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.canEdit).toBe(true)
  })

  it('reports isLoading when only update permission is checking', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: true,
      isChecking: action === 'update',
    }))

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.canEdit).toBe(true)
  })

  it('reports isLoading when only delete permission is checking', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: false,
      isChecking: action === 'delete',
    }))

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.canDelete).toBe(false)
  })

  it('reports not loading when all permissions are resolved', () => {
    mockedUseCanI.mockReturnValue({ allowed: true, isChecking: false })

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.isLoading).toBe(false)
  })

  it('returns false canRun when execution:run is denied', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: action !== 'run',
      isChecking: false,
    }))

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.canRun).toBe(false)
    expect(result.current.canEdit).toBe(true)
  })

  it('returns false canDelete when workflow:delete is denied', () => {
    mockedUseCanI.mockImplementation((action) => ({
      allowed: action !== 'delete',
      isChecking: false,
    }))

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.canDelete).toBe(false)
    expect(result.current.canEdit).toBe(true)
  })

  it('generates correct tooltip for new workflow', () => {
    mockedUseCanI.mockReturnValue({ allowed: true, isChecking: false })

    const { result } = renderHook(() => useBuilderPermissions(true))

    expect(result.current.tooltips.edit).toBe(permissionTooltip('create a workflow', 'workflow:create'))
    expect(result.current.tooltips.save).toBe(permissionTooltip('save a new workflow', 'workflow:create'))
  })

  it('generates correct tooltip for existing workflow', () => {
    mockedUseCanI.mockReturnValue({ allowed: true, isChecking: false })

    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.tooltips.edit).toBe(permissionTooltip('edit this workflow', 'workflow:update'))
    expect(result.current.tooltips.save).toBe(permissionTooltip('save changes to this workflow', 'workflow:update'))
    expect(result.current.tooltips.publish).toBe(permissionTooltip('publish this workflow', 'workflow:update'))
    expect(result.current.tooltips.run).toBe(permissionTooltip('run this workflow', 'execution:run'))
    expect(result.current.tooltips.delete).toBe(permissionTooltip('delete this workflow', 'workflow:delete'))
  })
})
