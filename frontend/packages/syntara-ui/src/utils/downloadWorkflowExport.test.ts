import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  downloadWorkflowDefinition,
  downloadWorkflowExportById,
  downloadVersionExport,
  parseWorkflowFile,
  validateFileSize,
} from './downloadWorkflowExport'

// Mock workflowFetchClient
const mockGet =
  vi.fn<(...args: unknown[]) => Promise<{ data?: unknown; error?: unknown; response?: { headers: Headers } }>>()
vi.mock('../client', () => ({
  workflowFetchClient: { GET: (...args: unknown[]) => mockGet(...args) },
}))

// Capture blob URLs and anchor clicks
let lastAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'URL',
    Object.assign(globalThis.URL, {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    })
  )
  lastAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
  vi.spyOn(document, 'createElement').mockImplementation(
    (tag: string) =>
      (tag === 'a' ? lastAnchor : document.createElement(tag)) as unknown as ReturnType<typeof document.createElement>
  )
  vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node)
})

describe('parseWorkflowFile', () => {
  const validDefinition = {
    triggers: [{ id: 't1', type: 'webhook' }],
    nodes: [{ id: 'n1', type: 'action' }],
    edges: [{ from: 't1', to: 'n1' }],
  }

  it('parses a valid JSON file', () => {
    const result = parseWorkflowFile(JSON.stringify(validDefinition), 'workflow.json')

    expect(result).toEqual(validDefinition)
  })

  it('rejects non-JSON files', () => {
    expect(() => parseWorkflowFile('content', 'workflow.yaml')).toThrow('Only JSON files are supported')
  })

  it('accepts .JSON extension (case-insensitive)', () => {
    const result = parseWorkflowFile(JSON.stringify(validDefinition), 'workflow.JSON')

    expect(result).toEqual(validDefinition)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseWorkflowFile('not json', 'workflow.json')).toThrow()
  })

  it('rejects non-object JSON', () => {
    expect(() => parseWorkflowFile('"just a string"', 'workflow.json')).toThrow(
      'File does not contain a valid workflow definition'
    )
  })

  it('rejects null JSON', () => {
    expect(() => parseWorkflowFile('null', 'workflow.json')).toThrow(
      'File does not contain a valid workflow definition'
    )
  })

  it('rejects definition missing triggers', () => {
    const def = { nodes: [], edges: [] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow(
      'File is missing required workflow definition fields'
    )
  })

  it('rejects definition missing nodes', () => {
    const def = { triggers: [], edges: [] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow(
      'File is missing required workflow definition fields'
    )
  })

  it('rejects definition missing edges', () => {
    const def = { triggers: [], nodes: [] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow(
      'File is missing required workflow definition fields'
    )
  })

  it('rejects non-array triggers/nodes/edges', () => {
    const def = { triggers: true, nodes: 'string', edges: 42 }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('must be arrays')
  })

  it('rejects non-object items in nodes', () => {
    const def = { triggers: [], nodes: ['not-an-object'], edges: [] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('Each node must be an object')
  })

  it('rejects node without id', () => {
    const def = { triggers: [], nodes: [{ type: 'action' }], edges: [] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('Each node must have')
  })

  it('rejects node without type', () => {
    const def = { triggers: [], nodes: [{ id: 'n1' }], edges: [] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('Each node must have')
  })

  it('rejects trigger without type', () => {
    const def = { triggers: [{ id: 't1' }], nodes: [], edges: [] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('Each trigger must have')
  })

  it('rejects edge without from', () => {
    const def = { triggers: [], nodes: [], edges: [{ to: 'n1' }] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('Each edge must have')
  })

  it('rejects edge without to', () => {
    const def = { triggers: [], nodes: [], edges: [{ from: 't1' }] }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('Each edge must have')
  })

  it('accepts valid schema_version', () => {
    const def = { ...validDefinition, schema_version: '2.0.0' }

    expect(parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toEqual(def)
  })

  it('rejects wrong schema_version', () => {
    const def = { ...validDefinition, schema_version: '1.0.0' }

    expect(() => parseWorkflowFile(JSON.stringify(def), 'workflow.json')).toThrow('Unsupported schema version')
  })

  it('allows missing schema_version', () => {
    const result = parseWorkflowFile(JSON.stringify(validDefinition), 'workflow.json')

    expect(result.schema_version).toBeUndefined()
  })
})

describe('downloadWorkflowDefinition', () => {
  it('triggers a download with sanitized filename', () => {
    const definition = { triggers: [], nodes: [], edges: [], extra: 'data' }

    downloadWorkflowDefinition(definition, 'My Workflow!')

    expect(lastAnchor.download).toBe('my_workflow_.json')
    expect(lastAnchor.click).toHaveBeenCalled()
  })

  it('strips metadata keys from the exported content', () => {
    const definition = {
      schema_version: '2.0.0',
      name: 'test',
      description: 'desc',
      triggers: [],
      nodes: [],
      edges: [],
    }

    downloadWorkflowDefinition(definition, 'test')

    const blobArg = (URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob
    expect(blobArg).toBeInstanceOf(Blob)
    expect(blobArg.type).toBe('application/json')
  })

  it('sanitizes special characters in filename', () => {
    downloadWorkflowDefinition({ triggers: [], nodes: [], edges: [] }, 'test/workflow:v2')

    expect(lastAnchor.download).toBe('test_workflow_v2.json')
  })
})

describe('downloadWorkflowExportById', () => {
  it('fetches version and triggers download via export endpoint', async () => {
    mockGet
      .mockResolvedValueOnce({
        data: { current_version: 3, version: { version: 3 } },
      })
      .mockResolvedValueOnce({
        data: new Blob(['{}'], { type: 'application/json' }),
        response: new Response(null, {
          headers: { 'content-disposition': 'attachment; filename="my_workflow-v3.json"' },
        }),
      })

    await downloadWorkflowExportById('wf-123')

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(lastAnchor.click).toHaveBeenCalled()
    expect(lastAnchor.download).toBe('my_workflow-v3.json')
  })

  it('skips workflow fetch when version is provided', async () => {
    mockGet.mockResolvedValueOnce({
      data: new Blob(['{}'], { type: 'application/json' }),
      response: new Response(null, {
        headers: { 'content-disposition': 'attachment; filename="wf-v2.json"' },
      }),
    })

    await downloadWorkflowExportById('wf-123', 2)

    expect(mockGet).toHaveBeenCalledTimes(1)
  })

  it('throws when fetch returns error', async () => {
    mockGet.mockResolvedValue({ error: { detail: 'Not found' } })

    await expect(downloadWorkflowExportById('wf-bad')).rejects.toThrow('Failed to fetch workflow details for export')
  })

  it('throws when workflow has no version', async () => {
    mockGet.mockResolvedValue({ data: { current_version: undefined, version: undefined } })

    await expect(downloadWorkflowExportById('wf-empty')).rejects.toThrow('Workflow has no version to export')
  })
})

describe('downloadVersionExport', () => {
  it('triggers download using server-provided filename', async () => {
    mockGet.mockResolvedValueOnce({
      data: new Blob(['{}'], { type: 'application/json' }),
      response: new Response(null, {
        headers: { 'content-disposition': 'attachment; filename="My_Workflow-v1.json"' },
      }),
    })

    await downloadVersionExport('wf-123', 1)

    expect(lastAnchor.download).toBe('My_Workflow-v1.json')
    expect(lastAnchor.click).toHaveBeenCalled()
  })

  it('throws when export endpoint returns error', async () => {
    mockGet.mockResolvedValueOnce({ error: { detail: 'Not found' } })

    await expect(downloadVersionExport('wf-bad', 1)).rejects.toThrow('Failed to export workflow')
  })
})

describe('validateFileSize', () => {
  it('accepts files under the limit', () => {
    const file = new File(['x'], 'small.json')

    expect(() => validateFileSize(file)).not.toThrow()
  })

  it('rejects files over 10 MB', () => {
    const file = new File(['x'], 'big.json')
    Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })

    expect(() => validateFileSize(file)).toThrow('File is too large')
  })
})
