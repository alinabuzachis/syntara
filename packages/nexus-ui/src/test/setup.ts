import '@testing-library/jest-dom/vitest'
import 'vitest-axe/extend-expect'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, afterAll } from 'vitest'

// Filter jsdom SVG warnings - jsdom doesn't support SVG namespaced elements
// used by ReactFlow (path, polyline, marker, etc). These are not actionable.
/* eslint-disable no-console */
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = args[0]
    if (typeof message === 'string' && message.includes('is unrecognized in this browser')) {
      return
    }
    originalConsoleError.apply(console, args)
  }
})
afterAll(() => {
  console.error = originalConsoleError
})
/* eslint-enable no-console */

// Polyfill for Web Animations API getAnimations method (not supported in jsdom)
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = function () {
    return []
  }
}

// Polyfill for ResizeObserver (not supported in jsdom)
if (typeof globalThis !== 'undefined' && !globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {
      // No-op in test environment
    }
    unobserve() {
      // No-op in test environment
    }
    disconnect() {
      // No-op in test environment
    }
  } as typeof ResizeObserver
}

// Cleanup after each test
afterEach(() => {
  cleanup()
})
