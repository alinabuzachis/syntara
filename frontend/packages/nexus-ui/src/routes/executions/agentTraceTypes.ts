export type AgentTraceStepType = 'reasoning' | 'tool_call' | 'tool_result' | 'final_answer'

export type AgentTraceStep = {
  type: AgentTraceStepType
  timestamp: string
  content: string
  call_id?: string
  duration_ms?: number
  tokens?: number
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_output?: string
  status?: 'success' | 'failed'
}

export type AgentTrace = {
  model: string
  total_tokens: number
  total_duration_ms: number
  steps: AgentTraceStep[]
}

export type ToolCallGroup = {
  callId?: string
  toolName: string
  content: string
  toolInput: Record<string, unknown>
  toolOutput: string
  status?: 'success' | 'failed'
  tokens?: number
  durationMs?: number
}

export function extractAgentTrace(outputData: Record<string, unknown> | null | undefined): AgentTrace | null {
  if (!outputData) return null
  const nestedResult =
    typeof outputData.result === 'object' && outputData.result !== null
      ? (outputData.result as Record<string, unknown>)
      : undefined
  const trace = outputData.agent_trace ?? nestedResult?.agent_trace
  if (!trace || typeof trace !== 'object' || !Array.isArray((trace as AgentTrace).steps)) return null
  const candidate = trace as AgentTrace
  return {
    model: typeof candidate.model === 'string' ? candidate.model : 'unknown',
    total_tokens: typeof candidate.total_tokens === 'number' ? candidate.total_tokens : 0,
    total_duration_ms: typeof candidate.total_duration_ms === 'number' ? candidate.total_duration_ms : 0,
    steps: candidate.steps,
  }
}

function findMatchingCallIndex(
  step: AgentTraceStep,
  callIndexById: Map<string, number>,
  pendingByTool: Map<string, number[]>
): number | undefined {
  if (step.call_id) {
    const byId = callIndexById.get(step.call_id)
    if (byId !== undefined) return byId
  }
  return pendingByTool.get(step.tool_name ?? 'unknown')?.shift()
}

function registerToolCall(
  step: AgentTraceStep,
  grouped: Array<AgentTraceStep | ToolCallGroup>,
  callIndexById: Map<string, number>,
  pendingByTool: Map<string, number[]>
): void {
  const group: ToolCallGroup = {
    callId: step.call_id,
    toolName: step.tool_name ?? 'unknown',
    content: step.content,
    toolInput: step.tool_input ?? {},
    toolOutput: '',
    tokens: step.tokens,
  }
  const index = grouped.push(group) - 1
  if (step.call_id) {
    callIndexById.set(step.call_id, index)
  } else {
    const queue = pendingByTool.get(group.toolName) ?? []
    queue.push(index)
    pendingByTool.set(group.toolName, queue)
  }
}

export function groupToolSteps(steps: AgentTraceStep[]): Array<AgentTraceStep | ToolCallGroup> {
  const grouped: Array<AgentTraceStep | ToolCallGroup> = []
  const callIndexById = new Map<string, number>()
  const pendingByTool = new Map<string, number[]>()

  for (const step of steps) {
    if (step.type === 'tool_call') {
      registerToolCall(step, grouped, callIndexById, pendingByTool)
      continue
    }

    if (step.type === 'tool_result') {
      const matchIndex = findMatchingCallIndex(step, callIndexById, pendingByTool)
      if (matchIndex !== undefined) {
        const match = grouped[matchIndex]
        if (isToolCallGroup(match)) {
          match.toolOutput = step.tool_output ?? step.content
          match.durationMs = step.duration_ms
          match.status = step.status
          continue
        }
      }
    }

    grouped.push(step)
  }
  return grouped
}

export function isToolCallGroup(item: AgentTraceStep | ToolCallGroup): item is ToolCallGroup {
  return 'toolName' in item
}
