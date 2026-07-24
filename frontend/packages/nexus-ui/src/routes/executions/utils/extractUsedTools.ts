export type UsedTool = {
  name: string
  count: number
}

function isUsedTool(value: unknown): value is UsedTool {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.name === 'string' && entry.name.length > 0 && typeof entry.count === 'number' && entry.count > 0
}

function parseUsedTools(value: unknown): UsedTool[] | null {
  if (!Array.isArray(value)) return null
  const tools = value.filter(isUsedTool)
  return tools.length > 0 ? tools : null
}

/**
 * Find aggregated used_tools on agentic activity output_data.
 * Supports top-level used_tools and result.used_tools (signal payload shape).
 */
export function extractUsedTools(outputData: Record<string, unknown> | null | undefined): UsedTool[] | null {
  if (!outputData) return null

  const direct = parseUsedTools(outputData.used_tools)
  if (direct) return direct

  const result = outputData.result
  if (result && typeof result === 'object') {
    const nested = result as Record<string, unknown>
    const fromResult = parseUsedTools(nested.used_tools)
    if (fromResult) return fromResult
  }

  return null
}
