/**
 * URL validation utilities for security-critical external links.
 *
 * Provides defense-in-depth validation to prevent open redirect attacks,
 * phishing, and malicious URL injection via compromised backend data.
 */

/**
 * Validates that a URL is safe to link to AAP Controller.
 *
 * Security requirements:
 * - Must be HTTPS (or HTTP for development)
 * - Must match expected AAP Controller URL path pattern
 * - Rejects javascript:, data:, file:, and other dangerous schemes
 * - Rejects URLs that don't match AAP job template detail pattern
 *
 * AAP Controller job template detail URLs follow the pattern:
 * https://<hostname>/execution/templates/job-template/<id>/details
 *
 * @param url - URL string from AAP API response
 * @returns true if URL is safe to link, false otherwise
 *
 * @example
 * isValidAAPTemplateURL("https://aap.example.com/execution/templates/job-template/123/details") // true
 * isValidAAPTemplateURL("https://evil.com/phishing") // false
 * isValidAAPTemplateURL("javascript:alert(1)") // false
 * isValidAAPTemplateURL("data:text/html,<script>...") // false
 */
export function isValidAAPTemplateURL(url: string | null | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)

    // 1. Validate protocol - HTTPS required, HTTP only for loopback addresses
    const isLoopback =
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'

    if (parsed.protocol === 'http:' && !isLoopback) {
      return false // HTTP not allowed for non-loopback hosts
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return false // Only HTTP and HTTPS protocols allowed
    }

    // 2. Reject URLs with credentials (username:password@host)
    if (parsed.username || parsed.password) {
      return false
    }

    // 3. Validate path matches expected AAP Controller job template detail pattern
    // Pattern: /execution/templates/job-template/<id>/details
    // where <id> is a positive integer
    const pathPattern = /^\/execution\/templates\/job-template\/\d+\/details\/?$/
    if (!pathPattern.test(parsed.pathname)) {
      return false
    }

    // 4. Reject URLs with query parameters (potential open redirect)
    if (parsed.search) {
      return false
    }

    // 5. Reject URLs with fragments (potential XSS vector)
    if (parsed.hash) {
      return false
    }

    // 6. URL passed all checks
    return true
  } catch {
    // Invalid URL syntax
    return false
  }
}
