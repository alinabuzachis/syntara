import type { ComponentType } from 'react'

/**
 * Node category constants
 * Use these constants instead of string literals for type safety
 */
export const NodeCategories = {
  TRIGGER: 'trigger',
  ACTION: 'action',
  LOGIC: 'logic',
  INTEGRATION: 'integration',
  APPROVAL: 'approval',
  OTHER: 'other',
} as const

/**
 * Node category type derived from the constants
 */
export type NodeCategory = (typeof NodeCategories)[keyof typeof NodeCategories]

/**
 * Metadata for a node category
 */
export type CategoryMetadata = {
  /** Unique category identifier */
  id: NodeCategory
  /** Display label for the category */
  label: string
  /** Icon component for the category */
  icon: ComponentType<{ className?: string }>
  /** Description of what this category contains */
  description: string
  /** Display order (lower = earlier) */
  order: number
  /** Color theme for the category (for potential future use) */
  color?: string
}
