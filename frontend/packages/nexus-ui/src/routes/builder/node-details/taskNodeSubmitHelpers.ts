import { ExecutorTypeEnum, type Activity, type TaskActivity } from '@ansible/nexus-contracts'

import { parseJsonEnvironment } from '../../../utils/parseJsonEnvironment'
import type { ActionFormData as RegistryActionFormData } from '../hooks/useNodeCreation'

/**
 * SECURITY: JSON.parse reviver that strips prototype pollution keys during parsing.
 */
export function safeJSONReviver(key: string, value: unknown): unknown {
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
    return undefined
  }
  return value
}

/**
 * Parses a JSON object for HTTP headers: plain object with string values only.
 * Returns undefined if the input is not valid for API headers.
 */
function parseHttpHeadersJson(json: string): Record<string, string> | undefined {
  try {
    const parsed: unknown = JSON.parse(json, safeJSONReviver)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    const out: Record<string, string> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        return undefined
      }
      out[key] = value
    }
    return out
  } catch {
    return undefined
  }
}

export function buildRegistryActionInitialData(
  executor: string,
  parameters: Record<string, unknown>,
  taskData: TaskActivity
): Partial<RegistryActionFormData> {
  return {
    name: taskData.name,
    executor: executor === ExecutorTypeEnum.SCRIPT ? ExecutorTypeEnum.SCRIPT : ExecutorTypeEnum.HTTP_REQUEST,
    language: executor === ExecutorTypeEnum.SCRIPT ? (parameters.language as string | undefined) : undefined,
    code: executor === ExecutorTypeEnum.SCRIPT ? (parameters.code as string | undefined) : undefined,
    method:
      executor === ExecutorTypeEnum.HTTP_REQUEST
        ? (parameters.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined)
        : undefined,
    url: executor === ExecutorTypeEnum.HTTP_REQUEST ? (parameters.url as string | undefined) : undefined,
    headers:
      executor === ExecutorTypeEnum.HTTP_REQUEST && parameters.headers
        ? JSON.stringify(parameters.headers, null, 2)
        : undefined,
    body: (() => {
      if (executor !== ExecutorTypeEnum.HTTP_REQUEST || !parameters.body) {
        return undefined
      }
      return typeof parameters.body === 'string' ? parameters.body : JSON.stringify(parameters.body, null, 2)
    })(),
    credential_id: (parameters as { credential_id?: string }).credential_id ?? undefined,
    parameters:
      executor === ExecutorTypeEnum.SCRIPT && parameters.environment
        ? JSON.stringify(parameters.environment, null, 2)
        : undefined,
  }
}

export function buildRegistryActivityUpdate(taskData: TaskActivity, data: RegistryActionFormData): Activity {
  const apiHeaders =
    data.executor === ExecutorTypeEnum.HTTP_REQUEST && data.headers ? parseHttpHeadersJson(data.headers) : undefined

  let mergedApiHeaders: Record<string, string> | undefined
  if (data.executor !== ExecutorTypeEnum.HTTP_REQUEST || !data.authentication) {
    mergedApiHeaders = apiHeaders
  } else if (apiHeaders) {
    mergedApiHeaders = { ...apiHeaders, Authorization: data.authentication }
  } else {
    mergedApiHeaders = { Authorization: data.authentication }
  }

  const scriptEnv = data.executor === ExecutorTypeEnum.SCRIPT ? parseJsonEnvironment(data.parameters) : undefined

  return {
    ...taskData,
    name: data.name,
    type: data.executor === ExecutorTypeEnum.SCRIPT ? ExecutorTypeEnum.SCRIPT : ExecutorTypeEnum.HTTP_REQUEST,
    parameters:
      data.executor === ExecutorTypeEnum.SCRIPT
        ? {
            language: data.language ?? 'python',
            code: data.code!,
            ...(data.credential_id && { credential_id: data.credential_id }),
            ...(scriptEnv && { environment: scriptEnv }),
          }
        : {
            method: data.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
            url: data.url!,
            ...(mergedApiHeaders && { headers: mergedApiHeaders }),
            ...(data.body && {
              body: parseHttpBodyField(data.body),
            }),
            ...(data.credential_id && { credential_id: data.credential_id }),
          },
  } as Activity
}

function parseHttpBodyField(body: string): unknown {
  try {
    return JSON.parse(body, safeJSONReviver) as unknown
  } catch {
    return body
  }
}
