/**
 * Minimum password length aligned with backend UserCreate (InfoSec compliance - API-46).
 *
 * Enforces 14-character minimum to provide strong resistance to brute-force attacks
 * while remaining memorable for users.
 */
export const MIN_USER_PASSWORD_LENGTH = 14

/**
 * Minimum number of character classes required for password complexity.
 *
 * Requiring 3 of 4 classes ensures password diversity without being overly restrictive.
 */
const MIN_CHARACTER_CLASSES = 3

/** User-facing message for minimum length validation failure. */
export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${MIN_USER_PASSWORD_LENGTH} characters`

/** User-facing message for character class validation failure. */
export const PASSWORD_CHARACTER_CLASSES_MESSAGE =
  'Password must contain at least 3 of the following character classes: digits (0-9), uppercase letters (A-Z), lowercase letters (a-z), punctuation/spaces/other characters'

/**
 * Validates password meets InfoSec requirements (API-46), matching backend UserCreate.
 *
 * Requirements:
 * - Minimum 14 characters
 * - At least 3 of 4 character classes:
 *   - Digits (0-9)
 *   - Uppercase letters (A-Z)
 *   - Lowercase letters (a-z)
 *   - Punctuation/spaces/other characters
 *
 * @param password - The password to validate
 * @returns Error message if validation fails, undefined if password is compliant
 *
 * @example
 * ```ts
 * getPasswordComplexityError('Short1!') // => 'Password must be at least 14 characters'
 * getPasswordComplexityError('lowercaseonly123456') // => 'Password must contain at least 3...'
 * getPasswordComplexityError('ValidPassword123!') // => undefined (compliant)
 * ```
 */
export function getPasswordComplexityError(password: string): string | undefined {
  if (password.length < MIN_USER_PASSWORD_LENGTH) {
    return PASSWORD_MIN_LENGTH_MESSAGE
  }

  let characterClasses = 0
  if (/\d/.test(password)) characterClasses += 1
  if (/[A-Z]/.test(password)) characterClasses += 1
  if (/[a-z]/.test(password)) characterClasses += 1
  if (/[^a-zA-Z0-9]/.test(password)) characterClasses += 1

  if (characterClasses < MIN_CHARACTER_CLASSES) {
    return PASSWORD_CHARACTER_CLASSES_MESSAGE
  }

  return undefined
}
