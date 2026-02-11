import { describe, expect, it } from 'vitest'

import { generateUUID, generateActivityId } from './generateUUID'

describe('generateUUID', () => {
  it('returns a valid UUID v4 format', () => {
    const uuid = generateUUID()

    // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // where y is one of 8, 9, a, or b
    const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    expect(uuid).toMatch(uuidV4Regex)
  })

  it('generates unique UUIDs', () => {
    const uuid1 = generateUUID()
    const uuid2 = generateUUID()
    const uuid3 = generateUUID()

    expect(uuid1).not.toBe(uuid2)
    expect(uuid2).not.toBe(uuid3)
    expect(uuid1).not.toBe(uuid3)
  })
})

describe('generateActivityId', () => {
  it('returns an ID with default prefix', () => {
    const id = generateActivityId()

    expect(id).toMatch(/^activity_[0-9a-f_]{32,}$/i)
    expect(id.startsWith('activity_')).toBe(true)
  })

  it('returns an ID with custom prefix', () => {
    const id = generateActivityId('task')

    expect(id.startsWith('task_')).toBe(true)
  })

  it('replaces hyphens with underscores in UUID', () => {
    const id = generateActivityId()

    // Should not contain hyphens
    expect(id).not.toContain('-')
    // Should contain underscores (from the UUID replacement)
    expect(id.split('_').length).toBeGreaterThan(1)
  })

  it('generates unique activity IDs', () => {
    const id1 = generateActivityId()
    const id2 = generateActivityId()

    expect(id1).not.toBe(id2)
  })
})
