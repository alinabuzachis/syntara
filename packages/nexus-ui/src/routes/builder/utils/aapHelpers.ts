import type { AAPJobTemplateConfig } from '../../../stores/workflowFactories'
import type { AAPFormData } from '../node-forms/AAPNodeForm'

/**
 * Validates that a job template ID is a valid positive integer.
 * @param jobTemplateId - The ID to validate
 * @returns The validated ID
 * @throws Error if validation fails
 */
export function validateJobTemplateId(jobTemplateId: number | undefined): number {
  if (!jobTemplateId || !Number.isInteger(jobTemplateId) || jobTemplateId < 1) {
    throw new Error('Job Template ID must be a valid positive integer')
  }
  return jobTemplateId
}

/**
 * Parse and validate a positive integer from a string
 */
function parsePositiveInt(value: string, min = 1): number | undefined {
  const parsed = Number.parseInt(value, 10)
  return !Number.isNaN(parsed) && parsed >= min ? parsed : undefined
}

/**
 * Parse and validate JSON extra variables
 */
function parseExtraVars(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

type ConfigKey = keyof AAPJobTemplateConfig

/**
 * Table-driven mapping from form fields to config fields.
 * Each entry: [formKey, configKey, predicate] — predicate determines whether to include.
 */
const stringFields: [keyof AAPFormData, ConfigKey][] = [
  ['limit', 'limit'],
  ['tags', 'tags'],
  ['skipTags', 'skipTags'],
  ['jobType', 'jobType'],
  ['executionEnvironment', 'executionEnvironment'],
  ['instanceGroup', 'instanceGroups'],
  ['labels', 'labels'],
]

const numberFields: [keyof AAPFormData, ConfigKey][] = [
  ['forks', 'forks'],
  ['timeout', 'timeout'],
  ['jobSlicing', 'jobSlicing'],
]

function collectStringFields(config: AAPJobTemplateConfig, data: AAPFormData): void {
  for (const [formKey, configKey] of stringFields) {
    const value = data[formKey]
    if (typeof value === 'string' && value) {
      ;(config as Record<string, unknown>)[configKey] = value
    }
  }
}

function collectNumberFields(config: AAPJobTemplateConfig, data: AAPFormData): void {
  for (const [formKey, configKey] of numberFields) {
    const value = data[formKey]
    if (typeof value === 'number' && Number.isFinite(value)) {
      ;(config as Record<string, unknown>)[configKey] = value
    }
  }
}

function setOrganizationAndTemplate(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (data.organization) config.organization = data.organization
  if (data.jobTemplateName) config.jobTemplateName = data.jobTemplateName
}

function setInventoryFields(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (data.inventoryId !== undefined && data.inventoryId !== null) {
    config.inventory = data.inventoryId
  }
  if (data.inventory) config.inventoryName = data.inventory
}

function setExtraVarsField(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (!data.extraVars) return
  const extraVars = parseExtraVars(data.extraVars)
  if (extraVars) config.extraVars = extraVars
}

function setVerbosityField(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (!data.verbosity) return
  const verbosity = parsePositiveInt(data.verbosity, 0)
  if (verbosity !== undefined && verbosity <= 5) config.verbosity = verbosity
}

function setCredentialFields(config: AAPJobTemplateConfig, data: AAPFormData): void {
  // Nexus credential for AAP authentication
  if (data.credentialId) config.credentialId = data.credentialId

  // AAP Controller credentials for job template launch (prompt-on-launch override)
  if (data.credentials && data.credentials.length > 0) {
    config.credentials = data.credentials
  }
}

function setDiffModeField(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (data.diffMode !== undefined) config.diffMode = data.diffMode
}

/**
 * Build optional AAP job configuration from form data.
 * The jobTemplateId and organization are handled separately by the caller.
 */
export function buildAAPConfig(data: AAPFormData): AAPJobTemplateConfig | undefined {
  const config: AAPJobTemplateConfig = {}

  setOrganizationAndTemplate(config, data)
  setInventoryFields(config, data)
  setExtraVarsField(config, data)
  setVerbosityField(config, data)
  setCredentialFields(config, data)
  setDiffModeField(config, data)
  collectStringFields(config, data)
  collectNumberFields(config, data)

  return Object.keys(config).length > 0 ? config : undefined
}
