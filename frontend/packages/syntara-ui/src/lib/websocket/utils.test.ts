import { describe, expect, it } from 'vitest'

import {
  getConnectionStateLabel,
  getConnectionStateColor,
  isActiveState,
  isConnectingState,
  isFailedState,
} from './utils'

describe('getConnectionStateLabel', () => {
  it('returns correct label for connecting', () => {
    expect(getConnectionStateLabel('connecting')).toBe('Connecting...')
  })

  it('returns correct label for connected', () => {
    expect(getConnectionStateLabel('connected')).toBe('Connected')
  })

  it('returns correct label for disconnected', () => {
    expect(getConnectionStateLabel('disconnected')).toBe('Disconnected')
  })

  it('returns correct label for reconnecting', () => {
    expect(getConnectionStateLabel('reconnecting')).toBe('Reconnecting...')
  })

  it('returns correct label for failed', () => {
    expect(getConnectionStateLabel('failed')).toBe('Connection Failed')
  })
})

describe('getConnectionStateColor', () => {
  it('returns yellow for connecting', () => {
    expect(getConnectionStateColor('connecting')).toBe('yellow')
  })

  it('returns green for connected', () => {
    expect(getConnectionStateColor('connected')).toBe('green')
  })

  it('returns gray for disconnected', () => {
    expect(getConnectionStateColor('disconnected')).toBe('gray')
  })

  it('returns yellow for reconnecting', () => {
    expect(getConnectionStateColor('reconnecting')).toBe('yellow')
  })

  it('returns red for failed', () => {
    expect(getConnectionStateColor('failed')).toBe('red')
  })
})

describe('isActiveState', () => {
  it('returns true only for connected state', () => {
    expect(isActiveState('connected')).toBe(true)
  })

  it('returns false for other states', () => {
    expect(isActiveState('connecting')).toBe(false)
    expect(isActiveState('disconnected')).toBe(false)
    expect(isActiveState('reconnecting')).toBe(false)
    expect(isActiveState('failed')).toBe(false)
  })
})

describe('isConnectingState', () => {
  it('returns true for connecting state', () => {
    expect(isConnectingState('connecting')).toBe(true)
  })

  it('returns true for reconnecting state', () => {
    expect(isConnectingState('reconnecting')).toBe(true)
  })

  it('returns false for other states', () => {
    expect(isConnectingState('connected')).toBe(false)
    expect(isConnectingState('disconnected')).toBe(false)
    expect(isConnectingState('failed')).toBe(false)
  })
})

describe('isFailedState', () => {
  it('returns true only for failed state', () => {
    expect(isFailedState('failed')).toBe(true)
  })

  it('returns false for other states', () => {
    expect(isFailedState('connecting')).toBe(false)
    expect(isFailedState('connected')).toBe(false)
    expect(isFailedState('disconnected')).toBe(false)
    expect(isFailedState('reconnecting')).toBe(false)
  })
})
