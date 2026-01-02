import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Polyfill for Web Animations API getAnimations method (not supported in jsdom)
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = function () {
    return []
  }
}

// Polyfill for ResizeObserver (not supported in jsdom)
if (typeof globalThis !== 'undefined' && !globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }
    observe() {
      // No-op in test environment
    }
    unobserve() {
      // No-op in test environment
    }
    disconnect() {
      // No-op in test environment
    }
    private callback: ResizeObserverCallback
  } as typeof ResizeObserver
}

// Cleanup after each test
afterEach(() => {
  cleanup()
})
