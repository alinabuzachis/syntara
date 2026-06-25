import { describe, expect, it } from 'vitest'

import { generateWebhookPath, isValidWebhookPath, normalizeWebhookPath } from './webhookPath'

describe('normalizeWebhookPath', () => {
  it('strips leading slashes and lowercases', () => {
    expect(normalizeWebhookPath('/Jira-Updates')).toBe('jira-updates')
  })

  it('trims whitespace', () => {
    expect(normalizeWebhookPath('  my-path  ')).toBe('my-path')
  })

  it('strips multiple leading slashes', () => {
    expect(normalizeWebhookPath('///my-path')).toBe('my-path')
  })

  it('returns empty string for empty input', () => {
    expect(normalizeWebhookPath('')).toBe('')
  })
})

describe('isValidWebhookPath', () => {
  it('accepts lowercase alphanumeric with hyphens', () => {
    expect(isValidWebhookPath('jira-updates')).toBe(true)
  })

  it('accepts lowercase alphanumeric with underscores', () => {
    expect(isValidWebhookPath('jira_updates')).toBe(true)
  })

  it('accepts single character', () => {
    expect(isValidWebhookPath('a')).toBe(true)
  })

  it('rejects paths starting with hyphen', () => {
    expect(isValidWebhookPath('-jira')).toBe(false)
  })

  it('rejects paths ending with hyphen', () => {
    expect(isValidWebhookPath('jira-')).toBe(false)
  })

  it('rejects paths with spaces', () => {
    expect(isValidWebhookPath('my path')).toBe(false)
  })

  it('rejects paths with uppercase', () => {
    expect(isValidWebhookPath('Jira')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(isValidWebhookPath('')).toBe(false)
  })

  it('accepts consecutive hyphens', () => {
    expect(isValidWebhookPath('foo--bar')).toBe(true)
  })

  it('accepts consecutive underscores', () => {
    expect(isValidWebhookPath('foo__bar')).toBe(true)
  })

  it('accepts mixed consecutive separators', () => {
    expect(isValidWebhookPath('foo-_bar')).toBe(true)
  })
})

describe('generateWebhookPath', () => {
  it('returns a valid webhook path', () => {
    const path = generateWebhookPath()
    expect(isValidWebhookPath(path)).toBe(true)
  })

  it('returns a path within the 128-character limit', () => {
    const path = generateWebhookPath()
    expect(path.length).toBeLessThanOrEqual(128)
  })

  it('returns unique values on successive calls', () => {
    const paths = new Set(Array.from({ length: 10 }, () => generateWebhookPath()))
    expect(paths.size).toBe(10)
  })
})
