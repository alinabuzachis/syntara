import { describe, it, expect } from 'vitest'

import { getExecutionSortValue } from './getExecutionSortValue'

describe('getExecutionSortValue', () => {
  const mockExecution = {
    id: 'exec-123',
    workflow_id: 'workflow-456',
    status: 'completed',
    created_at: '2026-02-27T10:00:00Z',
    completed_at: '2026-02-27T11:00:00Z',
  } as Parameters<typeof getExecutionSortValue>[0]

  describe('with workflow column visible', () => {
    it('returns workflow_id for index 0 (Automation name column)', () => {
      expect(getExecutionSortValue(mockExecution, 0, true)).toBe('workflow-456')
    })

    it('returns execution.id for index 1 (Run ID column)', () => {
      expect(getExecutionSortValue(mockExecution, 1, true)).toBe('exec-123')
    })

    it('returns status for index 2', () => {
      expect(getExecutionSortValue(mockExecution, 2, true)).toBe('completed')
    })

    it('returns created_at Date for index 3', () => {
      const result = getExecutionSortValue(mockExecution, 3, true)
      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2026-02-27T10:00:00.000Z')
    })

    it('returns completed_at Date for index 4', () => {
      const result = getExecutionSortValue(mockExecution, 4, true)
      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2026-02-27T11:00:00.000Z')
    })

    it('returns execution.id for unknown index (default)', () => {
      expect(getExecutionSortValue(mockExecution, 99, true)).toBe('exec-123')
    })
  })

  describe('with workflow column hidden', () => {
    it('returns execution.id for index 0 (Run ID, maps to actual index 1)', () => {
      expect(getExecutionSortValue(mockExecution, 0, false)).toBe('exec-123')
    })

    it('maps index 1 to status (maps to actual index 2)', () => {
      expect(getExecutionSortValue(mockExecution, 1, false)).toBe('completed')
    })

    it('maps index 2 to created_at (maps to actual index 3)', () => {
      const result = getExecutionSortValue(mockExecution, 2, false)
      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2026-02-27T10:00:00.000Z')
    })

    it('maps index 3 to completed_at (maps to actual index 4)', () => {
      const result = getExecutionSortValue(mockExecution, 3, false)
      expect(result).toBeInstanceOf(Date)
      expect((result as Date).toISOString()).toBe('2026-02-27T11:00:00.000Z')
    })

    it('returns execution.id for unknown index (default)', () => {
      expect(getExecutionSortValue(mockExecution, 99, false)).toBe('exec-123')
    })
  })

  describe('handles missing optional values gracefully', () => {
    it('returns null for missing completed_at', () => {
      const execWithoutCompletedAt = { ...mockExecution, completed_at: undefined }
      expect(getExecutionSortValue(execWithoutCompletedAt, 4, true)).toBeNull()
    })
  })
})
