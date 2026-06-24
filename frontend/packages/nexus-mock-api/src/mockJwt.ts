/**
 * Minimal JWT token generator for mock API.
 *
 * Generates unsigned JWT tokens (alg: "none") with username and userId claims.
 * The frontend only reads the payload claims - signature validation happens on the backend.
 */

export type JwtClaims = {
  /** Username (maps to preferred_username claim) */
  username: string
  /** User ID (maps to sub claim) */
  userId: string
  /** Role-based token type (admin, viewer, auditor, user) */
  role?: string
}

/**
 * Generate a mock JWT token with the given claims.
 *
 * Format: base64url(header).base64url(payload).
 * The signature is empty since we use alg: "none" for mock tokens.
 *
 * Uses a fixed timestamp to avoid test flakiness. In a real backend,
 * iat/exp would be set from the server's clock.
 */
export function createMockJwt(claims: JwtClaims): string {
  const header = { alg: 'none', typ: 'JWT' }
  const payload = {
    sub: claims.userId,
    preferred_username: claims.username,
    role: claims.role,
    iat: 1704067200, // Fixed: 2024-01-01T00:00:00Z
    exp: 1704070800, // Fixed: 2024-01-01T01:00:00Z (1 hour later)
  }

  const base64UrlEncode = (obj: object): string => {
    const json = JSON.stringify(obj)
    return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }

  return `${base64UrlEncode(header)}.${base64UrlEncode(payload)}.`
}
