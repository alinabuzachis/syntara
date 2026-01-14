/**
 * Parse comma-separated tools string into an array.
 * Trims whitespace and filters out empty strings.
 *
 * @param toolsString - Comma-separated string of tool names
 * @returns Array of tool names, or undefined if empty
 *
 * @example
 * parseToolsString('calculator, web_search') // ['calculator', 'web_search']
 * parseToolsString('  tool1  ,  , tool2  ') // ['tool1', 'tool2']
 * parseToolsString('') // undefined
 * parseToolsString(undefined) // undefined
 */
export function parseToolsString(toolsString?: string): string[] | undefined {
  if (!toolsString) return undefined

  const toolsArray = toolsString
    .split(',')
    .map((tool) => tool.trim())
    .filter((tool) => tool.length > 0)

  return toolsArray.length > 0 ? toolsArray : undefined
}
