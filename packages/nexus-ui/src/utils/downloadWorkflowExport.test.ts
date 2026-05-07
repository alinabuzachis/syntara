import { describe, expect, it, vi, beforeEach } from 'vitest'

import {
  downloadWorkflowDefinition,
  downloadWorkflowExportById,
  parseWorkflowFile,
  validateFileSize,
} from './downloadWorkflowExport'

// Mock workflowFetchClient
const mockGet = vi.fn<(...args: unknown[]) => Promise<{ data?: unknown; error?: unknown }>>()
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
  it('fetches workflow and triggers download', async () => {
    mockGet.mockResolvedValue({
      data: {
        name: 'My Workflow',
        version: {
          workflow_definition: { triggers: [], nodes: [], edges: [] },
        },
      },
    })

    await downloadWorkflowExportById('wf-123')

    expect(mockGet).toHaveBeenCalledWith('/workflows/{workflow_id}', {
      params: { path: { workflow_id: 'wf-123' } },
    })
    expect(lastAnchor.download).toBe('my_workflow.json')
    expect(lastAnchor.click).toHaveBeenCalled()
  })

  it('throws when fetch returns error', async () => {
    mockGet.mockResolvedValue({ error: { detail: 'Not found' } })

    await expect(downloadWorkflowExportById('wf-bad')).rejects.toThrow('Failed to fetch workflow details for export')
  })

  it('throws when workflow has no definition', async () => {
    mockGet.mockResolvedValue({ data: { name: 'Empty', version: {} } })

    await expect(downloadWorkflowExportById('wf-empty')).rejects.toThrow('Workflow has no definition to export')
  })

  it('uses fallback name when workflow has no name', async () => {
    mockGet.mockResolvedValue({
      data: {
        version: {
          workflow_definition: { triggers: [], nodes: [], edges: [] },
        },
      },
    })

    await downloadWorkflowExportById('wf-noname')

    expect(lastAnchor.download).toBe('workflow.json')
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
