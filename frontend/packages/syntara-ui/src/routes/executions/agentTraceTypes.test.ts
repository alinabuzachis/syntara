import { describe, expect, it } from 'vitest'

import {
  extractAgentTrace,
  formatTraceFieldValue,
  formatTraceText,
  groupToolSteps,
  isPrimitiveArray,
  isToolCallGroup,
  type AgentTrace,
  type AgentTraceStep,
} from './agentTraceTypes'

const sampleTrace: AgentTrace = {
  model: 'test-model',
  total_tokens: 100,
  total_duration_ms: 500,
  steps: [
    { type: 'reasoning', timestamp: '2026-07-08T17:00:00Z', content: 'Thinking...' },
    {
      type: 'tool_call',
      timestamp: '2026-07-08T17:00:01Z',
      content: 'Calling search',
      tool_name: 'search',
      tool_input: { q: 'test' },
    },
    {
      type: 'tool_result',
      timestamp: '2026-07-08T17:00:02Z',
      content: 'Found results',
      tool_name: 'search',
      tool_output: 'Result data',
      status: 'success',
      duration_ms: 800,
    },
    { type: 'final_answer', timestamp: '2026-07-08T17:00:03Z', content: 'Done.' },
  ],
}

describe('extractAgentTrace', () => {
  it('returns null for null output', () => {
    expect(extractAgentTrace(null)).toBeNull()
  })

  it('returns null for undefined output', () => {
    expect(extractAgentTrace(undefined)).toBeNull()
  })

  it('returns null when no agent_trace key', () => {
    expect(extractAgentTrace({ foo: 'bar' })).toBeNull()
  })

  it('extracts agent_trace from top level', () => {
    const result = extractAgentTrace({ agent_trace: sampleTrace })
    expect(result).toEqual(sampleTrace)
  })

  it('extracts agent_trace from nested result', () => {
    const result = extractAgentTrace({ result: { agent_trace: sampleTrace } })
    expect(result).toEqual(sampleTrace)
  })

  it('prefers top-level agent_trace over nested', () => {
    const other: AgentTrace = { model: 'other', total_tokens: 0, total_duration_ms: 0, steps: [] }
    const result = extractAgentTrace({ agent_trace: sampleTrace, result: { agent_trace: other } })
    expect(result?.model).toBe('test-model')
  })

  it('returns null when agent_trace has no steps array', () => {
    expect(extractAgentTrace({ agent_trace: { model: 'x' } })).toBeNull()
  })

  it('falls back to default trace metadata when model/totals are invalid', () => {
    const result = extractAgentTrace({
      agent_trace: {
        model: 123,
        total_tokens: 'n/a',
        total_duration_ms: null,
        steps: [{ type: 'reasoning', timestamp: '2026-01-01T00:00:00Z', content: 'step' }],
      },
    })
    expect(result).toEqual({
      model: 'unknown',
      total_tokens: 0,
      total_duration_ms: 0,
      steps: [{ type: 'reasoning', timestamp: '2026-01-01T00:00:00Z', content: 'step' }],
    })
  })

  it('preserves structured response-schema objects in step content', () => {
    const structured = {
      incident_id: 'INC-4520',
      service: 'web-frontend',
      severity: 'high',
      summary: 'SSL errors with unpatched OpenSSL',
      likely_root_cause: 'OpenSSL patch lag',
      impacted_hosts: ['web1.example.com', 'web2.example.com'],
      recommended_next_steps: ['Patch OpenSSL'],
      needs_remediation_approval: true,
    }
    const result = extractAgentTrace({
      agent_trace: {
        model: 'test-model',
        total_tokens: 10,
        total_duration_ms: 100,
        steps: [
          {
            type: 'final_answer',
            timestamp: '2026-01-01T00:00:00Z',
            content: structured,
          },
        ],
      },
    })
    expect(result?.steps[0]?.content).toEqual(structured)
  })
})

describe('formatTraceText', () => {
  it('returns strings unchanged', () => {
    expect(formatTraceText('hello')).toBe('hello')
  })

  it('pretty-prints objects', () => {
    expect(formatTraceText({ a: 1 })).toBe('{\n  "a": 1\n}')
  })
})

describe('formatTraceFieldValue', () => {
  it('joins primitive arrays with commas for text fallback', () => {
    expect(formatTraceFieldValue(['web1', 'web2'])).toBe('web1, web2')
  })

  it('returns an em dash for empty primitive arrays', () => {
    expect(formatTraceFieldValue([])).toBe('—')
  })

  it('pretty-prints nested objects', () => {
    expect(formatTraceFieldValue({ region: 'us-east' })).toContain('"region": "us-east"')
  })
})

describe('isPrimitiveArray', () => {
  it('accepts arrays of strings, numbers, and booleans', () => {
    expect(isPrimitiveArray(['a', 1, true])).toBe(true)
  })

  it('rejects nested objects', () => {
    expect(isPrimitiveArray([{ a: 1 }])).toBe(false)
  })
})

describe('groupToolSteps', () => {
  it('groups consecutive tool_call + tool_result into ToolCallGroup', () => {
    const result = groupToolSteps(sampleTrace.steps)
    expect(result).toHaveLength(3)
    expect(isToolCallGroup(result[1])).toBe(true)
  })

  it('preserves reasoning steps as-is', () => {
    const result = groupToolSteps(sampleTrace.steps)
    expect(result[0]).toEqual(sampleTrace.steps[0])
  })

  it('preserves final_answer steps as-is', () => {
    const result = groupToolSteps(sampleTrace.steps)
    expect(result[2]).toEqual(sampleTrace.steps[3])
  })

  it('maps tool_result fields to ToolCallGroup', () => {
    const result = groupToolSteps(sampleTrace.steps)
    const group = result[1]
    if (!isToolCallGroup(group)) throw new Error('Expected ToolCallGroup')
    expect(group.toolName).toBe('search')
    expect(group.toolInput).toEqual({ q: 'test' })
    expect(group.toolOutput).toBe('Result data')
    expect(group.status).toBe('success')
    expect(group.durationMs).toBe(800)
  })

  it('creates ToolCallGroup with empty output for orphan tool_call', () => {
    const steps: AgentTraceStep[] = [
      { type: 'tool_call', timestamp: '2026-07-08T17:00:00Z', content: 'Calling tool', tool_name: 'x' },
    ]
    const result = groupToolSteps(steps)
    expect(result).toHaveLength(1)
    if (!isToolCallGroup(result[0])) throw new Error('Expected ToolCallGroup')
    expect(result[0].toolOutput).toBe('')
  })

  it('keeps orphan tool_result as raw step', () => {
    const steps: AgentTraceStep[] = [
      {
        type: 'tool_result',
        timestamp: '2026-07-08T17:00:00Z',
        content: 'Result',
        tool_name: 'x',
        tool_output: 'data',
      },
    ]
    const result = groupToolSteps(steps)
    expect(result).toHaveLength(1)
    expect(isToolCallGroup(result[0])).toBe(false)
  })

  it('handles multiple tool calls in sequence', () => {
    const steps: AgentTraceStep[] = [
      { type: 'tool_call', timestamp: '1', content: 'Call A', tool_name: 'a', tool_input: {} },
      { type: 'tool_result', timestamp: '2', content: 'Result A', tool_name: 'a', tool_output: 'out_a' },
      { type: 'tool_call', timestamp: '3', content: 'Call B', tool_name: 'b', tool_input: {} },
      { type: 'tool_result', timestamp: '4', content: 'Result B', tool_name: 'b', tool_output: 'out_b' },
    ]
    const result = groupToolSteps(steps)
    expect(result).toHaveLength(2)
    expect(isToolCallGroup(result[0])).toBe(true)
    expect(isToolCallGroup(result[1])).toBe(true)
  })

  it('handles failed tool status', () => {
    const steps: AgentTraceStep[] = [
      { type: 'tool_call', timestamp: '1', content: 'Call', tool_name: 'x' },
      { type: 'tool_result', timestamp: '2', content: 'Error', tool_name: 'x', tool_output: 'fail', status: 'failed' },
    ]
    const result = groupToolSteps(steps)
    if (!isToolCallGroup(result[0])) throw new Error('Expected ToolCallGroup')
    expect(result[0].status).toBe('failed')
  })

  it('returns empty array for empty steps', () => {
    expect(groupToolSteps([])).toEqual([])
  })

  it('handles parallel tool calls matched by call_id', () => {
    const steps: AgentTraceStep[] = [
      {
        type: 'tool_call',
        timestamp: '1',
        content: 'Call A',
        tool_name: 'search',
        call_id: 'call-0',
        tool_input: { q: 'a' },
      },
      {
        type: 'tool_call',
        timestamp: '2',
        content: 'Call B',
        tool_name: 'search',
        call_id: 'call-1',
        tool_input: { q: 'b' },
      },
      {
        type: 'tool_result',
        timestamp: '3',
        content: 'Result A',
        tool_name: 'search',
        call_id: 'call-0',
        tool_output: 'out_a',
      },
      {
        type: 'tool_result',
        timestamp: '4',
        content: 'Result B',
        tool_name: 'search',
        call_id: 'call-1',
        tool_output: 'out_b',
      },
    ]
    const result = groupToolSteps(steps)
    expect(result).toHaveLength(2)
    if (!isToolCallGroup(result[0]) || !isToolCallGroup(result[1])) throw new Error('Expected ToolCallGroups')
    expect(result[0].toolOutput).toBe('out_a')
    expect(result[1].toolOutput).toBe('out_b')
  })

  it('uses "unknown" when tool_name is missing', () => {
    const steps: AgentTraceStep[] = [
      { type: 'tool_call', timestamp: '1', content: 'Call', tool_input: {} },
      { type: 'tool_result', timestamp: '2', content: 'Result', tool_output: 'data' },
    ]
    const result = groupToolSteps(steps)
    if (!isToolCallGroup(result[0])) throw new Error('Expected ToolCallGroup')
    expect(result[0].toolName).toBe('unknown')
    expect(result[0].toolOutput).toBe('data')
  })

  it('falls back to content when tool_output is undefined', () => {
    const steps: AgentTraceStep[] = [
      { type: 'tool_call', timestamp: '1', content: 'Call', tool_name: 'x' },
      { type: 'tool_result', timestamp: '2', content: 'fallback content', tool_name: 'x' },
    ]
    const result = groupToolSteps(steps)
    if (!isToolCallGroup(result[0])) throw new Error('Expected ToolCallGroup')
    expect(result[0].toolOutput).toBe('fallback content')
  })

  it('handles parallel calls without call_id by matching tool_name FIFO', () => {
    const steps: AgentTraceStep[] = [
      { type: 'tool_call', timestamp: '1', content: 'Call A', tool_name: 'calc', tool_input: {} },
      { type: 'tool_call', timestamp: '2', content: 'Call B', tool_name: 'search', tool_input: {} },
      { type: 'tool_result', timestamp: '3', content: 'Result B', tool_name: 'search', tool_output: 'found' },
      { type: 'tool_result', timestamp: '4', content: 'Result A', tool_name: 'calc', tool_output: '42' },
    ]
    const result = groupToolSteps(steps)
    expect(result).toHaveLength(2)
    if (!isToolCallGroup(result[0]) || !isToolCallGroup(result[1])) throw new Error('Expected ToolCallGroups')
    expect(result[0].toolName).toBe('calc')
    expect(result[0].toolOutput).toBe('42')
    expect(result[1].toolName).toBe('search')
    expect(result[1].toolOutput).toBe('found')
  })

  it('falls back to pending tool-name queue when call_id has no direct match', () => {
    const steps: AgentTraceStep[] = [
      { type: 'tool_call', timestamp: '1', content: 'Call A', tool_name: 'calc', tool_input: {} },
      {
        type: 'tool_result',
        timestamp: '2',
        content: 'Result A',
        tool_name: 'calc',
        call_id: 'missing-call-id',
        tool_output: '42',
      },
    ]
    const result = groupToolSteps(steps)
    expect(result).toHaveLength(1)
    if (!isToolCallGroup(result[0])) throw new Error('Expected ToolCallGroup')
    expect(result[0].toolOutput).toBe('42')
  })
})

describe('isToolCallGroup', () => {
  it('returns true for ToolCallGroup', () => {
    expect(isToolCallGroup({ toolName: 'x', content: '', toolInput: {}, toolOutput: '' })).toBe(true)
  })

  it('returns false for AgentTraceStep', () => {
    expect(isToolCallGroup({ type: 'reasoning', timestamp: '', content: '' })).toBe(false)
  })
})
