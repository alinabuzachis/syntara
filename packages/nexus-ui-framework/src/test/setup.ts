import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Polyfill for Web Animations API getAnimations method (not supported in jsdom)
// Required by @base-ui-components/react ScrollArea component (v1.0.0-beta.6+)
if (typeof Element !== 'undefined' && !Element.prototype.getAnimations) {
  Element.prototype.getAnimations = function () {
    return []
  }
}

// Cleanup after each test
afterEach(() => {
  cleanup()
})
