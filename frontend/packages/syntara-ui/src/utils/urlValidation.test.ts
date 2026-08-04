import { describe, expect, it } from 'vitest'

import { isValidAAPTemplateURL } from './urlValidation'

describe('isValidAAPTemplateURL', () => {
  describe('valid URLs', () => {
    it('accepts valid HTTPS AAP template URL', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/123/details')).toBe(true)
    })

    it('accepts valid HTTP AAP template URL for localhost', () => {
      expect(isValidAAPTemplateURL('http://localhost:8080/execution/templates/job-template/456/details')).toBe(true)
    })

    it('accepts valid HTTP AAP template URL for 127.0.0.1', () => {
      expect(isValidAAPTemplateURL('http://127.0.0.1:8080/execution/templates/job-template/456/details')).toBe(true)
    })

    it('accepts valid HTTP AAP template URL for ::1', () => {
      expect(isValidAAPTemplateURL('http://[::1]:8080/execution/templates/job-template/456/details')).toBe(true)
    })

    it('accepts URL with trailing slash', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/789/details/')).toBe(true)
    })

    it('accepts URL with port number', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com:8443/execution/templates/job-template/123/details')).toBe(
        true
      )
    })

    it('accepts URL with subdomain', () => {
      expect(isValidAAPTemplateURL('https://prod.aap.example.com/execution/templates/job-template/123/details')).toBe(
        true
      )
    })

    it('accepts URL with large template ID', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/999999999/details')).toBe(
        true
      )
    })
  })

  describe('invalid protocols', () => {
    it('rejects HTTP for non-loopback hosts (security)', () => {
      expect(isValidAAPTemplateURL('http://aap.example.com/execution/templates/job-template/123/details')).toBe(false)
    })

    it('rejects HTTP for IP address that is not loopback', () => {
      expect(isValidAAPTemplateURL('http://192.168.1.100/execution/templates/job-template/123/details')).toBe(false)
    })

    it('rejects javascript: protocol', () => {
      expect(isValidAAPTemplateURL('javascript:alert(1)')).toBe(false)
    })

    it('rejects data: protocol', () => {
      expect(isValidAAPTemplateURL('data:text/html,<script>alert(1)</script>')).toBe(false)
    })

    it('rejects file: protocol', () => {
      expect(isValidAAPTemplateURL('file:///etc/passwd')).toBe(false)
    })

    it('rejects ftp: protocol', () => {
      expect(isValidAAPTemplateURL('ftp://example.com/file')).toBe(false)
    })

    it('rejects protocol-relative URLs', () => {
      expect(isValidAAPTemplateURL('//evil.com/phishing')).toBe(false)
    })
  })

  describe('invalid paths', () => {
    it('rejects URL with wrong path (open redirect)', () => {
      expect(isValidAAPTemplateURL('https://evil.com/phishing')).toBe(false)
    })

    it('rejects URL with missing /execution prefix', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/templates/job-template/123/details')).toBe(false)
    })

    it('rejects URL with missing /templates segment', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/job-template/123/details')).toBe(false)
    })

    it('rejects URL with wrong resource type', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/workflow/123/details')).toBe(false)
    })

    it('rejects URL with missing /details suffix', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/123')).toBe(false)
    })

    it('rejects URL with non-numeric template ID', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/abc/details')).toBe(false)
    })

    it('rejects URL with negative template ID', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/-1/details')).toBe(false)
    })

    it('rejects URL with extra path segments', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/123/details/extra')).toBe(
        false
      )
    })

    it('rejects URL with query parameters appended', () => {
      expect(
        isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/123/details?redirect=evil.com')
      ).toBe(false)
    })
  })

  describe('XSS and injection vectors', () => {
    it('rejects URL with fragment (potential XSS)', () => {
      expect(isValidAAPTemplateURL('https://aap.example.com/execution/templates/job-template/123/details#xss')).toBe(
        false
      )
    })

    it('rejects URL with javascript in fragment', () => {
      expect(
        isValidAAPTemplateURL(
          'https://aap.example.com/execution/templates/job-template/123/details#javascript:alert(1)'
        )
      ).toBe(false)
    })

    it('rejects malformed URL with embedded protocol', () => {
      expect(
        isValidAAPTemplateURL('https://evil.com@aap.example.com/execution/templates/job-template/123/details')
      ).toBe(false)
    })
  })

  describe('edge cases', () => {
    it('rejects null', () => {
      expect(isValidAAPTemplateURL(null)).toBe(false)
    })

    it('rejects undefined', () => {
      expect(isValidAAPTemplateURL(undefined)).toBe(false)
    })

    it('rejects empty string', () => {
      expect(isValidAAPTemplateURL('')).toBe(false)
    })

    it('rejects whitespace-only string', () => {
      expect(isValidAAPTemplateURL('   ')).toBe(false)
    })

    it('rejects invalid URL syntax', () => {
      expect(isValidAAPTemplateURL('not a valid url')).toBe(false)
    })
  })
})
