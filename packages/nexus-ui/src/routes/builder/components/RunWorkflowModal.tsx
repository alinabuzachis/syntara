import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from '@patternfly/react-core'
import { useCallback, useMemo, useState } from 'react'

import { useAlerts } from '../../../components/alerts'
import { ExpandableCodeEditor } from '../../../components/ExpandableCodeEditor'
import { JsonEditorControls } from '../../../components/JsonEditorToolbar'

type RunWorkflowModalProps = Readonly<{
  isOpen: boolean
  onClose: () => void
  onConfirm: (inputData: Record<string, unknown>, triggerNodeId?: string) => void
  workflowName: string
  triggerName: string
  triggerNodeId?: string
  inputSchema?: Record<string, unknown>
}>

type SchemaProperty = { type?: string; default?: unknown }

/**
 * Generate a JSON template from a JSON Schema definition.
 * Creates an object with default values based on the schema's property types.
 * Supports string, number, integer, boolean, array, and object types.
 * Uses schema-defined default values when available.
 *
 * @param schema - JSON Schema object defining the expected structure
 * @returns JSON string representation of the template (formatted with 2-space indent)
 *
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   properties: {
 *     name: { type: 'string' },
 *     count: { type: 'number', default: 10 }
 *   }
 * }
 * generateTemplateFromSchema(schema)
 * // Returns: '{\n  "name": "",\n  "count": 10\n}'
 * ```
 */
function defaultValueForType(prop: SchemaProperty): unknown {
  const raw = prop as Record<string, unknown>
  switch (prop.type) {
    case 'string':
      return ''
    case 'number':
    case 'integer':
      return 0
    case 'boolean':
      return false
    case 'array':
      return raw.items ? [JSON.parse(generateTemplateFromSchema(raw.items as Record<string, unknown>))] : []
    case 'object':
      return raw.properties ? JSON.parse(generateTemplateFromSchema(raw)) : {}
    case undefined:
    default:
      return null
  }
}

function generateTemplateFromSchema(schema: Record<string, unknown>): string {
  try {
    const properties = schema.properties as Record<string, SchemaProperty> | undefined
    if (schema.type === 'object' && properties) {
      const template: Record<string, unknown> = {}
      for (const [key, prop] of Object.entries(properties)) {
        template[key] = prop.default !== undefined ? prop.default : defaultValueForType(prop)
      }
      return JSON.stringify(template, null, 2)
    }
    return '{}'
  } catch {
    return '{}'
  }
}

/**
 * Check if a value matches a JSON Schema primitive type.
 * Validates that the value's runtime type corresponds to the expected JSON Schema type.
 *
 * @param value - The value to validate
 * @param expectedType - JSON Schema type string (string, number, integer, boolean, array, object)
 * @returns true if the value matches the expected type, false otherwise
 *
 * @remarks
 * - 'integer' requires `Number.isInteger(value)` — rejects non-integer numbers like 3.5
 * - 'object' excludes arrays and null values
 * - Unknown types default to true (permissive)
 */
function matchesJsonSchemaType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    case undefined:
    default:
      return true
  }
}

/**
 * Validate data against a JSON Schema definition.
 * Performs basic validation for required fields and type checking.
 *
 * @param data - The data object to validate
 * @param schema - JSON Schema object defining validation rules
 * @returns Array of error messages (empty if validation passes)
 *
 * @remarks
 * This is a simplified JSON Schema validator that checks:
 * - Required fields (must be present and non-null)
 * - Type matching for defined properties
 *
 * Limitations (intentionally lightweight to avoid a heavy schema-validation bundle):
 * - Does not validate nested objects or arrays recursively
 * - Does not enforce constraints: `minimum`, `maximum`, `pattern`, `enum`, `minItems`,
 *   `additionalProperties`, or `$ref` — these are silently accepted
 * - Does not resolve `$ref` references
 *
 * @example
 * ```typescript
 * const schema = {
 *   type: 'object',
 *   properties: { name: { type: 'string' } },
 *   required: ['name']
 * }
 * validateAgainstSchema({}, schema)
 * // Returns: ['Missing required field: "name"']
 * ```
 */
function validateAgainstSchema(data: Record<string, unknown>, schema: Record<string, unknown>): string[] {
  const errors: string[] = []
  if (schema.type !== 'object') return errors

  const required = (schema.required as string[] | undefined) ?? []
  for (const field of required) {
    if (!(field in data) || data[field] === undefined || data[field] === null) {
      errors.push(`Missing required field: "${field}"`)
    }
  }

  const properties = schema.properties as Record<string, SchemaProperty> | undefined
  if (properties) {
    for (const [key, prop] of Object.entries(properties)) {
      if (!(key in data) || data[key] === null || data[key] === undefined) continue
      if (prop.type && !matchesJsonSchemaType(data[key], prop.type)) {
        errors.push(`Field "${key}" should be ${prop.type}, got ${typeof data[key]}`)
      }
    }
  }

  return errors
}

export function RunWorkflowModal({
  isOpen,
  onClose,
  onConfirm,
  workflowName,
  triggerName,
  triggerNodeId,
  inputSchema,
}: RunWorkflowModalProps) {
  const { showError } = useAlerts()
  const initialCode = useMemo(() => (inputSchema ? generateTemplateFromSchema(inputSchema) : '{}'), [inputSchema])
  const [code, setCode] = useState(initialCode)

  const handleConfirm = useCallback(() => {
    let parsed: Record<string, unknown>
    try {
      const raw: unknown = JSON.parse(code.trim() || '{}')
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        showError({
          title: 'Invalid input',
          description: 'Input data must be a JSON object, not an array or primitive value.',
        })
        return
      }
      parsed = raw as Record<string, unknown>
    } catch {
      showError({
        title: 'Invalid JSON',
        description: 'The data must be valid JSON.',
      })
      return
    }

    if (inputSchema) {
      const errors = validateAgainstSchema(parsed, inputSchema)
      if (errors.length > 0) {
        showError({
          title: 'Validation failed',
          description: errors.join('; '),
        })
        return
      }
    }

    onConfirm(parsed, triggerNodeId)
  }, [code, onConfirm, showError, inputSchema, triggerNodeId])

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="medium" aria-label="Run workflow modal">
      <ModalHeader
        title={`Set mock output data for ${triggerName}`}
        description="This data will be accessible for downstream nodes."
      />
      <ModalBody>
        <ExpandableCodeEditor
          code={code}
          onCodeChange={setCode}
          language="json"
          height="300px"
          modalTitle="Edit data"
          ariaLabel="Workflow data editor"
          additionalControls={
            <JsonEditorControls
              code={code}
              onCodeChange={setCode}
              defaultCode={initialCode}
              downloadFilename={`${workflowName}-data.json`}
            />
          }
        />
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={handleConfirm}>
          Run
        </Button>
        <Button variant="link" onClick={onClose}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  )
}
