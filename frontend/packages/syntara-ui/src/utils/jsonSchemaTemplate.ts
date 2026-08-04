type SchemaProperty = { type?: string; default?: unknown }

function isJsonSchema(schema: Record<string, unknown>): boolean {
  return schema.type === 'object' && schema.properties != null
}

function generateTemplateObject(schema: Record<string, unknown>): Record<string, unknown> | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null
  const properties = schema.properties as Record<string, SchemaProperty> | undefined
  if (schema.type !== 'object' || !properties) return null
  const template: Record<string, unknown> = {}
  for (const [key, prop] of Object.entries(properties)) {
    template[key] = prop.default === undefined ? defaultValueForType(prop) : prop.default
  }
  return template
}

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
      return raw.items ? [generateTemplateObject(raw.items as Record<string, unknown>) ?? {}] : []
    case 'object':
      return generateTemplateObject(raw) ?? {}
    case undefined:
    default:
      return null
  }
}

export function generateTemplateFromSchema(schema: Record<string, unknown>): string {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return '{}'
  try {
    const result = generateTemplateObject(schema)
    return result !== null ? JSON.stringify(result, null, 2) : '{}'
  } catch {
    return '{}'
  }
}

export function schemaToTemplateData(schema: Record<string, unknown>): Record<string, unknown> {
  if (isJsonSchema(schema)) {
    return generateTemplateObject(schema) ?? {}
  }
  return schema
}

export function schemaToTemplateJson(schema: Record<string, unknown>): string {
  if (isJsonSchema(schema)) {
    return generateTemplateFromSchema(schema)
  }
  return JSON.stringify(schema, null, 2)
}
