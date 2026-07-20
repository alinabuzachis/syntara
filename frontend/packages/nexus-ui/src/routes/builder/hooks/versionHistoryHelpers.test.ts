import { describe, expect, it, vi } from 'vitest'

import { closeWhenDropdownCloses, nextOpenKebabVersionId, resolvePublishedVersionName } from './versionHistoryHelpers'

describe('nextOpenKebabVersionId', () => {
  it('opens a kebab when none is open', () => {
    expect(nextOpenKebabVersionId(null, 'v-2')).toBe('v-2')
  })

  it('closes the kebab when the same version is toggled', () => {
    expect(nextOpenKebabVersionId('v-2', 'v-2')).toBeNull()
  })

  it('switches to a different version kebab', () => {
    expect(nextOpenKebabVersionId('v-1', 'v-2')).toBe('v-2')
  })
})

describe('closeWhenDropdownCloses', () => {
  it('calls onClose when the dropdown reports closed', () => {
    const onClose = vi.fn()
    closeWhenDropdownCloses(false, onClose)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose when the dropdown reports open', () => {
    const onClose = vi.fn()
    closeWhenDropdownCloses(true, onClose)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('resolvePublishedVersionName', () => {
  it('returns null when versions are missing', () => {
    expect(resolvePublishedVersionName(undefined)).toBeNull()
  })

  it('returns null when no published version exists', () => {
    expect(resolvePublishedVersionName([{ status: 'draft', name: null, version: 1 }])).toBeNull()
  })

  it('returns the published version name when set', () => {
    expect(
      resolvePublishedVersionName([
        { status: 'draft', name: null, version: 2 },
        { status: 'published', name: 'Release', version: 1 },
      ])
    ).toBe('Release')
  })

  it('falls back to Version N when published name is null', () => {
    expect(resolvePublishedVersionName([{ status: 'published', name: null, version: 4 }])).toBe('Version 4')
  })
})
