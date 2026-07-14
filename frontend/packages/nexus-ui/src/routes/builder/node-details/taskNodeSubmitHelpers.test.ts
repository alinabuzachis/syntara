import { ExecutorTypeEnum, type TaskActivity } from '@ansible/nexus-contracts'
import { describe, expect, it } from 'vitest'

import type { ActionFormData } from '../hooks/useNodeCreation'

import { buildRegistryActionInitialData, buildRegistryActivityUpdate, safeJSONReviver } from './taskNodeSubmitHelpers'

const baseTask: TaskActivity = {
  id: 'task-1',
  name: 'Task',
  type: ExecutorTypeEnum.SCRIPT,
  parameters: { language: 'python', code: 'print(1)' },
} as TaskActivity

describe('taskNodeSubmitHelpers', () => {
  describe('safeJSONReviver', () => {
    it('strips prototype pollution keys', () => {
      const raw = '{"__proto__": {"x": 1}, "ok": true}'
      const parsed = JSON.parse(raw, safeJSONReviver) as Record<string, unknown>
      expect(parsed.ok).toBe(true)
      expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(false)
    })

    it('returns other keys unchanged', () => {
      expect(JSON.parse('{"a":1}', safeJSONReviver)).toEqual({ a: 1 })
    })

    it('strips constructor and prototype keys', () => {
      expect(JSON.parse('{"constructor":1,"prototype":2,"ok":true}', safeJSONReviver)).toEqual({ ok: true })
    })
  })

  describe('buildRegistryActionInitialData', () => {
    it('maps script executor fields', () => {
      const data = buildRegistryActionInitialData(ExecutorTypeEnum.SCRIPT, { language: 'ruby', code: '1' }, baseTask)
      expect(data).toMatchObject({
        name: 'Task',
        executor: ExecutorTypeEnum.SCRIPT,
        language: 'ruby',
        code: '1',
      })
    })

    it('maps http_request executor with object headers and object body', () => {
      const data = buildRegistryActionInitialData(
        ExecutorTypeEnum.HTTP_REQUEST,
        {
          method: 'GET',
          url: 'https://example.com',
          headers: { 'X-Test': '1' },
          body: { foo: 'bar' },
        },
        baseTask
      )
      expect(data.executor).toBe(ExecutorTypeEnum.HTTP_REQUEST)
      expect(data.method).toBe('GET')
      expect(data.url).toBe('https://example.com')
      expect(data.headers).toContain('X-Test')
      expect(data.body).toContain('foo')
    })

    it('uses string body as-is for http_request', () => {
      const data = buildRegistryActionInitialData(
        ExecutorTypeEnum.HTTP_REQUEST,
        { method: 'POST', url: 'https://x', body: 'plain' },
        baseTask
      )
      expect(data.body).toBe('plain')
    })

    it('includes credentialId when present on config', () => {
      const data = buildRegistryActionInitialData(
        ExecutorTypeEnum.HTTP_REQUEST,
        { method: 'GET', url: 'https://x', credential_id: 'cred-1' },
        baseTask
      )
      expect(data.credential_id).toBe('cred-1')
    })

    it('populates parameters from environment for script executor', () => {
      const data = buildRegistryActionInitialData(
        ExecutorTypeEnum.SCRIPT,
        { language: 'python', code: 'pass', environment: { MY_VAR: 'hello' } },
        baseTask
      )
      expect(data.parameters).toContain('MY_VAR')
      expect(data.parameters).toContain('hello')
    })

    it('omits parameters when no environment for script executor', () => {
      const data = buildRegistryActionInitialData(
        ExecutorTypeEnum.SCRIPT,
        { language: 'python', code: 'pass' },
        baseTask
      )
      expect(data.parameters).toBeUndefined()
    })
  })

  describe('buildRegistryActivityUpdate', () => {
    it('builds script activity config', () => {
      const data: ActionFormData = {
        name: 'S',
        executor: ExecutorTypeEnum.SCRIPT,
        language: 'python',
        code: 'pass',
      }
      const activity = buildRegistryActivityUpdate(baseTask, data)
      expect(activity.type).toBe(ExecutorTypeEnum.SCRIPT)
      expect(activity.name).toBe('S')
      expect((activity.parameters as { code: string }).code).toBe('pass')
    })

    it('parses headers and merges authentication for http_request', () => {
      const data: ActionFormData = {
        name: 'H',
        executor: ExecutorTypeEnum.HTTP_REQUEST,
        method: 'POST',
        url: 'https://api',
        headers: '{"X-A":"1"}',
        authentication: 'Bearer t',
      }
      const activity = buildRegistryActivityUpdate(baseTask, data)
      const config = activity.parameters as { headers: Record<string, string> }
      expect(config.headers).toEqual({ 'X-A': '1', Authorization: 'Bearer t' })
    })

    it('uses only Authorization when headers JSON is invalid but authentication is set', () => {
      const data: ActionFormData = {
        name: 'H',
        executor: ExecutorTypeEnum.HTTP_REQUEST,
        method: 'GET',
        url: 'https://api',
        headers: 'not json',
        authentication: 'Basic x',
      }
      const activity = buildRegistryActivityUpdate(baseTask, data)
      const config = activity.parameters as { headers: Record<string, string> }
      expect(config.headers).toEqual({ Authorization: 'Basic x' })
    })

    it('treats JSON null and non-string header values as absent headers', () => {
      const nullHeaders: ActionFormData = {
        name: 'H',
        executor: ExecutorTypeEnum.HTTP_REQUEST,
        method: 'GET',
        url: 'https://api',
        headers: 'null',
        authentication: 'Bearer t',
      }
      const nullActivity = buildRegistryActivityUpdate(baseTask, nullHeaders)
      expect((nullActivity.parameters as { headers: Record<string, string> }).headers).toEqual({
        Authorization: 'Bearer t',
      })

      const badValue: ActionFormData = {
        name: 'H',
        executor: ExecutorTypeEnum.HTTP_REQUEST,
        method: 'GET',
        url: 'https://api',
        headers: '{"a":1}',
        authentication: 'Bearer t',
      }
      const badActivity = buildRegistryActivityUpdate(baseTask, badValue)
      expect((badActivity.parameters as { headers: Record<string, string> }).headers).toEqual({
        Authorization: 'Bearer t',
      })
    })

    it('parses JSON body and falls back to raw string when invalid', () => {
      const data: ActionFormData = {
        name: 'H',
        executor: ExecutorTypeEnum.HTTP_REQUEST,
        method: 'GET',
        url: 'https://api',
        body: '{"a":1}',
      }
      const withJson = buildRegistryActivityUpdate(baseTask, data)
      expect((withJson.parameters as { body: unknown }).body).toEqual({ a: 1 })

      const dataRaw: ActionFormData = { ...data, body: 'not-json' }
      const withRaw = buildRegistryActivityUpdate(baseTask, dataRaw)
      expect((withRaw.parameters as { body: string }).body).toBe('not-json')
    })

    it('omits headers when http_request has no headers and no authentication', () => {
      const data: ActionFormData = {
        name: 'H',
        executor: ExecutorTypeEnum.HTTP_REQUEST,
        method: 'GET',
        url: 'https://api',
      }
      const activity = buildRegistryActivityUpdate(baseTask, data)
      expect((activity.parameters as { headers?: unknown }).headers).toBeUndefined()
    })

    it('includes environment when script has valid parameters JSON', () => {
      const data: ActionFormData = {
        name: 'S',
        executor: ExecutorTypeEnum.SCRIPT,
        language: 'python',
        code: 'pass',
        parameters: '{"MY_VAR": "value"}',
      }
      const activity = buildRegistryActivityUpdate(baseTask, data)
      expect((activity.parameters as { environment: Record<string, string> }).environment).toEqual({
        MY_VAR: 'value',
      })
    })

    it('omits environment when script has no parameters', () => {
      const data: ActionFormData = {
        name: 'S',
        executor: ExecutorTypeEnum.SCRIPT,
        language: 'python',
        code: 'pass',
      }
      const activity = buildRegistryActivityUpdate(baseTask, data)
      expect((activity.parameters as { environment?: unknown }).environment).toBeUndefined()
    })

    it('omits environment when script parameters is invalid JSON', () => {
      const data: ActionFormData = {
        name: 'S',
        executor: ExecutorTypeEnum.SCRIPT,
        language: 'python',
        code: 'pass',
        parameters: 'not json',
      }
      const activity = buildRegistryActivityUpdate(baseTask, data)
      expect((activity.parameters as { environment?: unknown }).environment).toBeUndefined()
    })
  })
})
