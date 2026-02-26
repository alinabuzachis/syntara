import type { AAPFormData } from '../node-forms/AAPNodeForm'

/**
 * Parse and validate a positive integer from a string
 */
export function parsePositiveInt(value: string, min = 1): number | undefined {
  const parsed = Number.parseInt(value, 10)
  return !Number.isNaN(parsed) && parsed >= min ? parsed : undefined
}

/**
 * Parse comma-separated credential IDs into an array of positive integers
 */
function parseCredentials(value: string): number[] | undefined {
  const credentials = value
    .split(',')
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter((id) => !Number.isNaN(id) && id >= 1)
  return credentials.length > 0 ? credentials : undefined
}

/**
 * Parse and validate JSON extra variables
 */
function parseExtraVars(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * AAP job configuration type
 */
export interface AAPJobConfig {
  inventory?: number
  credentials?: number[]
  extraVars?: Record<string, unknown>
  limit?: string
  tags?: string
  skipTags?: string
  verbosity?: number
}

/**
 * Build optional AAP job configuration from form data
 */
export function buildAAPConfig(data: AAPFormData): AAPJobConfig | undefined {
  const config: AAPJobConfig = {}

  if (data.inventory) {
    const inventory = parsePositiveInt(data.inventory)
    if (inventory) config.inventory = inventory
  }

  if (data.credentials) {
    const credentials = parseCredentials(data.credentials)
    if (credentials) config.credentials = credentials
  }

  if (data.extraVars) {
    const extraVars = parseExtraVars(data.extraVars)
    if (extraVars) config.extraVars = extraVars
  }

  if (data.limit) config.limit = data.limit
  if (data.tags) config.tags = data.tags
  if (data.skipTags) config.skipTags = data.skipTags

  if (data.verbosity) {
    const verbosity = parsePositiveInt(data.verbosity, 0)
    if (verbosity !== undefined && verbosity <= 5) config.verbosity = verbosity
  }

  return Object.keys(config).length > 0 ? config : undefined
}
