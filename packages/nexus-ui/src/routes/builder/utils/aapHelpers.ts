import { createAAPJobTemplateActivity } from '../../../stores/useWorkflowStore'
import type { AAPJobTemplateConfig } from '../../../stores/workflowFactories'
import type { AAPFormData } from '../node-forms/AAPNodeForm'

/**
 * Check whether any of the given values contain a ${...} expression placeholder.
 * Used to detect expression mode in AAP forms.
 */
export function hasExpressionValue(...values: (string | undefined)[]): boolean {
  return values.some((v) => v?.includes('${'))
}

/**
 * Build an AAP activity in expression mode (template name/org provided as expressions
 * that resolve at runtime rather than a concrete job_template_id).
 */
export function buildExpressionModeActivity(
  nodeId: string,
  name: string,
  data: AAPFormData
): ReturnType<typeof createAAPJobTemplateActivity> {
  // job_template_id is set to 0 as a placeholder — expression-mode nodes resolve
  // the template by name at runtime, so the ID is removed from config below.
  const config = buildAAPConfig(data)
  const activity = createAAPJobTemplateActivity(nodeId, name, 0, config)
  if (activity.config) {
    activity.config.job_template_name = data.job_template_name
    activity.config.organization_name = data.organization_name
    delete activity.config.job_template_id
  }
  return activity
}

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
 * Table-driven mapping from form fields (snake_case) to config fields (camelCase).
 * Form uses snake_case for Zod validation, config uses camelCase per JS convention.
 */
const stringFields: [keyof AAPFormData, ConfigKey][] = [
  ['limit', 'limit'],
  ['tags', 'tags'],
  ['skip_tags', 'skipTags'],
  ['job_type', 'jobType'],
  ['execution_environment', 'executionEnvironment'],
  ['instance_group', 'instanceGroups'],
  ['labels', 'labels'],
]

const numberFields: [keyof AAPFormData, ConfigKey][] = [
  ['forks', 'forks'],
  ['timeout', 'timeout'],
  ['job_slice_count', 'jobSliceCount'],
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
  if (data.organization_name) config.organizationName = data.organization_name
  if (data.job_template_name) config.jobTemplateName = data.job_template_name
}

function setInventoryFields(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (data.inventory_id !== undefined && data.inventory_id !== null) {
    config.inventoryId = data.inventory_id
  }
  if (data.inventory_name) config.inventoryName = data.inventory_name
}

function setExtraVarsField(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (!data.extra_vars) return
  const extraVars = parseExtraVars(data.extra_vars)
  if (extraVars) config.extraVars = extraVars
}

function setVerbosityField(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (!data.verbosity) return
  const verbosity = parsePositiveInt(data.verbosity, 0)
  if (verbosity !== undefined && verbosity <= 5) config.verbosity = verbosity
}

function setCredentialFields(config: AAPJobTemplateConfig, data: AAPFormData): void {
  // Nexus credential for AAP authentication
  if (data.credential_id) config.credentialId = data.credential_id

  // AAP Controller credentials for job template launch (prompt-on-launch override)
  if (data.job_credentials && data.job_credentials.length > 0) {
    config.jobCredentials = data.job_credentials
  }
}

function setDiffModeField(config: AAPJobTemplateConfig, data: AAPFormData): void {
  if (data.diff_mode !== undefined) config.diffMode = data.diff_mode
}

/**
 * Build optional AAP job configuration from form data.
 * Form data uses snake_case (from Zod), config uses camelCase (JS convention).
 * The jobTemplateId is handled separately by the caller.
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
