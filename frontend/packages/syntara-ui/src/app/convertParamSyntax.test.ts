import { describe, expect, it } from 'vitest'

import { convertWouterPathToTanStack } from './convertParamSyntax'

describe('convertWouterPathToTanStack', () => {
  it('returns an unchanged path when there are no params', () => {
    expect(convertWouterPathToTanStack('/workflows')).toBe('/workflows')
  })

  it('converts a single :param to $param', () => {
    expect(convertWouterPathToTanStack('/workflows/:workflowId')).toBe('/workflows/$workflowId')
  })

  it('converts multiple :params', () => {
    expect(convertWouterPathToTanStack('/users/:userId/groups/:groupId')).toBe('/users/$userId/groups/$groupId')
  })

  it('strips the trailing ? from an optional param', () => {
    expect(convertWouterPathToTanStack('/settings/:tab?')).toBe('/settings/$tab')
  })

  it('handles a param at the very end of the path', () => {
    expect(convertWouterPathToTanStack('/:id')).toBe('/$id')
  })

  it('handles a param in the middle of the path', () => {
    expect(convertWouterPathToTanStack('/users/:userId/edit')).toBe('/users/$userId/edit')
  })
})
