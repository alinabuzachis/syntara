/** Flag value stored in localStorage that activates TanStack Router. */
const TANSTACK_FLAG_KEY = 'nexus-ui-router'
const TANSTACK_FLAG_VALUE = 'tanstack'

const _isTanStack = localStorage.getItem(TANSTACK_FLAG_KEY) === TANSTACK_FLAG_VALUE

// Boot log — lets the team know which router is active and how to toggle.
// eslint-disable-next-line no-console
console.info(
  _isTanStack
    ? "[nexus-ui] Router: tanstack | To switch back: localStorage.removeItem('nexus-ui-router') then reload"
    : `[nexus-ui] Router: wouter | To switch: localStorage.setItem('${TANSTACK_FLAG_KEY}', '${TANSTACK_FLAG_VALUE}') then reload`
)

/**
 * Returns `true` when TanStack Router is active.
 *
 * Evaluated once at module scope (page load). A page reload is required to
 * switch routers. Bridge hooks read this constant to pick their implementation.
 */
export function isTanStackRouter(): boolean {
  return _isTanStack
}
