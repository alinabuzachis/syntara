import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useBuilderPermissions } from './useBuilderPermissions'

type CanIResult = { allowed: boolean; isChecking: boolean; isError: boolean }
type CanIOptions = { resourceProject?: string; checkAnyProject?: boolean }

const mockUseCanI = vi.hoisted(() =>
  vi.fn<(action: string, resourceType: string, options?: CanIOptions) => CanIResult>()
)

vi.mock('../../hooks/useCanI', () => ({
  useCanI: mockUseCanI,
}))

function mockAllGranted(): void {
  mockUseCanI.mockReturnValue({ allowed: true, isChecking: false, isError: false })
}

function mockDenied(actionResource: string): void {
  mockUseCanI.mockImplementation((action: string, resourceType: string) => {
    const key = `${action}:${resourceType}`
    return {
      allowed: key !== actionResource,
      isChecking: false,
      isError: false,
    }
  })
}

describe('useBuilderPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to safe-false while loading', () => {
    mockUseCanI.mockReturnValue({ allowed: false, isChecking: true, isError: false })
    const { result } = renderHook(() => useBuilderPermissions(false))

    expect(result.current.canEdit).toBe(false)
    expect(result.current.canRun).toBe(false)
    expect(result.current.canDelete).toBe(false)
    expect(result.current.isLoading).toBe(true)
  })

  it('returns all permissions when all granted (existing workflow)', () => {
    mockAllGranted()
    const { result } = renderHook(() => useBuilderPermissions(false, false, 'proj-1'))

    expect(result.current.canEdit).toBe(true)
    expect(result.current.canRun).toBe(true)
    expect(result.current.canDelete).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('uses canCreate for canEdit on new workflows', () => {
    mockAllGranted()
    const { result } = renderHook(() => useBuilderPermissions(true))
    expect(result.current.canEdit).toBe(true)
  })

  it('denies canEdit for existing when update is denied', () => {
    mockDenied('update:workflow')
    const { result } = renderHook(() => useBuilderPermissions(false, false, 'proj-1'))
    expect(result.current.canEdit).toBe(false)
  })

  it('denies canEdit for new when create is denied', () => {
    mockDenied('create:workflow')
    const { result } = renderHook(() => useBuilderPermissions(true))
    expect(result.current.canEdit).toBe(false)
  })

  it('overrides canEdit and canDelete to false for builtin, keeps canRun', () => {
    mockAllGranted()
    const { result } = renderHook(() => useBuilderPermissions(false, true, 'proj-1'))

    expect(result.current.canEdit).toBe(false)
    expect(result.current.canDelete).toBe(false)
    expect(result.current.canRun).toBe(true)
  })

  it('tooltips reference update permission for existing workflows', () => {
    mockAllGranted()
    const { result } = renderHook(() => useBuilderPermissions(false, false, 'proj-1'))

    expect(result.current.tooltips.edit).toContain('workflow:update')
    expect(result.current.tooltips.save).toContain('workflow:update')
    expect(result.current.tooltips.publish).toContain('workflow:update')
    expect(result.current.tooltips.unpublish).toContain('workflow:update')
    expect(result.current.tooltips.run).toContain('execution:run')
    expect(result.current.tooltips.delete).toContain('workflow:delete')
  })

  it('tooltips reference create permission for new workflows', () => {
    mockAllGranted()
    const { result } = renderHook(() => useBuilderPermissions(true))

    expect(result.current.tooltips.edit).toContain('workflow:create')
    expect(result.current.tooltips.save).toContain('workflow:create')
  })

  it('scopes can_i checks to resourceProject when projectId is provided', () => {
    mockAllGranted()
    renderHook(() => useBuilderPermissions(false, false, 'proj-1'))

    const expectedOptions = { resourceProject: 'proj-1' }
    expect(mockUseCanI).toHaveBeenCalledWith('create', 'workflow', expectedOptions)
    expect(mockUseCanI).toHaveBeenCalledWith('update', 'workflow', expectedOptions)
    expect(mockUseCanI).toHaveBeenCalledWith('delete', 'workflow', expectedOptions)
    expect(mockUseCanI).toHaveBeenCalledWith('run', 'execution', expectedOptions)
  })

  it('uses checkAnyProject for create when projectId is not provided', () => {
    mockAllGranted()
    renderHook(() => useBuilderPermissions(true))

    expect(mockUseCanI).toHaveBeenCalledWith('create', 'workflow', { checkAnyProject: true })
    expect(mockUseCanI).toHaveBeenCalledWith('update', 'workflow', undefined)
    expect(mockUseCanI).toHaveBeenCalledWith('delete', 'workflow', undefined)
    expect(mockUseCanI).toHaveBeenCalledWith('run', 'execution', undefined)
  })
})
