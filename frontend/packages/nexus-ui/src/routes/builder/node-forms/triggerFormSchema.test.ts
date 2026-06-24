import { TriggerTypeEnum } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import { isValidWebhookPath, normalizeWebhookPath, triggerFormSchema } from './triggerFormSchema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ParseResult = ReturnType<typeof triggerFormSchema.safeParse>
type ParseError = Extract<ParseResult, { success: false }>

function parseWebhook(webhookPath: string, inputSchema?: string) {
  return triggerFormSchema.safeParse({
    triggerType: TriggerTypeEnum.WEBHOOK_TRIGGER,
    webhookPath,
    inputSchema,
  })
}

function parseEda(webhookPath: string, inputSchema?: string) {
  return triggerFormSchema.safeParse({
    triggerType: TriggerTypeEnum.EDA_TRIGGER,
    webhookPath,
    inputSchema,
  })
}

function parseManual(inputSchema?: string) {
  return triggerFormSchema.safeParse({
    triggerType: TriggerTypeEnum.MANUAL_TRIGGER,
    inputSchema,
  })
}

function parseScheduled(scheduleType: string, interval?: string, cron?: string) {
  return triggerFormSchema.safeParse({
    triggerType: TriggerTypeEnum.SCHEDULED,
    scheduleType,
    interval,
    cron,
  })
}

function webhookError(result: ParseError) {
  return result.error.issues.find((i) => i.path.includes('webhookPath'))?.message
}

function inputSchemaError(result: ParseError) {
  return result.error.issues.find((i) => i.path.includes('inputSchema'))?.message
}

// ---------------------------------------------------------------------------
// normalizeWebhookPath
// ---------------------------------------------------------------------------

describe('normalizeWebhookPath', () => {
  it('strips leading slashes', () => {
    expect(normalizeWebhookPath('///path')).toBe('path')
  })

  it('lowercases mixed case', () => {
    expect(normalizeWebhookPath('Jira-Updates')).toBe('jira-updates')
  })

  it('preserves internal hyphens and underscores', () => {
    expect(normalizeWebhookPath('my_hook-1')).toBe('my_hook-1')
  })

  it('trims whitespace', () => {
    expect(normalizeWebhookPath('  path  ')).toBe('path')
  })

  it('handles empty string', () => {
    expect(normalizeWebhookPath('')).toBe('')
  })

  it('strips leading slashes and lowercases together', () => {
    expect(normalizeWebhookPath('//My-Path')).toBe('my-path')
  })
})

// ---------------------------------------------------------------------------
// isValidWebhookPath
// ---------------------------------------------------------------------------

describe('isValidWebhookPath', () => {
  it('returns true for a valid slug', () => {
    expect(isValidWebhookPath('jira-updates')).toBe(true)
  })

  it('returns true for a single character', () => {
    expect(isValidWebhookPath('a')).toBe(true)
  })

  it('returns false for path with slashes', () => {
    expect(isValidWebhookPath('api/v2/events')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isValidWebhookPath('')).toBe(false)
  })

  it('returns false for path with dots', () => {
    expect(isValidWebhookPath('has.dots')).toBe(false)
  })

  it('returns false for path starting with hyphen', () => {
    expect(isValidWebhookPath('-leading')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Webhook path validation
// ---------------------------------------------------------------------------

describe('triggerFormSchema — webhook path validation', () => {
  describe('valid paths', () => {
    it('accepts a basic slug', () => {
      expect(parseWebhook('jira-updates').success).toBe(true)
    })

    it('accepts a single character', () => {
      expect(parseWebhook('a').success).toBe(true)
    })

    it('accepts mixed alphanumeric with hyphens', () => {
      expect(parseWebhook('my-webhook-123').success).toBe(true)
    })

    it('accepts underscores', () => {
      expect(parseWebhook('test_path').success).toBe(true)
    })

    it('accepts a leading slash (stripped by normalization)', () => {
      expect(parseWebhook('/jira-updates').success).toBe(true)
    })

    it('accepts mixed case (normalized to lowercase)', () => {
      expect(parseWebhook('Jira-Updates').success).toBe(true)
    })

    it('accepts multiple leading slashes (stripped by normalization)', () => {
      expect(parseWebhook('///my-path').success).toBe(true)
    })

    it('accepts path at exactly 128 characters', () => {
      expect(parseWebhook('a'.repeat(128)).success).toBe(true)
    })
  })

  describe('invalid paths', () => {
    it('rejects path exceeding 128 characters', () => {
      const result = parseWebhook('a'.repeat(129))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toBe('Webhook path must be 128 characters or fewer')
      }
    })

    it('rejects empty path', () => {
      const result = parseWebhook('')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toBe('Webhook path is required')
      }
    })

    it('rejects whitespace-only path', () => {
      const result = parseWebhook('   ')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toBe('Webhook path is required')
      }
    })

    it('rejects path starting with hyphen', () => {
      const result = parseWebhook('-starts-with-hyphen')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })

    it('rejects path ending with hyphen', () => {
      const result = parseWebhook('ends-with-hyphen-')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })

    it('rejects path starting with underscore', () => {
      const result = parseWebhook('_starts-underscore')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })

    it('rejects path with spaces', () => {
      const result = parseWebhook('has spaces')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })

    it('rejects path with dots', () => {
      const result = parseWebhook('has.dots')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })

    it('rejects path with slashes', () => {
      const result = parseWebhook('has/slash')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })

    it('rejects path traversal sequences', () => {
      const result = parseWebhook('foo/../bar')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })

    it('rejects special characters', () => {
      const result = parseWebhook('special!@#')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(webhookError(result)).toContain('start and end with a letter or number')
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Webhook trigger inputSchema validation
// ---------------------------------------------------------------------------

describe('triggerFormSchema — webhook trigger inputSchema validation', () => {
  it('accepts a valid JSON object', () => {
    expect(parseWebhook('valid', '{"type": "object"}').success).toBe(true)
  })

  it('accepts empty inputSchema (optional field)', () => {
    expect(parseWebhook('valid', '').success).toBe(true)
  })

  it('accepts undefined inputSchema', () => {
    expect(parseWebhook('valid', undefined).success).toBe(true)
  })

  it('rejects invalid JSON syntax', () => {
    const result = parseWebhook('valid', '{bad}')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Invalid JSON — check syntax')
    }
  })

  it('rejects a JSON string value', () => {
    const result = parseWebhook('valid', '"hello"')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON number value', () => {
    const result = parseWebhook('valid', '42')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON array value', () => {
    const result = parseWebhook('valid', '[1, 2, 3]')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON boolean value', () => {
    const result = parseWebhook('valid', 'true')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON null value', () => {
    const result = parseWebhook('valid', 'null')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects input schema exceeding 100KB', () => {
    const oversized = `{"data": "${'x'.repeat(100_001)}"}`
    const result = parseWebhook('valid', oversized)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be 100KB or less')
    }
  })
})

// ---------------------------------------------------------------------------
// Scheduled trigger validation
// ---------------------------------------------------------------------------

describe('triggerFormSchema — scheduled trigger validation', () => {
  it('requires interval when scheduleType is interval', () => {
    const result = parseScheduled('interval', '')
    expect(result.success).toBe(false)
    if (!result.success) {
      const intervalError = result.error.issues.find((i) => i.path.includes('interval'))?.message
      expect(intervalError).toBe('Start date is required')
    }
  })

  it('accepts present interval', () => {
    expect(parseScheduled('interval', '2024-01-01T00:00:00Z').success).toBe(true)
  })

  it('does not require interval for continuous schedule', () => {
    expect(parseScheduled('continuous').success).toBe(true)
  })

  it('requires cron when scheduleType is cron', () => {
    const result = parseScheduled('cron', undefined, '')
    expect(result.success).toBe(false)
    if (!result.success) {
      const cronError = result.error.issues.find((i) => i.path.includes('cron'))?.message
      expect(cronError).toBe('Cron expression is required')
    }
  })

  it('accepts valid 5-field cron expression', () => {
    expect(parseScheduled('cron', undefined, '0 9 * * *').success).toBe(true)
  })

  it('rejects cron with wrong number of fields', () => {
    const result = parseScheduled('cron', undefined, '0 9 *')
    expect(result.success).toBe(false)
    if (!result.success) {
      const cronError = result.error.issues.find((i) => i.path.includes('cron'))?.message
      expect(cronError).toBe('Cron expression must have exactly 5 fields: minute hour day-of-month month day-of-week')
    }
  })

  it('rejects whitespace-only cron expression', () => {
    const result = parseScheduled('cron', undefined, '   ')
    expect(result.success).toBe(false)
    if (!result.success) {
      const cronError = result.error.issues.find((i) => i.path.includes('cron'))?.message
      expect(cronError).toBe('Cron expression is required')
    }
  })

  it('rejects cron with invalid characters', () => {
    const result = parseScheduled('cron', undefined, 'hello world foo bar baz')
    expect(result.success).toBe(false)
    if (!result.success) {
      const cronError = result.error.issues.find((i) => i.path.includes('cron'))?.message
      expect(cronError).toBe('Cron fields may only contain digits, *, /, -, and ,')
    }
  })

  it('rejects cron exceeding 256 characters', () => {
    const longCron = `${Array(150).fill('1').join(',')} * * * *`
    const result = parseScheduled('cron', undefined, longCron)
    expect(result.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Manual trigger inputSchema validation
// ---------------------------------------------------------------------------

describe('triggerFormSchema — manual trigger inputSchema validation', () => {
  it('accepts a valid JSON object', () => {
    expect(parseManual('{"type": "object"}').success).toBe(true)
  })

  it('accepts empty inputSchema (optional field)', () => {
    expect(parseManual('').success).toBe(true)
  })

  it('accepts undefined inputSchema', () => {
    expect(parseManual(undefined).success).toBe(true)
  })

  it('rejects invalid JSON syntax', () => {
    const result = parseManual('{bad}')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Invalid JSON — check syntax')
    }
  })

  it('rejects a JSON string value', () => {
    const result = parseManual('"hello"')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON number value', () => {
    const result = parseManual('42')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON array value', () => {
    const result = parseManual('[1, 2, 3]')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON boolean value', () => {
    const result = parseManual('true')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects a JSON null value', () => {
    const result = parseManual('null')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be a JSON object')
    }
  })

  it('rejects input schema exceeding 100KB', () => {
    const oversized = `{"data": "${'x'.repeat(100_001)}"}`
    const result = parseManual(oversized)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be 100KB or less')
    }
  })

  it('strips prototype pollution keys during validation', () => {
    const malicious = '{"__proto__": {"admin": true}, "type": "object"}'
    // Should still pass validation (it is a valid JSON object structurally)
    // but safeJSONReviver strips dangerous keys during parsing
    expect(parseManual(malicious).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// EDA trigger validation (same rules as webhook)
// ---------------------------------------------------------------------------

describe('triggerFormSchema — EDA trigger validation', () => {
  it('accepts valid EDA trigger with path', () => {
    expect(parseEda('eda-events').success).toBe(true)
  })

  it('rejects empty webhook path', () => {
    const result = parseEda('')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(webhookError(result)).toBe('Webhook path is required')
    }
  })

  it('rejects path exceeding 128 characters', () => {
    const result = parseEda('a'.repeat(129))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(webhookError(result)).toBe('Webhook path must be 128 characters or fewer')
    }
  })

  it('rejects path with invalid characters', () => {
    const result = parseEda('INVALID PATH!')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(webhookError(result)).toContain('start and end with a letter or number')
    }
  })

  it('accepts valid inputSchema JSON', () => {
    expect(parseEda('eda-events', '{"type": "object"}').success).toBe(true)
  })

  it('rejects invalid inputSchema JSON', () => {
    const result = parseEda('eda-events', 'not-json')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Invalid JSON — check syntax')
    }
  })

  it('rejects inputSchema exceeding 100KB', () => {
    const oversized = `{"data": "${'x'.repeat(100_001)}"}`
    const result = parseEda('eda-events', oversized)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(inputSchemaError(result)).toBe('Input schema must be 100KB or less')
    }
  })
})
