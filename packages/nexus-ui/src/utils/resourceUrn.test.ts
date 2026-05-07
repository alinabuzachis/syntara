import { describe, expect, it } from 'vitest'

import { parseResourceUrn } from './resourceUrn'

describe('parseResourceUrn', () => {
  it('parses a workflow URN', () => {
    const result = parseResourceUrn('urn:nexus:workflow:id=42')
    expect(result).toEqual({ type: 'workflow', id: '42', href: '/workflow-builder/42' })
  })

  it('parses an execution URN', () => {
    const result = parseResourceUrn('urn:nexus:execution:id=exec-1')
    expect(result).toEqual({ type: 'execution', id: 'exec-1', href: '/executions/exec-1' })
  })

  it('parses a credential URN', () => {
    const result = parseResourceUrn('urn:nexus:credential:id=cred-1')
    expect(result).toEqual({ type: 'credential', id: 'cred-1', href: '/configuration/credentials/cred-1' })
  })

  it('parses a user URN', () => {
    const result = parseResourceUrn('urn:nexus:user:id=u-1')
    expect(result).toEqual({ type: 'user', id: 'u-1', href: '/access-management/users/u-1' })
  })

  it('parses a group URN', () => {
    const result = parseResourceUrn('urn:nexus:group:id=g-1')
    expect(result).toEqual({ type: 'group', id: 'g-1', href: '/access-management/groups/g-1' })
  })

  it('parses a project URN', () => {
    const result = parseResourceUrn('urn:nexus:project:id=p-1')
    expect(result).toEqual({ type: 'project', id: 'p-1', href: '/access-management/projects/p-1' })
  })

  it('returns null href for unknown resource type', () => {
    const result = parseResourceUrn('urn:nexus:custom_thing:id=42')
    expect(result).toEqual({ type: 'custom_thing', id: '42', href: null })
  })

  it('returns null for invalid URN format', () => {
    expect(parseResourceUrn('not-a-valid-urn')).toBeNull()
  })

  it('returns null for URN with wrong prefix', () => {
    expect(parseResourceUrn('urn:other:workflow:id=1')).toBeNull()
  })

  it('handles id segment without id= prefix', () => {
    const result = parseResourceUrn('urn:nexus:workflow:some-raw-id')
    expect(result).toEqual({ type: 'workflow', id: 'some-raw-id', href: '/workflow-builder/some-raw-id' })
  })
})
