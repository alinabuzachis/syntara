/**
 * Shared webhook path utilities.
 *
 * Backend-compatible path pattern: single slug of lowercase alphanumeric, hyphens, and
 * underscores. Must start and end with a letter or digit. Frontend accepts mixed case
 * and a leading slash — normalization (lowercase, strip leading slashes) happens before
 * validation and on submit.
 */

const WEBHOOK_PATH_PATTERN = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/

/**
 * Normalize a user-entered webhook path for backend storage:
 * strip leading slashes and convert to lowercase.
 */
export function normalizeWebhookPath(path: string): string {
  return path.trim().replace(/^\/+/, '').toLowerCase()
}

/** Check whether a normalized webhook path matches the backend pattern. */
export function isValidWebhookPath(path: string): boolean {
  return WEBHOOK_PATH_PATTERN.test(path)
}
