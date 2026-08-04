/**
 * Shared mock for authMiddleware used across test files.
 *
 * The authMiddleware adds authentication headers to API requests.
 * In tests, we mock it to avoid real authentication flows.
 *
 * Usage in test files:
 * ```typescript
 * import { mockAuthMiddleware } from '../../test/mockAuthMiddleware'
 *
 * vi.mock('../../client', () => ({
 *   authMiddleware: mockAuthMiddleware,
 *   // ... other mocks
 * }))
 * ```
 */
import { vi } from 'vitest'

export const mockAuthMiddleware = {
  onRequest: vi.fn(),
}
