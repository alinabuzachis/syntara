import { describe, expect, it } from 'vitest'

import {
  SWITCH_CASE_PORT_PREFIX,
  buildSwitchCasePort,
  isSwitchCasePort,
  serializeSwitchCases,
} from './switchCaseHelpers'

describe('SWITCH_CASE_PORT_PREFIX', () => {
  it('equals "case_"', () => {
    expect(SWITCH_CASE_PORT_PREFIX).toBe('case_')
  })
})

describe('buildSwitchCasePort', () => {
  it('builds port for index 0', () => {
    expect(buildSwitchCasePort(0)).toBe('case_0')
  })

  it('builds port for large index', () => {
    expect(buildSwitchCasePort(99)).toBe('case_99')
  })
})

describe('isSwitchCasePort', () => {
  it('returns true for case_0', () => {
    expect(isSwitchCasePort('case_0')).toBe(true)
  })

  it('returns true for case_99', () => {
    expect(isSwitchCasePort('case_99')).toBe(true)
  })

  it('returns true for bare prefix case_', () => {
    expect(isSwitchCasePort('case_')).toBe(true)
  })

  it('returns false for null', () => {
    expect(isSwitchCasePort(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isSwitchCasePort(undefined)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isSwitchCasePort('')).toBe(false)
  })

  it('returns false for default', () => {
    expect(isSwitchCasePort('default')).toBe(false)
  })

  it('returns false for non-matching prefix', () => {
    expect(isSwitchCasePort('notcase_0')).toBe(false)
  })

  it('returns false for source handle', () => {
    expect(isSwitchCasePort('source')).toBe(false)
  })
})

describe('serializeSwitchCases', () => {
  it('serializes a single case with default label', () => {
    const result = serializeSwitchCases([
      { id: 'c1', variable: '${input.status}', operator: '==', value: "'active'", negate: false },
    ])

    expect(result).toHaveLength(1)
    expect(result[0].port).toBe('case_0')
    expect(result[0].label).toBe('Path 1')
    expect(result[0].condition).toBeTruthy()
  })

  it('serializes multiple cases with correct port indices', () => {
    const result = serializeSwitchCases([
      { id: 'c1', variable: '${input.a}', operator: '==', value: '1' },
      { id: 'c2', variable: '${input.b}', operator: '>', value: '2' },
      { id: 'c3', variable: '${input.c}', operator: '<', value: '3' },
    ])

    expect(result).toHaveLength(3)
    expect(result[0].port).toBe('case_0')
    expect(result[1].port).toBe('case_1')
    expect(result[2].port).toBe('case_2')
  })

  it('uses provided label when available', () => {
    const result = serializeSwitchCases([
      { id: 'c1', label: 'Priority High', variable: '${input.priority}', operator: '==', value: "'high'" },
    ])

    expect(result[0].label).toBe('Priority High')
  })

  it('falls back to Path N when label is empty', () => {
    const result = serializeSwitchCases([
      { id: 'c1', label: '', variable: '${input.x}', operator: '==', value: '1' },
      { id: 'c2', label: '', variable: '${input.y}', operator: '==', value: '2' },
    ])

    expect(result[0].label).toBe('Path 1')
    expect(result[1].label).toBe('Path 2')
  })

  it('preserves negate flag in serialized condition', () => {
    const result = serializeSwitchCases([
      { id: 'c1', variable: '${input.status}', operator: '==', value: "'disabled'", negate: true },
    ])

    expect(result[0].condition).toContain('not')
  })

  it('handles missing negate as false', () => {
    const result = serializeSwitchCases([{ id: 'c1', variable: '${input.x}', operator: '==', value: '1' }])

    expect(result[0].condition).not.toContain('not')
  })
})
