import { describe, expect, it } from 'vitest'

import { extractAAPJobUrl, isAAPNodeType } from './aapJobUrl'

describe('isAAPNodeType', () => {
  it('returns true for aap_job_template', () => {
    expect(isAAPNodeType('aap_job_template')).toBe(true)
  })

  it('returns true for aap_workflow_job_template', () => {
    expect(isAAPNodeType('aap_workflow_job_template')).toBe(true)
  })

  it('returns false for other types', () => {
    expect(isAAPNodeType('script')).toBe(false)
    expect(isAAPNodeType('http_request')).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isAAPNodeType(undefined)).toBe(false)
  })
})

describe('extractAAPJobUrl', () => {
  it('extracts job_url from output data', () => {
    expect(extractAAPJobUrl({ job_url: 'https://aap.example.com/jobs/123' })).toBe('https://aap.example.com/jobs/123')
  })

  it('extracts workflow_job_url from output data', () => {
    expect(extractAAPJobUrl({ workflow_job_url: 'https://aap.example.com/workflow/456' })).toBe(
      'https://aap.example.com/workflow/456'
    )
  })

  it('prefers job_url over workflow_job_url', () => {
    expect(extractAAPJobUrl({ job_url: 'https://a.com/1', workflow_job_url: 'https://a.com/2' })).toBe(
      'https://a.com/1'
    )
  })

  it('returns null for null input', () => {
    expect(extractAAPJobUrl(null)).toBeNull()
  })

  it('returns null for undefined input', () => {
    expect(extractAAPJobUrl(undefined)).toBeNull()
  })

  it('returns null when no URL fields present', () => {
    expect(extractAAPJobUrl({ status: 'completed' })).toBeNull()
  })

  it('returns null for empty string URL', () => {
    expect(extractAAPJobUrl({ job_url: '' })).toBeNull()
  })

  it('rejects javascript: URLs', () => {
    expect(extractAAPJobUrl({ job_url: 'javascript:alert(1)' })).toBeNull()
  })

  it('rejects data: URLs', () => {
    expect(extractAAPJobUrl({ job_url: 'data:text/html,<script>alert(1)</script>' })).toBeNull()
  })
})
