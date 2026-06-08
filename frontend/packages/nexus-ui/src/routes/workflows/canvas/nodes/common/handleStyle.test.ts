import { describe, expect, it } from 'vitest'

import { DEFAULT_NEUTRAL_EDGE_STROKE } from '../../../../../constants/workflowEdgeStrokeTokens'

import { sourceHandleStyle, targetHandleStyle } from './handleStyle'

describe('handleStyle', () => {
  describe('targetHandleStyle', () => {
    it('exports targetHandleStyle as CSS properties object', () => {
      expect(targetHandleStyle).toBeDefined()
      expect(typeof targetHandleStyle).toBe('object')
    })

    it('has width property for vertical line shape', () => {
      expect(targetHandleStyle.width).toBe(2)
    })

    it('has height property', () => {
      expect(targetHandleStyle.height).toBe(16)
    })

    it('has no border radius for sharp edges', () => {
      expect(targetHandleStyle.borderRadius).toBe(0)
    })

    it('uses the same stroke token as default workflow edges', () => {
      expect(targetHandleStyle.background).toBe(DEFAULT_NEUTRAL_EDGE_STROKE)
    })

    it('has no border chrome', () => {
      expect(targetHandleStyle.border).toBe('none')
    })

    it('has crosshair cursor for connection interaction', () => {
      expect(targetHandleStyle.cursor).toBe('crosshair')
    })
  })

  describe('sourceHandleStyle', () => {
    it('exports sourceHandleStyle as CSS properties object', () => {
      expect(sourceHandleStyle).toBeDefined()
      expect(typeof sourceHandleStyle).toBe('object')
    })

    it('has equal width and height for circular shape', () => {
      expect(sourceHandleStyle.width).toBe(12)
      expect(sourceHandleStyle.height).toBe(12)
    })

    it('has 50% border radius for circle', () => {
      expect(sourceHandleStyle.borderRadius).toBe('50%')
    })

    it('uses the same stroke token as default workflow edges', () => {
      expect(sourceHandleStyle.background).toBe(DEFAULT_NEUTRAL_EDGE_STROKE)
    })

    it('has no border chrome', () => {
      expect(sourceHandleStyle.border).toBe('none')
    })

    it('uses border-box for consistent sizing', () => {
      expect(sourceHandleStyle.boxSizing).toBe('border-box')
    })

    it('has crosshair cursor for connection interaction', () => {
      expect(sourceHandleStyle.cursor).toBe('crosshair')
    })
  })

  describe('style consistency', () => {
    it('both styles have same background color', () => {
      expect(targetHandleStyle.background).toBe(sourceHandleStyle.background)
    })

    it('both styles have same cursor style', () => {
      expect(targetHandleStyle.cursor).toBe(sourceHandleStyle.cursor)
    })

    it('source handle is larger than target handle width', () => {
      expect(sourceHandleStyle.width).toBeGreaterThan(targetHandleStyle.width as number)
    })
  })
})
