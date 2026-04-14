import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { detachPromise, reportDetachedRejection, toReportableError } from './detachPromise'

describe('toReportableError', () => {
  it('returns the same Error instance', () => {
    const err = new Error('x')
    expect(toReportableError(err)).toBe(err)
  })

  it('returns a plain error when reason is undefined', () => {
    const err = toReportableError(undefined)
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('Detached promise rejected')
    expect(err.cause).toBeUndefined()
  })

  it('returns a plain error when reason is null', () => {
    const err = toReportableError(null)
    expect(err.message).toBe('Detached promise rejected')
    expect(err.cause).toBeUndefined()
  })

  it('wraps non-Error values with cause', () => {
    const err = toReportableError('oops')
    expect(err.message).toBe('Detached promise rejected')
    expect(err.cause).toBe('oops')
  })
})

describe('reportDetachedRejection', () => {
  const originalReportError = globalThis.reportError

  afterEach(() => {
    if (originalReportError !== undefined) {
      globalThis.reportError = originalReportError
    } else {
      Reflect.deleteProperty(globalThis, 'reportError')
    }
  })

  it('no-ops when reportError is not a function', () => {
    Reflect.deleteProperty(globalThis, 'reportError')
    expect(() => reportDetachedRejection(new Error('x'))).not.toThrow()
  })

  it('calls globalThis.reportError with a normalized Error', () => {
    const reportError = vi.fn()
    globalThis.reportError = reportError as typeof globalThis.reportError

    reportDetachedRejection('bad')

    expect(reportError).toHaveBeenCalledOnce()
    const arg = reportError.mock.calls[0][0] as Error
    expect(arg).toBeInstanceOf(Error)
    expect(arg.message).toBe('Detached promise rejected')
    expect(arg.cause).toBe('bad')
  })
})

describe('detachPromise', () => {
  let warnSpy: MockInstance<typeof console.warn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not throw when result is undefined', () => {
    expect(() => detachPromise(undefined)).not.toThrow()
  })

  it('does not throw when a mock returns undefined', () => {
    const fn = vi.fn()
    expect(() => detachPromise(fn())).not.toThrow()
  })

  it('accepts a resolved promise', async () => {
    expect(() => detachPromise(Promise.resolve(42))).not.toThrow()
    await Promise.resolve()
  })

  it('does not throw on rejected promise', async () => {
    expect(() => detachPromise(Promise.reject(new Error('test')))).not.toThrow()
    await Promise.resolve()
    expect(warnSpy).toHaveBeenCalled()
  })

  it('invokes onReject when the promise rejects', async () => {
    const onReject = vi.fn()
    detachPromise(Promise.reject(new Error('rejected')), { onReject })
    await Promise.resolve()
    expect(onReject).toHaveBeenCalledOnce()
    expect(onReject.mock.calls[0][0]).toBeInstanceOf(Error)
    expect(warnSpy).not.toHaveBeenCalled()
  })
})
