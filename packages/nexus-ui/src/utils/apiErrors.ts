/**
 * API Error Parsing Utilities
 *
 * Provides consistent error parsing for various API error formats including:
 * - Structured API errors: { error: "...", message: "..." }
 * - FastAPI standard errors: { detail: "..." }
 * - Nested detail objects: { detail: { error: "...", message: "..." } }
 * - openapi-fetch errors with cause: { cause: { message: "..." } }
 */

/** Error codes returned by the API */
export type ApiErrorCode = 'service_unavailable' | 'not_found' | 'validation_error' | 'unauthorized' | 'forbidden'

/** Structured API error format */
export interface ApiError {
  error?: string
  message?: string
  // FastAPI can return `detail` as a string, object, or list (validation errors)
  detail?: unknown
  // Some APIs use `details` as the long-form message/context
  details?: unknown
  // Some wrappers (and some WS envelopes) nest the actual error payload under `data`
  data?: unknown
  // RFC 9457 / problem-details style errors
  title?: string
  // openapi-fetch/openapi-react-query wraps errors with response object
  response?: { status?: number; statusText?: string }
  cause?: { message?: string; error?: string; status?: number }
  status?: number
  statusCode?: number
}

export interface ApiValidationFieldError {
  /** Dot-delimited field path (react-hook-form compatible), e.g. "configuration.api_key" */
  field: string
  message: string
}

/**
 * Extracts an HTTP status code from various error formats (including openapi-fetch wrapped errors).
 *
 * @param error - The error object to extract status from
 * @returns HTTP status code if available
 */
export function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const err = error as ApiError

  if (typeof err.status === 'number') {
    return err.status
  }
  if (typeof err.statusCode === 'number') {
    return err.statusCode
  }

  // openapi-fetch/openapi-react-query stores status in response.status
  if (err.response && typeof err.response === 'object') {
    const response = err.response as { status?: number }
    if (typeof response.status === 'number') {
      return response.status
    }
  }

  if (err.cause && typeof err.cause === 'object') {
    const cause = err.cause as { status?: number; statusCode?: number }
    if (typeof cause.status === 'number') {
      return cause.status
    }
    if (typeof cause.statusCode === 'number') {
      return cause.statusCode
    }
  }

  // Some wrappers store the response body under `data` (which may include status fields)
  if (err.data && typeof err.data === 'object') {
    const data = err.data as { status?: number; statusCode?: number }
    if (typeof data.status === 'number') {
      return data.status
    }
    if (typeof data.statusCode === 'number') {
      return data.statusCode
    }
  }

  return undefined
}

/**
 * Detects if an error is a 503 Service Unavailable error.
 *
 * Checks for:
 * - HTTP status code 503
 * - error code "service_unavailable"
 *
 * @param error - The error object to check
 * @returns true if the error is a 503 Service Unavailable error
 *
 * @example
 * if (isServiceUnavailableError(error)) {
 *   return <EmptyStateServiceUnavailable description={getErrorMessage(error)} />
 * }
 */
export function isServiceUnavailableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const err = error as ApiError

  // Check status code
  if (getErrorStatus(error) === 503) {
    return true
  }

  // Check error code
  if (err.error === 'service_unavailable') {
    return true
  }

  // Check nested detail
  if (err.detail && typeof err.detail === 'object') {
    const detail = err.detail as { error?: unknown }
    if (detail.error === 'service_unavailable') {
      return true
    }
  }

  // Check cause (openapi-fetch wraps errors with cause containing the response body)
  if (err.cause && typeof err.cause === 'object') {
    if (err.cause.status === 503 || err.cause.error === 'service_unavailable') {
      return true
    }
  }

  // Some envelopes/wrappers nest the error payload under `data`
  if (err.data && typeof err.data === 'object') {
    const data = err.data as { status?: number; statusCode?: number; error?: unknown; detail?: unknown }
    if (data.status === 503 || data.statusCode === 503) return true
    if (data.error === 'service_unavailable') return true
    if (typeof data.detail === 'object' && (data.detail as { error?: unknown }).error === 'service_unavailable')
      return true
  }

  return false
}

/**
 * Extracts a user-friendly message from various error formats.
 *
 * Tries to extract message from (in order):
 * 1. error.message
 * 2. error.detail.message (if detail is object)
 * 3. error.detail (if detail is string)
 * 4. error.cause.message
 * 5. Falls back to "An unexpected error occurred"
 *
 * @param error - The error object to extract message from
 * @returns A user-friendly error message
 *
 * @example
 * const message = getErrorMessage(error)
 * showAlert({ title: 'Error', message })
 */
export function getErrorMessage(error: unknown): string {
  const fallback = 'An unexpected error occurred'

  if (!error) {
    return fallback
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error !== 'object') {
    return fallback
  }

  // Handle native Error instances
  if (error instanceof Error && typeof error.message === 'string' && error.message) {
    return error.message
  }

  // Track visited objects to prevent infinite recursion from circular references
  // (e.g. openapi-fetch `cause`, WS `data` envelopes with cycles)
  const visited = new WeakSet<object>()

  const extractMessage = (value: unknown): string => {
    if (!value) return fallback
    if (typeof value === 'string') return value
    if (typeof value !== 'object') return fallback
    if (value instanceof Error && typeof value.message === 'string' && value.message) return value.message

    // Prevent circular reference infinite loops
    if (visited.has(value)) return fallback
    visited.add(value)

    const err = value as ApiError

    // Some wrappers/envelopes nest the actual error under `data` (e.g. WS error events: { event_type, data: { title, detail, ... } })
    if (err.data) {
      const dataMessage = extractMessage(err.data)
      if (dataMessage !== fallback) {
        return dataMessage
      }
    }

    // Direct message
    if (err.message && typeof err.message === 'string') {
      return err.message
    }

    // RFC/problem-details "detail" (string) or "details" (string)
    if (typeof err.details === 'string' && err.details) {
      return err.details
    }

    // Nested detail object
    if (typeof err.detail === 'object' && err.detail) {
      const d = err.detail as { message?: unknown; error?: unknown; detail?: unknown; details?: unknown }
      if (typeof d.message === 'string' && d.message) return d.message
      if (typeof d.detail === 'string' && d.detail) return d.detail
      if (typeof d.details === 'string' && d.details) return d.details
      if (typeof d.error === 'string' && d.error) return d.error
    }

    // String detail (FastAPI standard)
    if (typeof err.detail === 'string' && err.detail) {
      return err.detail
    }

    // Validation errors: FastAPI often returns `detail: [{ msg, ... }, ...]`
    if (Array.isArray(err.detail)) {
      const msgs = err.detail
        .map((item) => {
          if (!item) return null
          if (typeof item === 'string') return item
          if (typeof item !== 'object') return null
          const it = item as { msg?: unknown; message?: unknown; detail?: unknown; loc?: unknown }

          const message =
            (typeof it.msg === 'string' && it.msg) ||
            (typeof it.message === 'string' && it.message) ||
            (typeof it.detail === 'string' && it.detail) ||
            null

          if (!message) return null

          // If present, include a hint about which field failed validation.
          // FastAPI typically uses `loc: ["body", "fieldName"]` (or longer paths).
          if (Array.isArray(it.loc) && it.loc.length > 0) {
            const locParts = it.loc
              .map((p) => (typeof p === 'string' || typeof p === 'number' ? String(p) : null))
              .filter((p): p is string => !!p)
              // Drop common leading context tokens
              .filter((p) => p !== 'body' && p !== 'query' && p !== 'path' && p !== 'header')

            if (locParts.length > 0) {
              const fieldPath = locParts.join('.')
              return `${fieldPath}: ${message}`
            }
          }

          return message
        })
        .filter((m): m is string => !!m)
      if (msgs.length > 0) {
        // Avoid massive alerts if there are many fields
        return msgs.slice(0, 3).join('; ') + (msgs.length > 3 ? ` (+${msgs.length - 3} more)` : '')
      }
    }

    // Some APIs use `error` as a human message when `message` is absent
    if (err.error && typeof err.error === 'string') {
      return err.error
    }

    // Problem-details: if we only have a title, treat it as the message fallback
    if (err.title && typeof err.title === 'string') {
      return err.title
    }

    // Cause from openapi-fetch (may contain structured error with detail/message)
    if (err.cause && typeof err.cause === 'object') {
      const causeMessage = extractMessage(err.cause)
      if (causeMessage !== fallback) {
        return causeMessage
      }
    }

    return fallback
  }

  return extractMessage(error)
}

function extractValidationDetailArray(error: unknown): unknown[] | undefined {
  if (!error || typeof error !== 'object') return undefined

  const err = error as ApiError

  if (Array.isArray(err.detail)) return err.detail

  // openapi-fetch often wraps response body in `cause`
  if (err.cause && typeof err.cause === 'object') {
    const cause = err.cause as { detail?: unknown }
    if (Array.isArray(cause.detail)) return cause.detail
  }

  // Some wrappers/envelopes store the body under `data`
  if (err.data && typeof err.data === 'object') {
    const data = err.data as { detail?: unknown }
    if (Array.isArray(data.detail)) return data.detail
  }

  // nested detail object may contain its own detail array
  if (err.detail && typeof err.detail === 'object') {
    const nested = err.detail as { detail?: unknown }
    if (Array.isArray(nested.detail)) return nested.detail
  }

  return undefined
}

/**
 * Detects if an error is a validation error (422 with FastAPI detail array).
 *
 * Checks for:
 * - HTTP status code 422
 * - FastAPI validation error format (detail array) in various locations:
 *   - error.detail (top level)
 *   - error.cause.detail (openapi-fetch wrapper)
 *   - error.data.detail (envelope wrapper)
 *   - error.detail.detail (nested detail object)
 *
 * @param error - The error object to check
 * @returns true if the error is a validation error
 *
 * @example
 * if (isValidationError(error)) {
 *   // Keep alert visible until user dismisses it
 * }
 */
export function isValidationError(error: unknown): boolean {
  // Check for 422 status code
  if (getErrorStatus(error) === 422) {
    return true
  }

  // Check for FastAPI validation error format (detail array)
  // Reuse extractValidationDetailArray for consistency with getValidationFieldErrors
  const detailArray = extractValidationDetailArray(error)
  return detailArray !== undefined
}

/**
 * Extracts field-level validation errors from FastAPI/OpenAPI error formats.
 *
 * Intended for mapping backend validation errors onto react-hook-form fields.
 */
export function getValidationFieldErrors(error: unknown): ApiValidationFieldError[] {
  const detail = extractValidationDetailArray(error)
  if (!detail) return []

  const out: ApiValidationFieldError[] = []
  for (const item of detail) {
    if (!item || typeof item !== 'object') continue

    const it = item as { msg?: unknown; message?: unknown; detail?: unknown; loc?: unknown }
    const message =
      (typeof it.msg === 'string' && it.msg) ||
      (typeof it.message === 'string' && it.message) ||
      (typeof it.detail === 'string' && it.detail) ||
      null

    if (!message) continue

    if (!Array.isArray(it.loc) || it.loc.length === 0) continue

    const locParts = it.loc
      .map((p) => (typeof p === 'string' || typeof p === 'number' ? String(p) : null))
      .filter((p): p is string => !!p)
      .filter((p) => p !== 'body' && p !== 'query' && p !== 'path' && p !== 'header')

    if (locParts.length === 0) continue

    out.push({ field: locParts.join('.'), message })
  }

  return out
}

/**
 * Extracts the error code from an API error.
 *
 * @param error - The error object
 * @returns The error code or undefined if not found
 *
 * @example
 * const code = getErrorCode(error)
 * if (code === 'service_unavailable') {
 *   // Handle configuration error
 * }
 */
export function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined
  }

  const err = error as ApiError

  // Direct error code
  if (err.error && typeof err.error === 'string') {
    return err.error
  }

  // Some wrappers/envelopes nest the error payload under `data`
  if (err.data && typeof err.data === 'object') {
    const data = err.data as { error?: unknown; detail?: unknown }
    if (typeof data.error === 'string') return data.error
    if (typeof data.detail === 'object' && (data.detail as { error?: unknown }).error) {
      return (data.detail as { error: string }).error
    }
  }

  // Nested in detail
  if (err.detail && typeof err.detail === 'object') {
    const detail = err.detail as { error?: unknown }
    if (typeof detail.error === 'string') {
      return detail.error
    }
  }

  return undefined
}

/** Human-readable titles for error codes */
const ERROR_TITLES: Record<string, string> = {
  service_unavailable: 'Service Unavailable',
  not_found: 'Not Found',
  validation_error: 'Validation Error',
  unauthorized: 'Unauthorized',
  forbidden: 'Access Denied',
}

/**
 * Returns a human-readable title for an error code.
 *
 * @param error - The error object
 * @returns Human-readable title or "Error" as fallback
 *
 * @example
 * const title = getErrorTitle(error)
 * showAlert({ title, message: getErrorMessage(error) })
 */
export function getErrorTitle(error: unknown): string {
  const code = getErrorCode(error)
  if (code && ERROR_TITLES[code]) {
    return ERROR_TITLES[code]
  }
  if (error && typeof error === 'object') {
    const err = error as ApiError
    if (err.title && typeof err.title === 'string') {
      return err.title
    }
  }
  return 'Error'
}

/**
 * Detects if an error is related to admin/system configuration.
 *
 * These errors typically require administrator intervention and include:
 * - Missing API keys (OPENROUTER_API_KEY, etc.)
 * - Service configuration issues
 * - 503 Service Unavailable errors
 *
 * @param error - The error object to check
 * @returns true if the error is a configuration-related error
 *
 * @example
 * if (isAdminConfigurationError(error)) {
 *   return <EmptyStateServiceUnavailable showAdminHint={true} />
 * }
 */
export function isAdminConfigurationError(error: unknown): boolean {
  // 503 errors are typically configuration issues
  if (isServiceUnavailableError(error)) {
    return true
  }

  // Check message for common configuration keywords
  const message = getErrorMessage(error).toLowerCase()
  const configKeywords = ['api_key', 'api key', 'not configured', 'configuration', 'environment variable']

  return configKeywords.some((keyword) => message.includes(keyword))
}
