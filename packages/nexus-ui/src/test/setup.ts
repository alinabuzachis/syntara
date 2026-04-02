import '@testing-library/jest-dom/vitest'
import 'vitest-axe/extend-expect'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, afterAll, expect } from 'vitest'

// Collect React act() warnings during each test, then fail in afterEach.
// Throwing directly from console.error creates unhandled rejections when
// async third-party code (e.g. PatternFly Popper) triggers the warning.
let actWarnings: string[] = []

/* eslint-disable no-console */
const originalConsoleError = console.error
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = args[0]
    if (typeof message === 'string') {
      if (message.includes('is unrecognized in this browser')) {
        return
      }
      const isActWarning = [
        'was not wrapped in act',
        'overlapping act() calls',
        'act(async () => ...) without await',
        'Do not await the result of calling act',
      ].some((pattern) => message.includes(pattern))

      if (isActWarning) {
        const renderedArgs = args.map((arg) => String(arg))
        const warningHeader = renderedArgs.slice(0, 2).join(' ')
        const isPopperWarning = message.includes('was not wrapped in act') && /\bPopper\b/.test(warningHeader)
        if (!isPopperWarning) {
          actWarnings.push(renderedArgs.join(' '))
        }
        return
      }
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

beforeEach(() => {
  actWarnings = []
})

afterEach(async () => {
  await Promise.resolve()
  cleanup()
  await Promise.resolve()
  const warnings = [...actWarnings]
  actWarnings = []
  expect(
    warnings,
    `React act() warnings in: ${warnings.join(', ')} — wrap state updates in waitFor or act`
  ).toHaveLength(0)
})
