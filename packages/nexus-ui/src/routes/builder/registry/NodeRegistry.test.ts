import { RhUiPlayIcon, RhUiPauseIcon } from '@patternfly/react-icons'
import { describe, it, expect, beforeEach } from 'vitest'

import { NodeRegistry } from './NodeRegistry'
import type { NodeTypeDefinition } from './NodeRegistry'

// Mock form component for testing
const MockForm = () => null

describe('NodeRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test
    NodeRegistry.clear()
  })

  describe('register', () => {
    it('should register a node type', () => {
      const definition: NodeTypeDefinition = {
        id: 'test-node',
        label: 'Test Node',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      }

      NodeRegistry.register(definition)

      const registered = NodeRegistry.get('test-node')
      expect(registered).toBeDefined()
      expect(registered?.label).toBe('Test Node')
    })

    it('should allow overwriting existing node', () => {
      NodeRegistry.register({
        id: 'duplicate',
        label: 'First',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      NodeRegistry.register({
        id: 'duplicate',
        label: 'Second',
        icon: RhUiPauseIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      const registered = NodeRegistry.get('duplicate')
      expect(registered?.label).toBe('Second')
    })

    it('should set default values for optional fields', () => {
      NodeRegistry.register({
        id: 'test',
        label: 'Test',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      const registered = NodeRegistry.get('test')
      expect(registered?.enabled).toBe(true)
      expect(registered?.order).toBe(100)
    })
  })

  describe('unregister', () => {
    it('should remove a registered node', () => {
      NodeRegistry.register({
        id: 'remove-me',
        label: 'Remove',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      expect(NodeRegistry.get('remove-me')).toBeDefined()

      const result = NodeRegistry.unregister('remove-me')
      expect(result).toBe(true)
      expect(NodeRegistry.get('remove-me')).toBeUndefined()
    })

    it('should return false when removing non-existent node', () => {
      const result = NodeRegistry.unregister('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('get', () => {
    it('should return undefined for non-existent node', () => {
      const result = NodeRegistry.get('non-existent')
      expect(result).toBeUndefined()
    })

    it('should return the correct node type', () => {
      NodeRegistry.register({
        id: 'specific',
        label: 'Specific Node',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      const result = NodeRegistry.get('specific')
      expect(result?.label).toBe('Specific Node')
    })
  })

  describe('getAll', () => {
    it('should return empty array when no nodes registered', () => {
      const result = NodeRegistry.getAll()
      expect(result).toEqual([])
    })

    it('should return all enabled nodes', () => {
      NodeRegistry.register({
        id: 'node1',
        label: 'Node 1',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      NodeRegistry.register({
        id: 'node2',
        label: 'Node 2',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
        enabled: false,
      })

      const result = NodeRegistry.getAll()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('node1')
    })

    it('should sort nodes by order', () => {
      NodeRegistry.register({
        id: 'third',
        label: 'Third',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
        order: 30,
      })

      NodeRegistry.register({
        id: 'first',
        label: 'First',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
        order: 10,
      })

      NodeRegistry.register({
        id: 'second',
        label: 'Second',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
        order: 20,
      })

      const result = NodeRegistry.getAll()
      expect(result[0].id).toBe('first')
      expect(result[1].id).toBe('second')
      expect(result[2].id).toBe('third')
    })
  })

  describe('getByCategory', () => {
    beforeEach(() => {
      NodeRegistry.register({
        id: 'trigger1',
        label: 'Trigger 1',
        icon: RhUiPlayIcon,
        category: 'trigger',
        formComponent: MockForm,
        onSubmit: () => {},
      })

      NodeRegistry.register({
        id: 'action1',
        label: 'Action 1',
        icon: RhUiPlayIcon,
        category: 'action',
        formComponent: MockForm,
        onSubmit: () => {},
      })

      NodeRegistry.register({
        id: 'trigger2',
        label: 'Trigger 2',
        icon: RhUiPlayIcon,
        category: 'trigger',
        formComponent: MockForm,
        onSubmit: () => {},
      })
    })

    it('should return nodes in specified category', () => {
      const triggers = NodeRegistry.getByCategory('trigger')
      expect(triggers).toHaveLength(2)
      expect(triggers.every((n) => n.category === 'trigger')).toBe(true)
    })

    it('should return empty array for non-existent category', () => {
      const result = NodeRegistry.getByCategory('other')
      expect(result).toEqual([])
    })
  })

  describe('search', () => {
    beforeEach(() => {
      NodeRegistry.register({
        id: 'api-call',
        label: 'API Call',
        icon: RhUiPlayIcon,
        keywords: ['http', 'rest', 'request'],
        formComponent: MockForm,
        onSubmit: () => {},
      })

      NodeRegistry.register({
        id: 'python-script',
        label: 'Python Script',
        icon: RhUiPlayIcon,
        keywords: ['python', 'code', 'script'],
        formComponent: MockForm,
        onSubmit: () => {},
      })
    })

    it('should find nodes by label', () => {
      const result = NodeRegistry.search('api')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('api-call')
    })

    it('should find nodes by keyword', () => {
      const result = NodeRegistry.search('python')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('python-script')
    })

    it('should find nodes by id', () => {
      const result = NodeRegistry.search('script')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('python-script')
    })

    it('should be case insensitive', () => {
      const result = NodeRegistry.search('API')
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('api-call')
    })

    it('should return empty array when no matches', () => {
      const result = NodeRegistry.search('nonexistent')
      expect(result).toEqual([])
    })

    it('should return all nodes for empty query', () => {
      const result = NodeRegistry.search('')
      expect(result).toHaveLength(2)
    })
  })

  describe('clear', () => {
    it('should remove all registered nodes', () => {
      NodeRegistry.register({
        id: 'node1',
        label: 'Node 1',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      NodeRegistry.register({
        id: 'node2',
        label: 'Node 2',
        icon: RhUiPlayIcon,
        formComponent: MockForm,
        onSubmit: () => {},
      })

      expect(NodeRegistry.getAll()).toHaveLength(2)

      NodeRegistry.clear()

      expect(NodeRegistry.getAll()).toHaveLength(0)
    })
  })
})
