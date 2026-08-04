/**
 * Maximum allowed length for search input strings.
 * Prevents excessively long search queries that could impact performance
 * or be used for DoS attacks.
 */
const MAX_SEARCH_LENGTH = 200

/**
 * Sanitizes user input for search parameters to prevent injection attacks.
 *
 * - Strips control characters (including newlines, tabs, null bytes)
 * - Removes characters commonly used in injection attacks (quotes, semicolons, backslashes)
 * - Enforces maximum length limit
 * - Trims leading/trailing whitespace
 *
 * This provides defense-in-depth alongside backend validation.
 *
 * @param input - Raw search string from user input
 * @returns Sanitized search string safe for use in API queries
 *
 * @example
 * sanitizeSearchInput("valid search") // "valid search"
 * sanitizeSearchInput("'; DROP TABLE--") // " DROP TABLE--"
 * sanitizeSearchInput("a".repeat(300)) // "a".repeat(200)
 */
export function sanitizeSearchInput(input: string): string {
  if (!input) return ''

  return (
    input
      // Remove control characters (0x00-0x1F and 0x7F)
      // eslint-disable-next-line no-control-regex -- intentionally matching control characters for security
      .replaceAll(/[\u0000-\u001F\u007F]/g, '')
      // Remove characters commonly used in injection attacks:
      // - Quotes (single, double, backtick) for SQL/command injection
      // - Semicolon for command chaining
      // - Backslash for escape sequences
      // - Angle brackets for XSS injection
      // Note: Allows =, *, (, ), | as these can appear in legitimate AAP resource names
      // and the backend properly parameterizes search queries
      .replaceAll(/['"`;\\<>]/g, '')
      // Enforce max length
      .slice(0, MAX_SEARCH_LENGTH)
      // Trim whitespace
      .trim()
  )
}
